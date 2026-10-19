import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations.js';

// One small interface over two databases:
//   await db.all(sql, params)  -> rows
//   await db.get(sql, params)  -> row or null
//   await db.run(sql, params)  -> { changes }
//   await db.tx(async (t) => { ... })   use t.all/get/run INSIDE, never db.*
// SQL uses ? placeholders; they are rewritten to $1, $2 ... for PostgreSQL.

const clean = (params = []) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export function toPg(sql) {
  let n = 0, out = '', inStr = false;
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    out += ch === '?' && !inStr ? '$' + ++n : ch;
  }
  return out;
}

async function openSqlite(cfg) {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); }
  catch { throw new Error('This server needs Node 22.13 or newer for the built-in SQLite database, or set DATABASE_URL to use PostgreSQL.'); }
  if (cfg.sqlitePath !== ':memory:') fs.mkdirSync(path.dirname(cfg.sqlitePath), { recursive: true });
  const raw = new DatabaseSync(cfg.sqlitePath);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  const cache = new Map();
  const stmt = (sql) => { let s = cache.get(sql); if (!s) { s = raw.prepare(sql); cache.set(sql, s); } return s; };
  const plain = {
    all: async (sql, p) => stmt(sql).all(...clean(p)).map((r) => ({ ...r })),
    get: async (sql, p) => { const r = stmt(sql).get(...clean(p)); return r ? { ...r } : null; },
    run: async (sql, p) => ({ changes: Number(stmt(sql).run(...clean(p)).changes) }),
  };
  // One connection: run one thing at a time so a transaction is never interleaved.
  let chain = Promise.resolve();
  const exclusive = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
  return {
    dialect: 'sqlite',
    all: (s, p) => exclusive(() => plain.all(s, p)),
    get: (s, p) => exclusive(() => plain.get(s, p)),
    run: (s, p) => exclusive(() => plain.run(s, p)),
    tx: (fn) => exclusive(async () => {
      raw.exec('BEGIN IMMEDIATE');
      try { const out = await fn(plain); raw.exec('COMMIT'); return out; }
      catch (e) { try { raw.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
    }),
    withLock: (fn) => exclusive(fn),
    close: async () => { await chain; raw.close(); },
  };
}

async function openPg(cfg) {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // BIGINT and COUNT(*) come back as numbers
  const ssl = cfg.databaseSsl === 'on' ? { rejectUnauthorized: true } : cfg.databaseSsl === 'no-verify' ? { rejectUnauthorized: false } : undefined;
  const pool = new pg.Pool({ connectionString: cfg.databaseUrl, ssl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  pool.on('error', (e) => console.error('[db] idle client error:', e.message));
  const api = (c) => ({
    all: async (sql, p) => (await c.query(toPg(sql), clean(p))).rows,
    get: async (sql, p) => (await c.query(toPg(sql), clean(p))).rows[0] ?? null,
    run: async (sql, p) => ({ changes: (await c.query(toPg(sql), clean(p))).rowCount ?? 0 }),
  });
  return {
    dialect: 'pg',
    ...api(pool),
    tx: async (fn) => {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const out = await fn(api(c)); await c.query('COMMIT'); return out; }
      catch (e) { try { await c.query('ROLLBACK'); } catch { /* connection may be gone */ } throw e; }
      finally { c.release(); }
    },
    withLock: async (fn) => {
      const c = await pool.connect();
      try { await c.query('SELECT pg_advisory_lock(727274)'); return await fn(); }
      finally { try { await c.query('SELECT pg_advisory_unlock(727274)'); } finally { c.release(); } }
    },
    close: () => pool.end(),
  };
}

export async function openDb(cfg) {
  const db = cfg.databaseUrl ? await openPg(cfg) : await openSqlite(cfg);
  const migrate = async () => {
    await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    const done = new Set((await db.all('SELECT id FROM schema_migrations')).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await db.tx(async (t) => {
        for (const s of m.statements) await t.run(s);
        await t.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [m.id, Date.now()]);
      });
      if (!cfg.quiet) console.log('[db] applied migration', m.id);
    }
  };
  // SQLite is one connection and already serialised. PostgreSQL may have several servers starting at once, so lock.
  await (db.dialect === 'pg' ? db.withLock(migrate) : migrate());
  return db;
}
