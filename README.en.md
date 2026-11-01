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
> [v1.0.0](https://github.com/Logist1024/MCSerAuth/releases/tag/v1.0.0); a 2.0
> "production-hardening" round is in progress (multi-database CI matrix, deployment &
> backup, observability, HTTP e2e test layer already done — see the
> [dev guide](docs/2.0-开发指南.md) for the full work-item status).

## Features

- **Authentication**: better-auth web sessions, OAuth authorization code + PKCE,
  launcher token rotation, Yggdrasil endpoints (`authenticate` / `refresh` /
  `validate` / `invalidate`), session service (`joinServer` / `hasJoined`),
  profile lookup, skin/cape upload with signed delivery, authlib-injector direct login.
- **Forum**: categories, threads, replies, likes, notifications, reports, image
  uploads, guest browsing, SEO (sitemap / RSS).
- **Player profiles**: public profile pages, game account management (profile /
  rename with 30-day cooldown / texture switching), 3D skin preview.
- **Operations**: four-level role system + 8 delegable permissions + key-protected
  super console, captcha (offline or Turnstile/hCaptcha), growth system (levels,
  titles, daily check-in, points, shop, tipping, home-page banners).
- **Data layer**: single Drizzle model generating all three dialects (29 tables),
  cross-dialect migrations, backup & copy tools.

## Quick start

Requires Node.js 22 (pinned in `.nvmrc`) and pnpm via corepack.

```bash
git clone https://github.com/Logist1024/MCSerAuth.git && cd MCSerAuth
corepack enable
pnpm install
cp .env.example apps/server/.env   # optional: dev defaults work without it
pnpm db:migrate                    # create DB + apply all migrations
pnpm dev                           # server on :8000, web on :3000
```

Then:

| URL                            | What it is                                 |
| ------------------------------ | ------------------------------------------ |
| <http://localhost:3000>        | Server home page (forum / game accounts)   |
| <http://localhost:3000/forum>  | Forum                                      |
| <http://localhost:8000/docs>   | Swagger UI (full API contract)             |
| <http://localhost:8000/api>    | Yggdrasil auth server root (for launchers) |
| <http://localhost:8000/health> | Health check                               |

Smoke test (sign-up → session):

```bash
curl -c jar.txt -X POST http://localhost:8000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@example.com","password":"S3cure!Passw0rd","name":"Tester"}'
curl -b jar.txt http://localhost:8000/api/auth/get-session
```

To grant the first super admin after signing up: `pnpm admin:grant you@example.com superadmin`.

## Documentation

Full documentation is written in Chinese (see the
[Chinese README](README.md) for the complete feature walk-through):

| Document                                                   | Contents                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| [CONTRIBUTING.md](CONTRIBUTING.md)                         | How to contribute: setup, commit & PR conventions, DoD       |
| [`docs/deploy.md`](docs/deploy.md)                         | Production runbook: VPS checklist, `.env` reference, backups |
| [`docs/database.md`](docs/database.md)                     | Three-dialect config, schema workflow, migration / backup    |
| [`docs/security.md`](docs/security.md)                     | Security baseline: CSP, security headers                     |
| [`docs/protocol-checklist.md`](docs/protocol-checklist.md) | Protocol field-by-field audit & launcher integration log     |
| [`docs/openapi.json`](docs/openapi.json)                   | OpenAPI contract artifact                                    |
| [`docs/adr/`](docs/adr/)                                   | Architecture decision records                                |

## Tech stack

Node.js 22 · pnpm 9 · TypeScript (full-repo ESM) · NestJS 12 (Express 5) ·
better-auth · Drizzle ORM · Next.js 16 App Router (React 19, rendering only —
all business logic lives in the NestJS API) · Vitest · GitHub Actions.

## License

[MIT](LICENSE)
