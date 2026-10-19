// Usage: npm run reset-password -- someone@example.com NewPassphrase123
// For people who forgot their password (there is no email reset yet). Ends all their sessions.
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db/index.js';
import { hashPassword, passwordProblem } from '../server/security.js';

const [email, pw] = [process.argv[2]?.toLowerCase(), process.argv[3]];
if (!email || !pw) { console.error('Usage: npm run reset-password -- email@example.com NewPassword'); process.exit(1); }
const bad = passwordProblem(pw, email);
if (bad) { console.error(bad); process.exit(1); }
const db = await openDb(loadConfig({ quiet: true }));
const u = await db.get('SELECT id FROM users WHERE email = ?', [email]);
if (!u) console.log(`No account found for ${email}.`);
else {
  await db.run('UPDATE users SET pass_hash = ? WHERE id = ?', [await hashPassword(pw), u.id]);
  await db.run('DELETE FROM sessions WHERE user_id = ?', [u.id]);
  console.log('Password changed and the person was signed out everywhere.');
}
await db.close();
