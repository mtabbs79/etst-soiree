const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const views = require('./views');
const auth = require('./auth');
const mail = require('./mail');
const csv = require('./csv');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8' };

// ---------- helpers ----------

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...headers,
  });
  res.end(body);
}
const redirect = (res, to, headers = {}) => send(res, 303, '', { Location: to, ...headers });

function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(data))));
    req.on('error', reject);
  });
}

function baseUrl(req) {
  if (config.baseUrl) return config.baseUrl;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}
const isSecure = (req) => (req.headers['x-forwarded-proto'] || '') === 'https';
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const fmtTs = (d) => d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit' }) : '';
const yes = (v) => /^(y|yes|true|1|allowed)$/i.test(String(v ?? '').trim());

function serveStatic(res, rel) {
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'Not found');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
  });
}

// Simple in-memory throttle for admin login attempts.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now(), w = attempts.get(ip) || [];
  const recent = w.filter(t => now - t < 15 * 60 * 1000);
  attempts.set(ip, recent);
  return recent.length >= 10;
}

// ---------- RSVP validation ----------

function readRsvp(body, g) {
  const isTravel = g.grp === 'travel';
  const r = {
    attending: body.attending === 'yes' ? true : body.attending === 'no' ? false : null,
    plus_one: body.plus_one === 'yes',
    plus_one_name: clean(body.plus_one_name, 120),
    after_party: ['yes', 'no', 'maybe'].includes(body.after_party) ? body.after_party : '',
    dietary: clean(body.dietary, 200),
    phone: clean(body.phone, 30),
    legal_name: clean(body.legal_name, 120),
    plus_one_legal_name: clean(body.plus_one_legal_name, 120),
    home_airport: clean(body.home_airport, 60),
    arrival_date: /^\d{4}-\d{2}-\d{2}$/.test(body.arrival_date || '') ? body.arrival_date : '',
    departure_date: /^\d{4}-\d{2}-\d{2}$/.test(body.departure_date || '') ? body.departure_date : '',
    needs_hotel: isTravel && body.needs_hotel !== 'no',
    travel_notes: clean(body.travel_notes, 600),
  };
  const errors = [];
  if (r.attending === null) errors.push('Let us know whether you can attend.');
  if (r.attending) {
    if (!['yes', 'no'].includes(body.plus_one)) errors.push('Let us know whether you’re bringing a plus one.');
    if (r.plus_one && !r.plus_one_name) errors.push('Add your guest’s name.');
    if (!r.after_party) errors.push('Let us know about the after party.');
    if (isTravel) {
      if (!r.phone) errors.push('Add a cell phone number so we can reach you about travel.');
      if (!r.legal_name) errors.push('Add your legal name as it appears on your ID.');
      if (r.plus_one && !r.plus_one_legal_name) errors.push('Add your guest’s legal name as it appears on their ID.');
      if (!r.home_airport) errors.push('Add your home airport.');
      if (!r.arrival_date) errors.push('Choose a preferred arrival date.');
      if (!r.departure_date) errors.push('Choose a preferred departure date.');
      if (r.arrival_date && r.departure_date && r.departure_date < r.arrival_date) errors.push('Departure date should be after arrival date.');
    }
  } else if (r.attending === false) {
    // Declined: drop anything else they may have typed.
    Object.assign(r, { plus_one: false, plus_one_name: '', after_party: '', legal_name: '', plus_one_legal_name: '',
      home_airport: '', arrival_date: '', departure_date: '', needs_hotel: false, travel_notes: '' });
  }
  if (!r.plus_one) { r.plus_one_name = ''; r.plus_one_legal_name = ''; }
  if (!isTravel) Object.assign(r, { legal_name: '', plus_one_legal_name: '', home_airport: '', arrival_date: '', departure_date: '', travel_notes: '' });
  return { r, errors };
}

const isClosed = (g) => Date.now() > config.deadlines[g.grp];

// ---------- guest import ----------

function normalizeGroup(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'fl' || s === 'florida' || s === 'local' || s === 'in state' ? 'florida' : 'travel';
}

