<div align="right">

[简体中文](README.md) | English

</div>

# MCSerAuth

An all-in-one **community forum + external authentication server** for third-party
Minecraft: Java Edition servers.

The auth side implements the Commons-Designs server protocol, so launchers such as
**HMCL, PCL2 and XMCL work out of the box** (external login / authlib-injector).
The community side provides a forum and player profiles; both share the same account
system and infrastructure, deployed as a single unit. SQLite by default, with
MySQL 8.0+ / PostgreSQL 16+ supported in production.

> **Status**: core features are complete, baseline release
> [v1.0.0](https://github.com/Logist1024/MCSerAuth/releases/tag/v1.0.0); production
> readiness keeps improving (multi-database CI matrix, deployment & backup,
> observability, and an HTTP e2e test layer are all in place).
>
> **Implemented**: better-auth web sessions, OAuth authorization code + PKCE,
> registered OAuth clients with scoped SSO (basic/player/email, with a userinfo
> endpoint), launcher token rotation, session service (`joinServer` / `hasJoined`),
> profile lookup, skin/cape upload with signed delivery, authlib-injector direct
> login; forum (categories / threads / replies / likes / notifications / reports /
> image uploads / guest browsing / sorting & title search), public profile pages,
> game account management (profile / rename / texture switching), appearance
> settings (light/dark/system, five accent themes, emoji icons), four-level roles +
> 8 delegable permissions + key-protected super console, captcha, growth system
> (levels / titles / check-in / points / shop / tipping / home banners), password
> reset, RSS/sitemap, three-database support.

## Tech stack

| Layer    | Choice                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Runtime  | Node.js 22 LTS · pnpm 9 · TypeScript 6 (full-repo ESM)                                                    |
| Backend  | NestJS 12 · better-auth (accounts) · Drizzle ORM · SQLite / MySQL 8.0+ / PostgreSQL 16+                   |
| Frontend | Next.js 16 App Router · React 19 (rendering only — all business logic lives in the NestJS API)            |
| Contract | NestJS Swagger → `docs/openapi.json`; provisional protocol fields live in `packages/shared/src/protocol/` |
| Quality  | ESLint · Prettier · husky + lint-staged · GitHub Actions                                                  |

## Repository layout

```
MCSerAuth/
├── apps/
│   ├── server/              NestJS monolith backend
│   │   ├── src/config/      env loading + zod validation (single entry point)
│   │   ├── src/common/      filters/interceptors/pipes/log redaction/Swagger setup
│   │   ├── src/db/          Drizzle instance + single logical model + 3 generated schemas (31 tables)
│   │   ├── src/modules/     auth · session · profiles · forum · user · admin · site
│   │   │                    · growth · captcha · mail · maintenance · health
│   │   └── drizzle/         per-dialect migration SQL (sqlite/ · mysql/ · postgres/)
│   └── web/                 Next.js App Router (rendering layer)
├── packages/
│   └── shared/              cross-app types/DTOs/error codes/zod schemas (single source of truth)
├── deploy/                  production config examples: Caddy / pm2 / cron / logrotate
├── docs/                    deployment / database / OAuth integration guides + OpenAPI artifact
└── .github/workflows/ci.yml
```

## Quick start

Requires Node.js 22 (pinned in `.nvmrc`) and pnpm via corepack.

```bash
git clone https://github.com/Logist1024/MCSerAuth.git && cd MCSerAuth
corepack enable                 # or use corepack pnpm <cmd>
pnpm install
cp .env.example apps/server/.env   # optional: dev defaults work without it
pnpm db:migrate                    # create DB + apply all migrations (dialect picked from DATABASE_URL)
pnpm dev                           # server on :8000, web on :3000
```

Once running:

| URL                                                    | What it is                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| <http://localhost:3000>                                | Server home page (forum / game accounts entry)              |
| <http://localhost:3000/forum>                          | Forum (categories, threads, sort/search, post, reply, like) |
| <http://localhost:3000/textures>                       | Game account management (profile / skins / capes / guide)   |
| <http://localhost:3000/admin>                          | Admin console (reviewer / admin / superadmin)               |
| <http://localhost:3000/sitemap.xml> / `/forum/rss.xml` | SEO & RSS                                                   |
| <http://localhost:8000/health>                         | Health check (unified `{code:0,data}` envelope)             |
| <http://localhost:8000/health/live> · `/health/ready`  | liveness (process) · readiness (503 when DB is down)        |
| <http://localhost:8000/docs>                           | Swagger UI (full endpoint contract)                         |
| <http://localhost:8000/docs/json>                      | OpenAPI JSON                                                |

Smoke test (sign-up → session):

```bash
curl -c jar.txt -X POST http://localhost:8000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"S3cure!Passw0rd","name":"Tester"}'
curl -b jar.txt http://localhost:8000/api/auth/get-session
```

### Auth flow (shared by browser & launcher)

1. The site registers/signs in at `/api/auth/*`, giving a better-auth cookie session.
2. The launcher opens `GET /api/oauth/entry?client_id=…&redirect_uri=…&state=…`;
   NestJS serves the page directly: a login form when signed out, a consent
   screen when signed in.
3. On consent, `POST /api/oauth/entry` validates the same-origin cookie,
   `redirect_uri` and PKCE, issues a one-time authorization code, and 302s back
   to `redirect_uri?code=…&state=…`.
4. The launcher calls `POST /api/oauth/authenticate` (`code` + `code_verifier`)
   to exchange for Bearer access/refresh tokens; then `POST /api/oauth/refresh`
   to rotate and `GET /api/user/profiles/me` to read the account and player.
5. First authorization auto-creates a 1:1 player for the account (32-char
   lowercase UUID); tokens are stored as SHA-256 hashes only.

Browser demo: the "web session" and "start an OAuth authorization" panels on
<http://localhost:3000> run the whole chain, with the callback page showing
`/me` and refresh rotation results.

**Password reset**: "Forgot password?" on the login page → `/forgot-password`
(submits email after captcha) → `POST /api/auth/request-password-reset` sends a
one-time link valid for 1 hour → the email link goes through
`GET /api/auth/reset-password/{token}` with a 302 to `/reset-password?token=…` →
`POST /api/auth/reset-password` sets the new password. Unknown emails also
return 200 (anti-enumeration); on success all web sessions are invalidated
immediately, while launcher tokens and game identities are unaffected.

### Session service & textures

**Session service (game server integration)**

1. First super admin: sign up, then run `pnpm admin:grant you@example.com superadmin`
   (from the repo root or `apps/server`), and call the admin API with that account.
2. Register a game server (web cookie session + `superadmin` role):
   ```bash
   curl -b jar.txt -X POST http://localhost:8000/api/admin/servers \
     -H 'Content-Type: application/json' \
     -d '{"serverId":"survival-1","name":"Survival Zone 1"}'
   ```
   The `secret` in the response is shown once (only its hash is stored; the
   current protocol does not require sending it).
3. Launcher flow: after getting an access token, call
   `POST /api/session/joinServer {accessToken, selectedProfile, serverId}` (204);
   the game server then calls `GET|POST /api/session/hasJoined?username=…&serverId=…&ip=…`,
   which returns a GameProfile with the `textures` property on a hit, 204
   otherwise, and 403 for banned players.
4. Profile lookup (no auth): `GET /api/profiles/minecraft/{name}`,
   `POST /api/profiles/minecraft {"names":[…]}`, `GET /api/profiles/{uuid}`.

**Skins & capes**

1. Sign in and upload PNGs at game account management `/textures`:
   skins 64×32 / 64×64 (classic|slim), capes 64×32, files ≤ 1 MiB;
   HD textures are not supported.
2. Uploads take effect immediately (no pre-moderation); the page offers a 3D
   preview, a personal gallery with switching and deletion. The gallery is
   private — other players' textures are never listed or usable.
3. The current texture is delivered via `GameProfile.properties.textures` as a
   short-lived signed URL (`/api/minecraft/profile/textures/{id}`); deleting the
   current texture falls back to the default appearance.
4. Reviewers can take down / restore offending textures at `/admin?tab=textures`
   (post-moderation).

### Launcher direct login (authlib-injector / HMCL)

Launchers that only speak Yggdrasil (HMCL, PCL2, XMCL) can log in with website
accounts directly, no browser OAuth needed:

1. **Auth server URL: `http://localhost:8000/api`** (the API root, not `/api/oauth/entry`).
2. Username is the **website email**, password the website password; the first
   login auto-creates a 1:1 player.
3. HMCL: Settings → Accounts → Add account → "External login";
   PCL2: Settings → Launcher → Game accounts.

Implemented: `GET /api` metadata, `/api/authserver/{authenticate,refresh,validate,invalidate}`,
`/api/sessionserver/session/minecraft/{join,hasJoined,profile/{uuid}}`,
`/api/api/profiles/minecraft`. Tokens share the same origin as the OAuth flow —
issued by the same authorization chain, stored in the same `token` table, with
identical rotation and invalidation semantics.

Two differences to know: `/api/sessionserver/*` accepts any handshake hash per
Yggdrasil semantics (no server allow-list), while the native `/api/session/*`
still requires an admin-registered `serverId`; the metadata does not provide
`signaturePublickey`, so texture properties carry no signature. Field
definitions live in `packages/shared/src/protocol/`.

> Joining a server requires authlib-injector on **both** the client and the
> Paper side (server `online-mode=false` +
> `-javaagent:authlib-injector.jar=http://localhost:8000/api`). This repository
> ships no Paper plugin.

### Forum & operations

- **Forum**: `/forum` category cards and thread list (latest-reply / latest /
  hot sorting, title search); `/forum/{slug}` paginated by category;
  `/forum/post/{id}` thread detail (Markdown, images, likes, reports, replies);
  `/forum/new` to post; authors can edit/delete their own threads and replies.
- **Appearance**: a header popover switches light/dark/system, five accent
  colors and SVG/Emoji icon styles; preferences stay in the browser.
- **Default categories**: on first start with an empty `category` table, the
  service seeds four default boards automatically.
- **Game account management** (`/textures`): official-profile-style layout —
  profile header (3D preview, name, UUID), rename (30-day cooldown, old name
  reserved 30 days), instant skin/cape uploads, gallery switching/deletion, and
  an external-login connection guide (auth server URL plus HMCL/PCL2/Prism
  Launcher steps); each account only sees and manages its own textures.
- **Profile pages** (`/users/{id}`): public profile, growth history and recent
  threads; the owner can edit avatar and signature in place.
- **Notifications** (`/notifications`): replies, @mentions (game nicknames
  matched first), moderation and system announcements; mark one/all as read.
- **Reports**: threads, replies, users and textures can all be reported;
  moderators process them in the `/admin` report queue.
- **Roles & permissions**:
  - **Reviewer** (`reviewer`): handle reports, hide/restore threads and replies,
    mute regular members;
  - **Admin** (`admin`): everything a reviewer can do + ban/unban accounts
    (forum + game by default);
  - **Superadmin** (`superadmin`): everything an admin can do + site display
    settings (site icon and custom CSS), categories, announcements, server
    allow-list, granting reviewer/admin roles;
  - **Super console** (`/console`, needs `CONSOLE_KEY`): separate key login, can
    adjust all roles (including superadmin) and configure the site and outgoing
    email (SMTP passwords stored encrypted).
- **Admin console** (`/admin`): dashboard, reports, user mute/ban/unban and role
  changes, thread pin/feature/lock/hide/delete, category CRUD, global
  announcements, texture takedowns, server allow-list, site display settings
  (entries shown per role).
- **Site appearance** (`/admin?tab=site`): upload a site icon (PNG/JPEG/WebP/GIF,
  ≤1 MiB, SHA-256 content-addressed, stored in `UPLOAD_DIR/site/`) used for both
  the header brand and `<link rel="icon">` / `apple-touch-icon`; and custom
  site-wide CSS (≤20 000 chars), inlined by the root layout after the built-in
  theme — empty disables it, content containing `</style>` is rejected.
- **First superadmin**: sign up, then `pnpm admin:grant you@example.com superadmin`;
  use `reviewer` / `admin` for moderators and admins.
- **SEO**: `/sitemap.xml`, `/robots.txt`, `/forum/rss.xml`.
- **Image uploads**: thread images live in `UPLOAD_DIR/forum/` (PNG/JPEG/WebP/GIF,
  ≤5 MiB, SHA-256 content-addressed, public read-only URLs).

### Community growth & captcha

- **Captcha** (sign-in & sign-up): built-in offline SVG arithmetic challenge, or
  Cloudflare Turnstile / hCaptcha. Passing issues a one-time token sent as
  `x-captcha-token` on `sign-in/email` and `sign-up/email`. Both the web login
  page and the **launcher consent page** are wired up; launcher Yggdrasil direct
  login bypasses those two endpoints and is unaffected. The toggle lives in the
  `/admin` captcha panel and **defaults to on in production**
  (`captchaEnabled` falls back to `isProduction`).
- **Levels & titles**: posting, replying and daily check-ins grant XP, capped at
  level `100` (100 XP per level), with 11 title tiers from "Newcomer" (1-10) to
  "Legend" (100). Level and title badges appear in thread lists, author lines
  and public profile pages.
- **Custom title application**: at `titleApplicationLevel` (default level 100)
  members may apply for a custom title, granted after admin approval.
- **Special titles**: `Sponsor / Partner / Affiliate` (custom ones allowed) are
  granted by superadmins. **Holding a special title exits the regular level
  system**: no more XP gain, hidden from level leaderboards, pages show the
  title instead of the level badge; check-ins still award points normally and
  revoking the title restores previous behavior immediately.
- **Points & check-in**: daily check-ins award points in addition to XP, with
  streak bonuses (cappable). Every point change is written to the
  `point_transaction` ledger (`amount` + `balance_after`); paginated history at
  `/forum/growth`.
- **Points shop**: XP multiplier cards (double XP for posting/replying/check-in
  for a limited time, purchases stack), **cape unlock** (uploading or switching
  capes returns 403 until unlocked, skins unaffected), and home-page banner
  slots (submitted for review, displayed by time slot once approved).
- **Tipping**: tip other members with points, bounded by `tipMin`/`tipMax`;
  self-tipping is forbidden.
- **Editable home page**: `GET /api/site/home` serves editable home blocks
  (headlines, buttons, stats, join steps, entry cards) plus banners pending
  review, maintained by superadmins at `/admin?tab=home`; links must start with
  `/` or `http(s)://`, over-count/over-length submissions are rejected and the
  previous version is kept.
- **Delegated permissions**: superadmins can grant 8 capabilities per member at
  `/admin?tab=permissions` (`site.manage`, `forum.categories`, `forum.announce`,
  `users.ban`, `servers.manage`, `titles.manage`, `banners.manage`,
  `points.adjust`). Delegees can enter the corresponding panels even if their
  role is only `reviewer`; superadmins implicitly hold every capability.
- **Tunable growth rules**: check-in XP/points and bonus caps, post/reply XP and
  daily limits, multiplier card rate/duration/price, cape and banner prices,
  banner days and concurrent-slot caps, tipping range, custom-title level — all
  overridable at `/admin?tab=rules` (partial submissions allowed), with a
  one-click "restore defaults" that deletes override rows.

## Common commands

Run from the repo root (`package.json` → `scripts`):

| Command                             | What it does                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                          | Start server + web in parallel (builds shared first)         |
| `pnpm build`                        | Full build: shared → server → web                            |
| `pnpm lint` / `pnpm lint:fix`       | Repo-wide ESLint                                             |
| `pnpm format` / `pnpm format:check` | Prettier                                                     |
| `pnpm typecheck`                    | Repo-wide `tsc --noEmit`                                     |
| `pnpm test` / `pnpm test:coverage`  | Vitest (server + web)                                        |
| `pnpm db:generate`                  | Generate 3 schemas + SQLite/MySQL/PG migrations              |
| `pnpm db:generate:sqlite`           | Generate SQLite migration only                               |
| `pnpm db:check`                     | Verify generated schemas match `model.ts` (CI)               |
| `pnpm db:migrate`                   | Apply migrations for the dialect chosen by `DATABASE_URL`    |
| `pnpm db:seed`                      | Idempotently seed placeholder user/categories/site settings  |
| `pnpm db:copy-data`                 | One-shot cross-dialect data copy (SQLite targets included)   |
| `pnpm db:backup`                    | Back up the current DB (all dialects; `--dry-run` prints it) |
| `pnpm db:studio`                    | Browse data in Drizzle Studio                                |
| `pnpm admin:grant <email> [role]`   | Grant user/reviewer/admin/superadmin                         |
| `pnpm openapi:export`               | Build and refresh `docs/openapi.json`                        |

## Environment variables

All variables are zod-validated in `apps/server/src/config/env.ts` — startup
fails fast, with no runtime fallbacks. Template: root
[`.env.example`](.env.example) (copy to `apps/server/.env`).

| Variable                          | Default (dev)                     | Description                                                       |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                        | `development`                     | `production` enforces secret & cookie validation                  |
| `PORT`                            | `8000`                            | server port                                                       |
| `LOG_LEVEL`                       | `debug` (template)                | pino level; sensitive fields auto-redacted                        |
| `APP_URL` / `AUTH_URL`            | `http://localhost:3000` / `:8000` | site origin / auth origin; CORS & OriginGuard allow-list sources  |
| `COOKIE_SECURE`                   | `false`                           | must be `true` in production (Secure/HttpOnly/SameSite=Lax)       |
| `BETTER_AUTH_SECRET`              | dev default                       | required in production (≥32 chars), `openssl rand -base64 48`     |
| `OAUTH_ACCESS_TOKEN_TTL_SECONDS`  | `2592000`                         | launcher access token lifetime (seconds, 30 days by default)      |
| `OAUTH_REFRESH_TOKEN_TTL_SECONDS` | `5184000`                         | refresh token absolute lifetime (seconds, 60 days by default)     |
| `OAUTH_AUTH_CODE_TTL_SECONDS`     | `300`                             | authorization code lifetime (seconds, single use)                 |
| `SESSION_JOIN_TTL_SECONDS`        | `300`                             | window for hasJoined to redeem a joinServer session (seconds)     |
| `TEXTURE_URL_TTL_SECONDS`         | `300`                             | signed texture URL lifetime (seconds)                             |
| `DATABASE_URL`                    | `./data/mcserauth.db`             | SQLite path or `mysql://` / `postgres://` connection string       |
| `DB_DIALECT`                      | auto-detected                     | optional override, must match the `DATABASE_URL` protocol         |
| `DB_POOL_MIN` / `DB_POOL_MAX`     | `0` / `10`                        | MySQL/PostgreSQL pool (ignored for SQLite)                        |
| `DB_CONNECTION_TIMEOUT_MS`        | `10000`                           | connection timeout (ms)                                           |
| `DB_IDLE_TIMEOUT_MS`              | `30000`                           | idle connection recycle (ms)                                      |
| `DB_SSL`                          | `false`                           | enforce TLS for MySQL/PostgreSQL                                  |
| `UPLOAD_DIR`                      | `./data/uploads`                  | skin/cape PNG storage directory                                   |
| `MAIL_*` / `SMTP_*`               | placeholders                      | default mail config; overridable in the super console (encrypted) |
| `CONSOLE_KEY`                     | empty (disabled)                  | super console key (≥16 chars); `/console` unavailable when empty  |
| `CONSOLE_SESSION_TTL_SECONDS`     | `28800`                           | super console session lifetime (seconds)                          |

Tests use `TEST_DATABASE_URL` to target MySQL/PostgreSQL; data copy uses
`SOURCE_DATABASE_URL` / `TARGET_DATABASE_URL` (script variables, not read by
the server) — see [`docs/database.md`](docs/database.md).

Web-side variables: `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`),
`NEXT_PUBLIC_SITE_URL` (default `http://localhost:3000`, used by sitemap/robots)
and `CONSOLE_PATH` (optional rewrite of a special path to `/console`, read at
build/start). Template: [`apps/web/.env.example`](apps/web/.env.example), copy
to `apps/web/.env.local` to activate.

