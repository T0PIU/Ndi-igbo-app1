import { Router } from 'express';
import { ApiError, bad } from '../validate.js';
import { rateGuard, requireAuth } from '../session.js';

const SYSTEM = `You are Ndi Igbo, a warm, respectful assistant for Igbo people and anyone who wants to connect with Igbo culture, starting from Imo State, Nigeria (Owerri).
Speak like a caring elder sibling: use "nwa m" or "nwanne m" sparingly. Reply in English by default. Use Igbo only when the user writes in Igbo or asks for it. Write Igbo with correct diacritics.
Keep answers short (under 120 words) unless asked for more. When teaching, give the phrase, its meaning, when to use it, and one small next step.
Be honest: if you are not sure, say so plainly. Never invent places, prices, phone numbers, routes, opening hours or event dates; for live facts point to the Events, Market, Map or Rooms tabs.
Customs differ by town and family; say so. Do not claim to speak for all Igbo people.
If someone mentions danger or feeling unsafe, ask if they are safe, tell them to contact a trusted person and local emergency services (112).
Do not give medical, legal or financial instructions as certain. Never ask for passwords or ID numbers.`;

function cleanMessages(input) {
  if (!Array.isArray(input)) throw bad('Send your question as messages.', 'messages');
  const out = [];
  for (const m of input.slice(-10)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 1000);
    if (!content) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') throw bad('Ask a question first.', 'messages');
  return out;
}

export default function askRoutes({ cfg, db, limiters }, fetchImpl = fetch) {
  const r = Router();
  r.use(requireAuth);

  r.post('/', async (req, res) => {
    if (!cfg.anthropic.key) throw new ApiError(503, 'ask_disabled', 'Ask is not switched on yet. The site owner needs to add an Anthropic key.');
    rateGuard(limiters.ask, req.user.id);
    const messages = cleanMessages(req.body?.messages);
    const p = await db.get('SELECT purpose FROM profiles WHERE user_id = ?', [req.user.id]);
    const system = SYSTEM + (p?.purpose ? `\nThe person says they are here as: ${p.purpose}.` : '');
    let up;
    try {
      up = await fetchImpl(`${cfg.anthropic.apiBase}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': cfg.anthropic.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.anthropic.model, max_tokens: 500, system, messages }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      console.error('[ask] request failed:', e.name);
      throw new ApiError(502, 'ask_failed', 'Ask could not answer just now. Try again in a moment.');
    }
    if (!up.ok) {
      console.error('[ask] Anthropic returned', up.status);
      throw new ApiError(502, 'ask_failed', 'Ask could not answer just now. Try again in a moment.');
    }
    const j = await up.json();
    const reply = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (!reply) throw new ApiError(502, 'ask_failed', 'Ask had no answer. Try asking in a different way.');
    res.json({ text: reply });
  });

  return r;
}
