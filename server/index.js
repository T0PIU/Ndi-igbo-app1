import { loadConfig } from './config.js';
import { openDb } from './db/index.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const db = await openDb(cfg);
const { app, stop } = await createApp(cfg, db);
const server = app.listen(cfg.port, () => {
  console.log(`${cfg.appName} is running on port ${cfg.port} (${db.dialect === 'pg' ? 'PostgreSQL' : 'SQLite'}${cfg.production ? ', production' : ''})`);
  if (cfg.production && !cfg.cookieSecure) console.warn('[warn] COOKIE_SECURE is off in production. Serve over HTTPS and leave it on.');
});

const shutdown = async () => { stop(); server.close(); await db.close().catch(() => {}); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