## Data layer

- **Three databases**: SQLite (default, WAL + foreign keys + `busy_timeout`),
  MySQL 8.0+, PostgreSQL 16+. The dialect is auto-detected from `DATABASE_URL`;
  full configuration, migration and ops notes in [`docs/database.md`](docs/database.md).
  Each dialect ships one 31-table `0000` baseline (the old 12-migration SQLite
  history was removed), with later changes appended as paired incremental migrations.
- **Single logical model**: all 31 tables are declared once in
  `apps/server/src/db/schema/model.ts`; `scripts/generate-schema.ts` generates
  the SQLite/MySQL/PostgreSQL Drizzle schemas and a runtime facade. To change
  tables, edit `model.ts` only, then `pnpm db:generate`; generated files must
  never be hand-edited.
- **Cross-dialect helpers**: business code goes through `DbService`'s
  `insertReturning` / `updateReturning` / `insertIgnore` / `upsert` /
  `transaction` instead of scattering dialect branches; MySQL has no `RETURNING`
  and no partial unique indexes, so the `skin.active_slot` discriminator column
  enforces "one active skin per player per kind".
- The 31 tables cover users & accounts, players & tokens, OAuth codes and
  registered clients/consents, game sessions, the server allow-list, skins &
  capes, forum categories/threads/replies/votes/reports/notifications/audit
  logs, site config, the growth tables (`user_progress`/`daily_checkin`/
  `point_transaction`/`title`/`user_title`/`title_application`/`banner`),
  `captcha_challenge`, and the delegated-permission table `user_permission`;
  better-auth's `session/account/verification` are declared in Drizzle and
  maintained by better-auth itself.
