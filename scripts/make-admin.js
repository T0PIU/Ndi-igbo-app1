// Usage: npm run make-admin -- someone@example.com        (add --remove to take admin away)
// Run on the server after that person has signed up. Admin is never granted through the website.
import { loadConfig } from '../server/config.js';
import { openDb } from '../server/db/index.js';

const [email, flag] = [process.argv[2]?.toLowerCase(), process.argv[3]];
if (!email) { console.error('Usage: npm run make-admin -- email@example.com [--remove]'); process.exit(1); }
const db = await openDb(loadConfig({ quiet: true }));
const r = await db.run('UPDATE users SET role = ? WHERE email = ?', [flag === '--remove' ? 'user' : 'admin', email]);
console.log(r.changes ? `Done. ${email} is now ${flag === '--remove' ? 'a normal user' : 'an admin'}.` : `No account found for ${email}. Sign up first, then run this again.`);
await db.close();
