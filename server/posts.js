import { BUSINESS_CATS, EVENT_TYPES, GENDERS, HABITS, LEVELS, ORG_TYPES, SCHOOLS, WANTS } from '../public/js/constants.js';
import { addDays, bad, contact, int, isDate, isTime, oneOf, text, url } from './validate.js';
import { newId } from './security.js';

export const KINDS = ['event', 'roommate', 'business', 'newsletter'];
const today = () => new Date().toISOString().slice(0, 10);

// Each validator returns what to store. Anything not listed here is thrown away.
export const VALIDATORS = {
  event(b) {
    const title = text(b.title, { field: 'title', label: 'Program name', min: 2, max: 80 });
    const type = oneOf(b.type, EVENT_TYPES.map((x) => x.id), { field: 'type', label: 'a type' });
    const org = text(b.org, { field: 'org', label: 'Organiser', min: 2, max: 60 });
    if (!isDate(b.date)) throw bad('Choose a valid date.', 'date');
    const weekly = b.weekly === true;
    if (!weekly && b.date < addDays(today(), -1)) throw bad('That date has already passed.', 'date');
    if (weekly && b.date < addDays(today(), -365)) throw bad('Choose a start date within the last year.', 'date');
    if (b.date > addDays(today(), 730)) throw bad('Choose a date within the next two years.', 'date');
    if (!isTime(b.time)) throw bad('Choose a valid time.', 'time');
    if (b.endTime && (!isTime(b.endTime) || b.endTime <= b.time)) throw bad('End time must be after the start time.', 'endTime');
    const status = oneOf(b.status || 'upcoming', ['upcoming', 'postponed', 'cancelled'], { field: 'status', label: 'a status' });
    return {
      title,
      data: {
        type, org, date: b.date, time: b.time, endTime: b.endTime || '', evStatus: status, weekly,
        area: text(b.area, { field: 'area', label: 'Address or area', max: 100 }),
        details: text(b.details, { field: 'details', label: 'Details', max: 500, multiline: true }),
        contact: contact(b.contact),
      },
      eventDate: b.date, weekly,
    };
  },

  roommate(b) {
    const nick = text(b.nick, { field: 'nick', label: 'Nickname', min: 2, max: 30 });
    const habits = Array.isArray(b.habits) ? [...new Set(b.habits)] : [];
    if (habits.length > 8 || habits.some((h) => !HABITS.includes(h))) throw bad('Choose habits from the list.', 'habits');
    return {
      title: nick,
      data: {
        nick,
        school: oneOf(b.school, SCHOOLS, { field: 'school', label: 'a school' }),
        level: oneOf(b.level, LEVELS, { field: 'level', label: 'a level' }),
        gender: oneOf(b.gender, GENDERS, { field: 'gender', label: 'an option' }),
        wants: oneOf(b.wants, WANTS, { field: 'wants', label: 'who you are looking for' }),
        budget: int(b.budget, { field: 'budget', label: 'Budget', min: 0, max: 5000000 }),
        area: text(b.area, { field: 'area', label: 'Preferred area', max: 60 }),
        habits,
        about: text(b.about, { field: 'about', label: 'About me', max: 280, multiline: true }),
      },
      contact: contact(b.contact), // private: only shown when another member taps "Show contact"
    };
  },

  business(b) {
    return {
      title: text(b.name, { field: 'name', label: 'Business name', min: 2, max: 60 }),
      data: {
        cat: oneOf(b.cat, BUSINESS_CATS, { field: 'cat', label: 'a category' }),
        offer: text(b.offer, { field: 'offer', label: 'What you offer', min: 10, max: 300, multiline: true }),
        price: text(b.price, { field: 'price', label: 'Price range', max: 40 }),
        area: text(b.area, { field: 'area', label: 'Address or area', min: 2, max: 100 }),
        promo: text(b.promo, { field: 'promo', label: 'Promo', max: 80 }),
        contact: contact(b.contact) || (() => { throw bad('Add a WhatsApp or phone number so customers can reach you.', 'contact'); })(),
      },
    };
  },

  newsletter(b) {
    return {
      title: text(b.title, { field: 'title', label: 'Title', min: 3, max: 100 }),
      data: {
        org: text(b.org, { field: 'org', label: 'Organisation', min: 2, max: 80 }),
        orgType: oneOf(b.orgType, ORG_TYPES, { field: 'orgType', label: 'a sender type' }),
        body: text(b.body, { field: 'body', label: 'Message', min: 10, max: 3000, multiline: true }),
        link: url(b.link),
      },
    };
  },
};

// Newsletters from accounts an admin has verified go live at once. Everyone else waits for review.
export const initialStatus = (kind, user) => (kind === 'newsletter' && !user.verifiedLabel && user.role !== 'admin' ? 'pending' : 'published');

export async function insertPost(db, { kind, user, v, example = false }) {
  const id = newId(), now = Date.now();
  const status = initialStatus(kind, user);
  await db.run(
    `INSERT INTO posts (id, kind, author_id, status, title, data, contact, event_date, weekly, is_example, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, kind, user.id, status, v.title, JSON.stringify(v.data), v.contact || null, v.eventDate || null, v.weekly ? 1 : 0, example ? 1 : 0, now, now]);
  return { id, status };
}

export const POST_SELECT = `
  SELECT p.id, p.kind, p.author_id, p.status, p.title, p.data, p.contact, p.is_example, p.created_at,
         u.name AS author_name, u.verified_label AS author_label,
         (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS react_count,
         (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id AND r.user_id = ?) AS react_mine
    FROM posts p JOIN users u ON u.id = p.author_id`;

export function formatPost(row, viewerId) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    mine: row.author_id === viewerId,
    author: { name: row.kind === 'roommate' ? null : row.author_name, verifiedLabel: row.author_label || null },
    reactions: { count: row.react_count, mine: row.react_mine > 0 },
    rsvp: { count: 0, mine: false },
    hasContact: !!row.contact,
    example: !!row.is_example,
  };
}