- The forum supports nested categories, pin/feature/lock/soft-delete, and live
  reply & like counts; notifications carry system/moderation body columns.
- Texture files live in `UPLOAD_DIR`, content-addressed as
  `textures/{kind}/{sha256}.png`; thread images in `UPLOAD_DIR/forum/{sha256}.{ext}`.
  The `skin` table dedupes on `(player_uuid, kind, sha256)` with a single
  `is_active` row per kind.
- **All schema changes must go through `pnpm db:generate` to produce the three
  migration sets** — never hand-edit database files or sync at runtime.
- Back up before migrating with `pnpm db:backup`: engine picked from
  `DATABASE_URL`, output under `apps/server/data/backups/` for all three
  dialects (MySQL/PostgreSQL wrap `mysqldump` / `pg_dump`; credentials pass
  through environment variables only, never the command line) — see the
  database guide and [`docs/deploy.md`](docs/deploy.md).
- Restore steps: stop the server → back up the current DB → overwrite the
  target DB with the backup → `pnpm db:migrate` to confirm the version.
- Switching from SQLite to MySQL/PostgreSQL: run `pnpm db:migrate` against the
  target first, then copy and verify with `pnpm db:copy-data -- --truncate`.
- The 30-day nickname reservation lives in `nickname_reservation`, written in
  the rename transaction and backfilled idempotently on startup.
