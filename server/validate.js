export class ApiError extends Error {
  constructor(status, code, message, field) {
    super(message);
    this.status = status; this.code = code; this.field = field;
  }
}
export const bad = (message, field) => new ApiError(400, 'invalid', message, field);

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g;

// Text: trims, strips control and invisible direction characters. multiline keeps line breaks.
export function text(v, { field, label = field, min = 0, max, multiline = false, required = false } = {}) {
  if (v == null || v === '') {
    if (required || min > 0) throw bad(`${label} is required.`, field);
    return '';
  }
  if (typeof v !== 'string') throw bad(`${label} must be text.`, field);
  let s = v.replace(CTRL, '');
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  s = s.trim();
  if (s.length < min) throw bad(min === 1 ? `${label} is required.` : `${label} needs at least ${min} characters.`, field);
  if (s.length > max) throw bad(`${label} can be at most ${max} characters.`, field);
  return s;
}

export function oneOf(v, allowed, { field, label = field, required = true } = {}) {
  if (v == null || v === '') { if (required) throw bad(`Choose ${label}.`, field); return null; }
  if (!allowed.includes(v)) throw bad(`Choose a valid ${label}.`, field);
  return v;
}

export function int(v, { field, label = field, min, max, required = true } = {}) {
  if (v == null || v === '') { if (required) throw bad(`${label} is required.`, field); return null; }
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} must be a whole number from ${min} to ${max}.`, field);
  return n;
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const addDays = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

export function email(v) {
  const s = text(v, { field: 'email', label: 'Email', required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw bad('Enter a valid email address.', 'email');
  return s;
}

export function contact(v, field = 'contact', label = 'Contact') {
  const s = text(v, { field, label, max: 40 });
  if (s && !/^[\w+()\-@. ]{3,40}$/.test(s)) throw bad(`${label} can only use letters, numbers and + ( ) - @ .`, field);
  return s;
}

export function url(v, field = 'link') {
  const s = text(v, { field, label: 'Link', max: 300 });
  if (!s) return '';
  try { const u = new URL(s); if (u.protocol === 'http:' || u.protocol === 'https:') return u.href; } catch { /* fall through */ }
  throw bad('The link must start with http:// or https://', field);
}
