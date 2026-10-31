/**
 * pm2 process topology for MCSerAuth (2.0 F4).
 *
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup            # survive reboots
 *
 * Point `MCSERAUTH_ROOT` at the checkout if it is not /opt/mcserauth:
 *
 *   MCSERAUTH_ROOT=/srv/mcserauth pm2 start deploy/ecosystem.config.cjs
 *
 * Both processes listen on loopback only in the Caddy front door; keep them
 * unreachable from the public interface (see docs/deploy.md, step 2).
 */
const APP_ROOT = process.env.MCSERAUTH_ROOT ?? '/opt/mcserauth';
const LOG_DIR = process.env.MCSERAUTH_LOG_DIR ?? '/var/log/mcserauth';

module.exports = {
  apps: [
    {
      name: 'mcserauth-server',
      cwd: `${APP_ROOT}/apps/server`,
      script: 'dist/main.js',
      // One process is a correctness requirement, not a capacity choice:
      // the throttlers, captcha challenges and the in-memory session cache all
      // live in-process (2.0 ledger T10). Cluster mode or instances > 1 divides
      // every limit by the process count and splits captcha single-use tokens.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      // A leaked worker should be recycled rather than paged at 3am.
      max_memory_restart: '512M',
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: `${LOG_DIR}/server-out.log`,
      error_file: `${LOG_DIR}/server-error.log`,
      merge_logs: true,
      time: true,
    },
    {
      name: 'mcserauth-web',
      cwd: `${APP_ROOT}/apps/web`,
      // `next start` resolves through the workspace install; calling the bin
      // directly avoids depending on pnpm's shim being on pm2's PATH.
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3000',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
      },
      out_file: `${LOG_DIR}/web-out.log`,
      error_file: `${LOG_DIR}/web-error.log`,
      merge_logs: true,
      time: true,
    },
  ],
};