- Upload quotas count per calendar day in `upload_usage(user_id, kind, day, count)`;
  a maintenance job hourly purges expired authorization codes, game sessions,
  expired sessions and quota rows older than 90 days.
- Launcher tokens record `device_name` / `ip` / `expires_at` / `last_used_at` /
  `revoked_at` (token bodies stored as hashes only). The player-facing
  "authorized devices" page and `/api/user/tokens` **were removed on
  2026-10-25**; the only revocation entry point is the launcher-side
  `POST /api/authserver/invalidate`.

## API contract

- Non-protocol endpoints use a unified envelope: success `{ code: 0, data }`,
  failure `{ code, message }` (error codes in `packages/shared/src/errors.ts`).
- Non-protocol write endpoints validate `Origin`/`Referer` (`APP_URL`/`AUTH_URL`
  allow-list) and answer 403 on cross-site requests; auth and write endpoints
  have in-process rate limiting (429).
- Thread replies paginate via `replyPage` / `replyPageSize` (defaults 1/20, cap
  50), responses include `replyTotal`.
- Notification lists paginate (default 20), plus
  `GET /api/forum/notifications/unread-count` for badges.
- Public category/thread lists carry a 15-second HTTP cache; forum list pages
  use Next `revalidate = 30`.
- **Commons-Designs protocol endpoints skip the envelope** and answer with
  their native shape (errors as `{ error, errorMessage }`). All registered
  endpoints are implemented: `oauth/*`, `user/profiles/me`, `session/*`,
  `profiles/*`, `minecraft/profile/*`.