async function importCsv(text) {
  const rows = csv.parse(text);
  const report = { added: 0, skipped: [], errors: [] };
  rows.forEach((r, i) => { r._line = i + 1; });
  if (rows.length && /first/i.test(rows[0][0] || '') && /(last|email|name)/i.test(rows[0].join(' '))) rows.shift();
  for (const r of rows) {
    const [first, last, email, location] = r.map(v => (v || '').trim());
    if (!first) { report.errors.push(`Line ${r._line}: missing first name`); continue; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { report.errors.push(`Line ${r._line}: “${email}” doesn’t look like an email`); continue; }
    if (email && await db.emailExists(email)) { report.skipped.push(`${first} ${last} (${email}) is already on the list`); continue; }
    await db.addGuest({
      first_name: first.slice(0, 60), last_name: (last || '').slice(0, 60), email: (email || '').slice(0, 120),
      grp: normalizeGroup(location), plus_one_allowed: true,
    });
    report.added++;
  }
  return report;
}

function importReportHtml(rep) {
  const e = views.esc;
  return `<div class="flash">Imported ${rep.added} guest${rep.added === 1 ? '' : 's'}.${rep.skipped.length ? ` Skipped ${rep.skipped.length}.` : ''}${rep.errors.length ? ` ${rep.errors.length} line(s) had problems.` : ''}
  ${rep.skipped.length || rep.errors.length ? `<details><summary>Details</summary><ul>${[...rep.errors, ...rep.skipped].map(x => `<li>${e(x)}</li>`).join('')}</ul></details>` : ''}</div>`;
}

// ---------- exports ----------

async function exportCsv(res, kind, req) {
  const guests = await db.listGuests();
  const base = baseUrl(req);
  const st = (g) => ({ yes: 'Attending', no: 'Declined', pending: 'No reply' }[views.statusOf(g)]);
  let header, rows, name;
  if (kind === 'travel') {
    name = 'soiree-travel-list.csv';
    header = ['First name', 'Last name', 'Email', 'Phone', 'Status', 'Legal name (ID)', 'Plus one', 'Plus one legal name (ID)', 'Home airport', 'Arrive', 'Depart', 'Needs hotel', 'Travel notes', 'Dietary', 'Last updated'];
    rows = guests.filter(g => g.grp === 'travel').map(g => [g.first_name, g.last_name, g.email, g.phone, st(g), g.legal_name,
      g.plus_one ? g.plus_one_name : '', g.plus_one ? g.plus_one_legal_name : '', g.home_airport, g.arrival_date, g.departure_date,
      g.responded && g.attending ? (g.needs_hotel ? 'Yes' : 'No') : '', g.travel_notes, g.dietary, fmtTs(g.updated_at)]);
  } else if (kind === 'links') {
    name = 'soiree-invite-links.csv';
    header = ['First name', 'Last name', 'Email', 'Invitation', 'RSVP deadline', 'Personal RSVP link', 'Status'];
    rows = guests.map(g => [g.first_name, g.last_name, g.email, g.grp === 'travel' ? 'Travel' : 'Florida',
      g.grp === 'travel' ? 'November 16, 2026' : 'December 1, 2026', `${base}/i/${g.token}`, st(g)]);
  } else {
    name = 'soiree-all-guests.csv';
    header = ['First name', 'Last name', 'Email', 'Invitation', 'Status', 'Plus one', 'Headcount', 'After party', 'Dietary', 'Phone',
      'Legal name (ID)', 'Plus one legal name (ID)', 'Home airport', 'Arrive', 'Depart', 'Needs hotel', 'Travel notes', 'Last updated', 'Updated by', 'RSVP link'];
    rows = guests.map(g => [g.first_name, g.last_name, g.email, g.grp === 'travel' ? 'Travel' : 'Florida', st(g),
      g.plus_one ? g.plus_one_name : '', g.responded && g.attending ? 1 + (g.plus_one ? 1 : 0) : 0, g.after_party || '', g.dietary || '',
      g.phone || '', g.legal_name || '', g.plus_one_legal_name || '', g.home_airport || '', g.arrival_date || '', g.departure_date || '',
      g.grp === 'travel' && g.responded && g.attending ? (g.needs_hotel ? 'Yes' : 'No') : '', g.travel_notes || '',
      fmtTs(g.updated_at), g.responded ? g.updated_by : '', `${base}/i/${g.token}`]);
  }
  send(res, 200, csv.stringify(header, rows), {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  });
}

// ---------- email helpers ----------

async function emailInfo() {
  return { enabled: mail.enabled(), sentToday: await db.sentToday(), recent: await db.recentEmails() };
}

function pickRecipients(guests, { kind, grp, who, limit }) {
  let list = guests.filter(g => grp === 'all' || g.grp === grp);
  if (kind === 'invite' && who !== 'everyone') list = list.filter(g => !g.invited_at);
  if (kind === 'reminder' || who === 'pending') list = list.filter(g => !g.responded);
  if (kind === 'update' && who === 'attending') list = list.filter(g => g.responded && g.attending);
  const skipped = list.filter(g => !g.email).length;
  const n = Math.max(1, Math.min(1000, parseInt(limit, 10) || 100));
  return { recipients: list.filter(g => g.email).slice(0, n), skipped };
}

// ---------- router ----------

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  const admin = auth.currentAdmin(req);

  if (p === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (p.startsWith('/static/')) return serveStatic(res, p.slice('/static/'.length));
  if (p === '/' && m === 'GET') return send(res, 200, views.home());

  // Guest RSVP
  let mm = p.match(/^\/i\/([A-Za-z0-9_-]{6,40})(\/thanks)?$/);
  if (mm) {
    const g = await db.guestByToken(mm[1]);
    if (!g) return send(res, 404, views.notFound());
    const closed = isClosed(g) && !admin;
    if (mm[2]) return g.responded ? send(res, 200, views.thanks(g)) : redirect(res, `/i/${g.token}`);
    if (m === 'GET') return send(res, 200, views.rsvpForm(g, { closed, adminView: !!admin }), { 'Cache-Control': 'no-store' });
    if (m === 'POST') {
      if (closed) return send(res, 200, views.rsvpForm(g, { closed: true }));
      const body = await readBody(req);
      const { r, errors } = readRsvp(body, g);
      if (errors.length) return send(res, 422, views.rsvpForm(g, { errors, values: body, adminView: !!admin }));
      await db.saveRsvp(g.id, r, admin ? `admin: ${admin.name}` : 'guest');
      return redirect(res, admin ? `/admin/guests/${g.id}` : `/i/${g.token}/thanks`);
    }
  }

  // Admin auth
  if (p === '/admin/login') {
    if (m === 'GET') return send(res, 200, views.adminLogin());
    if (m === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (throttled(ip)) return send(res, 429, views.adminLogin('Too many attempts. Try again in 15 minutes.'));
      const body = await readBody(req);
      if (!auth.checkPassword(body.password || '')) {
        attempts.get(ip).push(Date.now());
        return send(res, 401, views.adminLogin('That password didn’t work.'));
      }
      const name = clean(body.name, 60) || 'Admin';
      return redirect(res, '/admin', { 'Set-Cookie': auth.sessionCookie(name, isSecure(req)) });
    }
  }
  if (p === '/admin/logout' && m === 'POST') return redirect(res, '/admin/login', { 'Set-Cookie': auth.clearCookie() });

  if (p === '/admin' || p.startsWith('/admin/')) {
    if (!admin) return redirect(res, '/admin/login');
    const base = baseUrl(req);

    if (p === '/admin' && m === 'GET') {
      const flash = url.searchParams.get('msg') || '';
      return send(res, 200, views.adminDashboard({ admin, guests: await db.listGuests(), baseUrl: base, flash, email: await emailInfo() }), { 'Cache-Control': 'no-store' });
    }
    if (p === '/admin/import' && m === 'POST') {
      const body = await readBody(req);
      const rep = await importCsv(body.csv || '');
      return send(res, 200, views.adminDashboard({ admin, guests: await db.listGuests(), baseUrl: base, importReport: importReportHtml(rep), email: await emailInfo() }), { 'Cache-Control': 'no-store' });
    }
    if (p === '/admin/guests' && m === 'POST') {
      const b = await readBody(req);
      const first = clean(b.first_name, 60), email = clean(b.email, 120);
      if (!first) return redirect(res, '/admin?msg=' + encodeURIComponent('First name is required.'));
      if (email && await db.emailExists(email)) return redirect(res, '/admin?msg=' + encodeURIComponent(`${email} is already on the guest list.`));
      await db.addGuest({ first_name: first, last_name: clean(b.last_name, 60), email, grp: b.grp === 'travel' ? 'travel' : 'florida', plus_one_allowed: true });
      return redirect(res, '/admin?msg=' + encodeURIComponent(`Added ${first}.`));
    }
    if (p === '/admin/email/preview' || p === '/admin/email/test' || p === '/admin/email/send') {
      if (m !== 'POST') return redirect(res, '/admin');
      const b = await readBody(req);
      const kind = ['invite', 'reminder', 'update'].includes(b.kind) ? b.kind : 'invite';
      const form = { kind, grp: b.grp || 'all', who: b.who || 'new', limit: b.limit || '100', subject: clean(b.subject, 150), message: clean(b.message, 5000) };
      if (kind === 'update' && (!form.subject || !form.message)) return redirect(res, '/admin?msg=' + encodeURIComponent('Add a subject and message for the update.'));
      const { recipients, skipped } = pickRecipients(await db.listGuests(), form);
      const opts = { subject: form.subject, message: form.message };
      if (p === '/admin/email/preview') {
        const sg = recipients[0] || { first_name: 'Guest', last_name: '', email: 'guest@example.com', token: 'sample-link', grp: form.grp === 'travel' ? 'travel' : 'florida' };
        const built = mail.build(kind, sg, base, opts);
        return send(res, 200, views.adminEmailPreview({ admin, kind, form, recipients, skipped, enabled: mail.enabled(),
          sample: { ...built, forName: `${sg.first_name} ${sg.last_name}`.trim() } }), { 'Cache-Control': 'no-store' });
      }
      if (!mail.enabled()) return redirect(res, '/admin?msg=' + encodeURIComponent('Email isn’t connected yet.'));
      if (p === '/admin/email/test') {
        const to = clean(b.test_to, 120);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return redirect(res, '/admin?msg=' + encodeURIComponent('Enter a valid test email.'));
        const sample = recipients.length ? [recipients[0]] : [];
        // Send one of each group so you see both versions of an invitation.
        const other = recipients.find(g => sample[0] && g.grp !== sample[0].grp);
        if (other) sample.push(other);
        const r = await mail.sendTo(sample, kind, base, admin.name, { ...opts, overrideTo: to });
        return redirect(res, '/admin?msg=' + encodeURIComponent(r.failed ? `Test failed: ${r.errors[0]}` : `Sent ${r.sent} test email${r.sent === 1 ? '' : 's'} to ${to}.`));
      }
      const r = await mail.sendTo(recipients, kind, base, admin.name, opts);
      const what = { invite: 'invitation', reminder: 'reminder', update: 'update' }[kind];
      return redirect(res, '/admin?msg=' + encodeURIComponent(`Sent ${r.sent} ${what}${r.sent === 1 ? '' : 's'}.` + (r.failed ? ` ${r.failed} failed: ${r.errors[0]}` : '')));
    }
    mm = p.match(/^\/admin\/guests\/(\d+)\/invite$/);
    if (mm && m === 'POST') {
      const g = (await db.listGuests()).find(x => x.id === Number(mm[1]));
      if (!g || !g.email) return redirect(res, '/admin?msg=' + encodeURIComponent('That guest has no email address.'));
      if (!mail.enabled()) return redirect(res, `/admin?msg=` + encodeURIComponent('Email isn’t connected yet.'));
      const r = await mail.sendTo([g], 'invite', base, admin.name);
      return redirect(res, '/admin?msg=' + encodeURIComponent(r.sent ? `Invitation sent to ${g.email}.` : `Couldn’t send: ${r.errors[0]}`));
    }
    mm = p.match(/^\/admin\/guests\/(\d+)(\/delete|\/clear-rsvp)?$/);
    if (mm) {
      const id = Number(mm[1]);
      const all = await db.listGuests();
      const g = all.find(x => x.id === id);
      if (!g) return send(res, 404, views.notFound('That guest no longer exists.'));
      if (m === 'GET' && !mm[2]) return send(res, 200, views.adminEditGuest({ admin, g, baseUrl: base }), { 'Cache-Control': 'no-store' });
      if (m === 'POST' && mm[2] === '/delete') { await db.deleteGuest(id); return redirect(res, '/admin?msg=' + encodeURIComponent(`Removed ${g.first_name} ${g.last_name}.`)); }
      if (m === 'POST' && mm[2] === '/clear-rsvp') { await db.clearRsvp(id); return redirect(res, `/admin/guests/${id}`); }
      if (m === 'POST') {
        const b = await readBody(req);
        const first = clean(b.first_name, 60), email = clean(b.email, 120);
        if (!first) return send(res, 422, views.adminEditGuest({ admin, g, baseUrl: base, error: 'First name is required.' }));
        if (email && email.toLowerCase() !== (g.email || '').toLowerCase() && await db.emailExists(email))
          return send(res, 422, views.adminEditGuest({ admin, g, baseUrl: base, error: `${email} is already on the guest list.` }));
        await db.updateGuest(id, { first_name: first, last_name: clean(b.last_name, 60), email, grp: b.grp === 'travel' ? 'travel' : 'florida', plus_one_allowed: true });
        return redirect(res, '/admin?msg=' + encodeURIComponent(`Saved ${first}.`));
      }
    }
    mm = p.match(/^\/admin\/export\/(guests|travel|links)\.csv$/);
    if (mm && m === 'GET') return exportCsv(res, mm[1], req);
  }

  return send(res, 404, views.notFound('That page doesn’t exist.'));
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) send(res, 500, views.notFound('Something went wrong on our end. Please try again in a minute.'));
  });
});

db.init()
  .then(() => server.listen(config.port, () => console.log(`Soirée RSVP listening on :${config.port}`)))
  .catch(err => { console.error('Database init failed:', err); process.exit(1); });
