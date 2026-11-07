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
];

async function init() {
  for (const stmt of SCHEMA) await pool.query(stmt);
}

const newToken = () => crypto.randomBytes(9).toString('base64url');

const GUEST_COLS = 'g.id, g.token, g.first_name, g.last_name, g.email, g.grp, g.plus_one_allowed, g.notes, g.created_at, g.invited_at, g.invite_count';
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
    `SELECT ${GUEST_COLS}, ${RSVP_COLS} FROM guests g LEFT JOIN rsvps r ON r.guest_id = g.id
     ORDER BY g.grp DESC, lower(g.last_name), lower(g.first_name)`
  );
  return rows;
}

async function addGuest({ first_name, last_name, email, grp, plus_one_allowed, notes }) {
  const { rows } = await pool.query(
    `INSERT INTO guests (token, first_name, last_name, email, grp, plus_one_allowed, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, token`,
    [newToken(), first_name, last_name || '', email || '', grp, plus_one_allowed !== false, notes || '']
  );
  return rows[0];
}

async function updateGuest(id, { first_name, last_name, email, grp, plus_one_allowed }) {
  const { rows } = await pool.query(
    `UPDATE guests SET first_name=$2, last_name=$3, email=$4, grp=$5, plus_one_allowed=$6
     WHERE id=$1 RETURNING id`,
    [id, first_name, last_name || '', email || '', grp, !!plus_one_allowed]
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

async function logEmail({ guest_id, to_email, kind, subject, status, error, provider_id, sent_by }) {
  const { rows } = await pool.query(
    `INSERT INTO email_log (guest_id, to_email, kind, subject, status, error, provider_id, sent_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [guest_id || null, to_email, kind, subject, status, error || '', provider_id || '', sent_by || '']
  );
  if (status === 'sent' && kind === 'invite' && guest_id) {
    await pool.query(`UPDATE guests SET invited_at = now(), invite_count = invite_count + 1 WHERE id = $1 RETURNING id`, [guest_id]);
  }
  return rows[0];
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

module.exports = { guestByEmail, logEmail, recentEmails, sentToday, pool, init, guestByToken, listGuests, addGuest, updateGuest, emailExists, deleteGuest, saveRsvp, clearRsvp };