- Forum, account profile and admin endpoints use the unified envelope +
  better-auth cookie sessions: `/api/forum/*`, `/api/user/*`, `/api/users/{id}`,
  `/api/admin/*`.
- Launcher tokens are stored hashed and authorization codes are single-use;
  `/user/profiles/me` and the texture endpoints accept both Bearer tokens and
  web cookies.
- Texture uploads are validated by sharp and take effect immediately (vanilla
  sizes only, no HD); reviewers can take textures down after the fact, the
  current texture is delivered via a short-lived signed URL, and deleting it
  falls back to the default appearance.
- Contract artifact: [`docs/openapi.json`](docs/openapi.json) (refreshed via
  `pnpm openapi:export`).

## Development conventions

- Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:` `fix:` `docs:` `chore:` …).
- pre-commit runs lint-staged automatically (ESLint + Prettier, see
  `.husky/pre-commit`).
- Cross-app DTOs/enums/error codes live only in `packages/shared`; apps must
  never duplicate types.
- CI (`.github/workflows/ci.yml`): `quality` (lint → format:check → typecheck →
  `db:check` → build) + `test-sqlite` + `test-databases` (MySQL 8.0 /
  PostgreSQL 16 service-container matrix). Both test jobs first run a migration
  smoke test against an empty DB, then the same server test suite, and finish
  with `db:seed` → `db:copy-data --truncate` (row counts + whole-row SHA-256
  verification) → an idempotent re-run on the target DB.

## Documentation

| Document                                                 | Contents                                                                      |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [CONTRIBUTING.md](CONTRIBUTING.md)                       | How to contribute: setup, commit & PR conventions, DoD, contract discipline   |
| [SECURITY.md](SECURITY.md)                               | Security policy: private vulnerability reporting channel and response targets |
| [`docs/database.md`](docs/database.md)                   | Three-dialect config, schema workflow, migration / copy / backup              |
| [`docs/deploy.md`](docs/deploy.md)                       | Production runbook: VPS checklist, `.env` reference, backup & restore drills  |
| [`docs/security.md`](docs/security.md)                   | Security baseline: CSP, security headers, hashing                             |
| [`docs/oauth-integration.md`](docs/oauth-integration.md) | OAuth SSO guide for sibling services: client registration, scopes, PKCE       |
| [`docs/openapi.json`](docs/openapi.json)                 | OpenAPI contract artifact (`pnpm openapi:export`)                             |

## License

[MIT](LICENSE)
