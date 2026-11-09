const crypto = require('crypto');
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS guests (
    id SERIAL PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    grp TEXT NOT NULL CHECK (grp IN ('florida','travel')),
    plus_one_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS guests_email_uniq ON guests (lower(email)) WHERE email <> ''`,
  `CREATE TABLE IF NOT EXISTS rsvps (
    guest_id INTEGER PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
    attending BOOLEAN NOT NULL,
    plus_one BOOLEAN NOT NULL DEFAULT FALSE,
    plus_one_name TEXT NOT NULL DEFAULT '',
    after_party TEXT NOT NULL DEFAULT '',
    dietary TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    legal_name TEXT NOT NULL DEFAULT '',
    plus_one_legal_name TEXT NOT NULL DEFAULT '',
    home_airport TEXT NOT NULL DEFAULT '',
    arrival_date TEXT NOT NULL DEFAULT '',
    departure_date TEXT NOT NULL DEFAULT '',
    needs_hotel BOOLEAN NOT NULL DEFAULT FALSE,
    travel_notes TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL DEFAULT 'guest'
  )`,
  `ALTER TABLE guests ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ`,
  `ALTER TABLE guests ADD COLUMN IF NOT EXISTS invite_count INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS email_log (
    id SERIAL PRIMARY KEY,
    guest_id INTEGER REFERENCES guests(id) ON DELETE SET NULL,
    to_email TEXT NOT NULL,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT NOT NULL DEFAULT '',
    provider_id TEXT NOT NULL DEFAULT '',
    sent_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE email_log ADD COLUMN IF NOT EXISTS from_email TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE guests ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_log ADD COLUMN IF NOT EXISTS delivery TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE email_log ADD COLUMN IF NOT EXISTS delivery_at TIMESTAMPTZ`,
  `ALTER TABLE email_log ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT ''`,
];

async function init() {
  for (const stmt of SCHEMA) await pool.query(stmt);
  // Fill in a company for guests that have none, from their email domain.
  for (const [domain, name] of Object.entries(config.companyByDomain || {})) {
    await pool.query(`UPDATE guests SET company = $2 WHERE company = '' AND lower(split_part(email, '@', 2)) = $1`, [domain, name]);
  }
}

// Company for a guest: what was entered, else looked up from the email domain.
function companyFor(email, given) {
  if (given) return given;
  const domain = String(email || '').split('@')[1] || '';
  return (config.companyByDomain || {})[domain.toLowerCase()] || '';
}

const newToken = () => crypto.randomBytes(9).toString('base64url');

const GUEST_COLS = 'g.id, g.token, g.first_name, g.last_name, g.email, g.grp, g.plus_one_allowed, g.notes, g.created_at, g.invited_at, g.invite_count, g.company';
const RSVP_COLS = `r.attending, r.plus_one, r.plus_one_name, r.after_party, r.dietary, r.phone,
  r.legal_name, r.plus_one_legal_name, r.home_airport, r.arrival_date, r.departure_date,
  r.needs_hotel, r.travel_notes, r.submitted_at, r.updated_at, r.updated_by,
  (r.guest_id IS NOT NULL) AS responded`;

async function guestByToken(token) {
  const { rows } = await pool.query(
    `SELECT ${GUEST_COLS}, ${RSVP_COLS} FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id WHERE g.token = $1`,
    [token]
  );
  return rows[0] || null;
}

async function guestByEmail(email) {
  if (!email) return null;
  const { rows } = await pool.query(`SELECT id, token, first_name, last_name FROM guests WHERE lower(email) = lower($1) AND email <> ''`, [email]);
  return rows[0] || null;
}

async function listGuests() {
  const { rows } = await pool.query(
    `SELECT ${GUEST_COLS}, ${RSVP_COLS}, e.inv_status, e.inv_delivery, e.inv_error, e.inv_delivery_at
     FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id
     LEFT JOIN LATERAL (
       SELECT status AS inv_status, delivery AS inv_delivery, error AS inv_error, delivery_at AS inv_delivery_at
       FROM email_log WHERE guest_id = g.id AND kind = 'invite' ORDER BY created_at DESC, id DESC LIMIT 1
     ) e ON true
     ORDER BY g.grp DESC, lower(g.last_name), lower(g.first_name)`
  );
  return rows;
}

async function addGuest({ first_name, last_name, email, grp, plus_one_allowed, notes, company }) {
  const { rows } = await pool.query(
    `INSERT INTO guests (token, first_name, last_name, email, grp, plus_one_allowed, notes, company)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, token`,
    [newToken(), first_name, last_name || '', email || '', grp, plus_one_allowed !== false, notes || '', companyFor(email, company)]
  );
  return rows[0];
}

async function updateGuest(id, { first_name, last_name, email, grp, plus_one_allowed, company }) {
  const { rows } = await pool.query(
    `UPDATE guests SET first_name=$2, last_name=$3, email=$4, grp=$5, plus_one_allowed=$6, company=$7
     WHERE id=$1 RETURNING id`,
    [id, first_name, last_name || '', email || '', grp, !!plus_one_allowed, companyFor(email, company)]
  );
  return rows[0];
}

async function emailExists(email) {
  if (!email) return false;
  const { rows } = await pool.query(`SELECT id FROM guests WHERE lower(email) = lower($1)`, [email]);
  return rows.length > 0;
}

async function deleteGuest(id) {
  const { rows } = await pool.query(`DELETE FROM guests WHERE id = $1 RETURNING id`, [id]);
  return rows[0];
}

async function saveRsvp(guestId, r, by) {
  const { rows } = await pool.query(
    `INSERT INTO rsvps (guest_id, attending, plus_one, plus_one_name, after_party, dietary, phone,
       legal_name, plus_one_legal_name, home_airport, arrival_date, departure_date, needs_hotel,
       travel_notes, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (guest_id) DO UPDATE SET
       attending=EXCLUDED.attending, plus_one=EXCLUDED.plus_one, plus_one_name=EXCLUDED.plus_one_name,
       after_party=EXCLUDED.after_party, dietary=EXCLUDED.dietary, phone=EXCLUDED.phone,
       legal_name=EXCLUDED.legal_name, plus_one_legal_name=EXCLUDED.plus_one_legal_name,
       home_airport=EXCLUDED.home_airport, arrival_date=EXCLUDED.arrival_date,
       departure_date=EXCLUDED.departure_date, needs_hotel=EXCLUDED.needs_hotel,
       travel_notes=EXCLUDED.travel_notes, updated_by=EXCLUDED.updated_by, updated_at=now()
     RETURNING guest_id`,
    [guestId, r.attending, r.plus_one, r.plus_one_name, r.after_party, r.dietary, r.phone,
     r.legal_name, r.plus_one_legal_name, r.home_airport, r.arrival_date, r.departure_date,
     r.needs_hotel, r.travel_notes, by]
  );
  return rows[0];
}

async function clearRsvp(guestId) {
  const { rows } = await pool.query(`DELETE FROM rsvps WHERE guest_id = $1 RETURNING guest_id`, [guestId]);
  return rows[0];
}

async function logEmail({ guest_id, to_email, kind, subject, status, error, provider_id, sent_by, from_email, body }) {
  const { rows } = await pool.query(
    `INSERT INTO email_log (guest_id, to_email, kind, subject, status, error, provider_id, sent_by, from_email, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [guest_id || null, to_email, kind, subject, status, error || '', provider_id || '', sent_by || '', from_email || '', body || '']
  );
  if (status === 'sent' && kind === 'invite' && guest_id) {
    await pool.query(`UPDATE guests SET invited_at = now(), invite_count = invite_count + 1 WHERE id = $1 RETURNING id`, [guest_id]);
  }
  return rows[0];
}

// Messages admins wrote from the Inbox (replies and new emails), newest first.
async function sentMessages(limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, to_email, from_email, subject, body, sent_by, created_at FROM email_log
     WHERE kind IN ('reply','message') AND status = 'sent' ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows;
}

async function sentMessage(id) {
  const { rows } = await pool.query(
    `SELECT id, to_email, from_email, subject, body, sent_by, created_at FROM email_log
     WHERE id = $1 AND kind IN ('reply','message')`, [id]);
  return rows[0] || null;
}

// Sent invitations whose final delivery result isn't known yet (newest first).
async function invitesToCheck(limit = 500) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (guest_id) id, guest_id, provider_id, delivery FROM email_log
     WHERE kind = 'invite' AND guest_id IS NOT NULL ORDER BY guest_id, created_at DESC, id DESC`);
  return rows.filter(r => r.provider_id && !['delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'suppressed', 'canceled'].includes(r.delivery))
    .slice(0, limit);
}

async function setDelivery(logId, delivery) {
  await pool.query(`UPDATE email_log SET delivery = $2, delivery_at = now() WHERE id = $1`, [logId, String(delivery || '').slice(0, 40)]);
}

async function recentEmails(limit = 15) {
  const { rows } = await pool.query(
    `SELECT kind, subject, sent_by, min(created_at) AS at,
       sum(CASE WHEN status = 'sent' THEN 1 ELSE 0 END)::int AS sent,
       sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
     FROM email_log GROUP BY kind, subject, sent_by, date_trunc('minute', created_at)
     ORDER BY min(created_at) DESC LIMIT $1`, [limit]
  );
  return rows;
}

async function sentToday() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM email_log WHERE status = 'sent' AND created_at > now() - interval '24 hours'`
  );
  return rows[0] ? rows[0].n : 0;
}

module.exports = { invitesToCheck, setDelivery, sentMessages, sentMessage, guestByEmail, logEmail, recentEmails, sentToday, pool, init, guestByToken, listGuests, addGuest, updateGuest, emailExists, deleteGuest, saveRsvp, clearRsvp };
