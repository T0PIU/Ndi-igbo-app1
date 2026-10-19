import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const bool = (v, d = false) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

export function loadConfig(overrides = {}) {
  const production = (overrides.nodeEnv ?? env.NODE_ENV) === 'production';
  const cfg = {
    root,
    publicDir: path.join(root, 'public'),
    production,
    port: int(env.PORT, 3000),
    appName: env.APP_NAME || 'Ndi Igbo',

    // Database: set DATABASE_URL for PostgreSQL. Without it the app uses a SQLite file.
    databaseUrl: env.DATABASE_URL || '',
    databaseSsl: (env.DATABASE_SSL || 'off').toLowerCase(), // off | on | no-verify
    sqlitePath: env.SQLITE_PATH || path.join(root, 'data', 'ndi.sqlite'),

    // Sessions and security
    sessionDays: int(env.SESSION_DAYS, 30),
    trustProxy: env.TRUST_PROXY ?? (production ? '1' : ''),
    cookieSecure: bool(env.COOKIE_SECURE, production),
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    signupsOpen: bool(env.SIGNUPS_OPEN, true),
    // Campus Wi-Fi and mobile networks put many people behind one address, so this is generous.
    signupLimitPerHour: int(env.SIGNUP_LIMIT_PER_HOUR, 60),

    // Optional services
    spotify: {
      clientId: env.SPOTIFY_CLIENT_ID || '',
      clientSecret: env.SPOTIFY_CLIENT_SECRET || '',
      apiBase: env.SPOTIFY_API_BASE || 'https://api.spotify.com/v1',
      accountsBase: env.SPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com',
    },
    maps: { key: env.GOOGLE_MAPS_API_KEY || '', mapId: env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID' },
    anthropic: {
      key: env.ANTHROPIC_API_KEY || '',
      model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
      apiBase: env.ANTHROPIC_API_BASE || 'https://api.anthropic.com',
    },
    quiet: false,
  };
  return { ...cfg, ...overrides };
}
