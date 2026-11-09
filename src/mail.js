// Email: templates + sending through Resend's HTTP API (no extra libraries).
const config = require('./config');
const db = require('./db');
const E = config.event;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enabled = () => !!config.resendApiKey;

const DEADLINE_LINE = {
  travel: 'Due to travel arrangements, please RSVP no later than November 16',
  florida: 'Please RSVP by December 1, 2026',
};
const DEADLINE_SHORT = { travel: 'November 16', florida: 'December 1' };

// ---------- templates ----------

const C = { paper: '#f9ecd9', burgundy: '#7a1424', deep: '#4e0b16', gold: '#a9853b', goldLight: '#d7b56d', ink: '#3a2a22' };
const SERIF = "Georgia, 'Times New Roman', serif";

function shell(base, inner, preheader) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(E.title)} ${esc(E.titleAccent)}</title></head>
<body style="margin:0;padding:0;background:${C.deep};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.deep};">
<tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${C.paper};">
<tr><td style="padding:0;line-height:0;"><img src="${base}/static/hero.jpg" width="600" alt="Please join us for ETST's Annual A Very Merry Soirée. Friday, December 11, 2026, 7:00 to 11:00 PM. Miami Springs Country Club, 650 Curtiss Pkwy, Miami Springs, FL 33166. After party to follow." style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>
<tr><td style="background:${C.paper} url('${base}/static/paper.jpg') repeat-y top center;background-size:100% auto;padding:4px 48px 8px;font-family:${SERIF};color:${C.ink};text-align:center;">
${inner}
</td></tr>
<tr><td style="padding:0;line-height:0;"><img src="${base}/static/footer.jpg" width="600" alt="Leave the kids at home and join us for a night out! Attire: cocktail." style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>
</table>
<p style="font-family:${SERIF};font-size:12px;color:#d9bfa0;margin:14px 0 0;">Sent by ETST to ${'${to}'} · Questions? Reply to this email.</p>
</td></tr></table></body></html>`;
}

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 8px;"><tr>
<td style="background:${C.burgundy};border:2px solid ${C.goldLight};border-radius:10px;">
<a href="${href}" style="display:inline-block;padding:14px 38px;font-family:${SERIF};font-size:17px;letter-spacing:3px;color:#f6e7c8;text-decoration:none;text-transform:uppercase;">${esc(label)}</a>
</td></tr></table>`;
}

function plaque() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 14px;"><tr>
<td style="background:${C.burgundy};border:2px solid ${C.goldLight};border-radius:10px;padding:9px 30px;text-align:center;font-family:${SERIF};color:#f6e7c8;">
<div style="font-size:16px;letter-spacing:2px;text-transform:uppercase;">You and your plus one</div>
<div style="font-size:16px;font-style:italic;letter-spacing:1px;">are cordially invited</div></td></tr></table>`;
}

function deadlineBox(grp) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 10px;"><tr>
<td style="border:1.5px solid ${C.gold};border-radius:10px;padding:9px 22px;text-align:center;font-family:${SERIF};color:${C.burgundy};font-size:15px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;">${esc(DEADLINE_LINE[grp])}</td></tr></table>`;
}

const p = (html, extra = '') => `<p style="font-size:17px;line-height:1.55;margin:12px 0;${extra}">${html}</p>`;
const textToHtml = (t) => esc(t).split(/\n{2,}/).map(par => p(par.replace(/\n/g, '<br>'))).join('');

function link(base, g) { return `${base}/i/${g.token}`; }

function invite(g, base) {
  const url = link(base, g);
  const subject = g.grp === 'travel'
    ? `You're invited: A Very Merry Soirée · RSVP by ${DEADLINE_SHORT.travel}`
    : `You're invited: A Very Merry Soirée · Friday, December 11`;
  const inner = `
${plaque()}
${deadlineBox(g.grp)}
${p(`Dear ${esc(g.first_name)},`, 'font-size:19px;color:' + C.burgundy + ';margin-top:16px;')}
${p(g.grp === 'travel'
    ? 'We would love to celebrate the season with you in Miami. ETST is covering <strong>airfare and hotel</strong> for you and your plus one, so please reply soon so we can book your travel.'
    : 'We would love to celebrate the season with you. Please let us know if you and your plus one can join us.')}
${button(url, 'RSVP now')}
${p(`<span style="font-size:14px;color:#7b6a5d;">This link is just for you. You can use it to change your answer until ${DEADLINE_SHORT[g.grp]}.<br><a href="${url}" style="color:${C.burgundy};word-break:break-all;">${esc(url)}</a></span>`)}`;
  const text = `Dear ${g.first_name},

Please join us for ETST's Annual A Very Merry Soirée
${E.dateLong}, ${E.time}
${E.venue}, ${E.address}
After party to follow · Attire: Cocktail

You and your plus one are cordially invited.
${g.grp === 'travel' ? 'ETST is covering airfare and hotel for you and your plus one.\n' : ''}${DEADLINE_LINE[g.grp]}.

RSVP here: ${url}
`;
  return { subject, html: shell(base, inner, DEADLINE_LINE[g.grp]), text };
}

function reminder(g, base) {
  const url = link(base, g);
  const subject = `Reminder: please RSVP by ${DEADLINE_SHORT[g.grp]} · A Very Merry Soirée`;
  const inner = `
${p(`Dear ${esc(g.first_name)},`, 'font-size:19px;color:' + C.burgundy + ';margin-top:16px;')}
${p('We haven’t received your RSVP yet and want to make sure you have everything you need.')}
${deadlineBox(g.grp)}
${button(url, 'RSVP now')}
${p(`<span style="font-size:14px;color:#7b6a5d;"><a href="${url}" style="color:${C.burgundy};word-break:break-all;">${esc(url)}</a></span>`)}`;
  const text = `Dear ${g.first_name},\n\nWe haven't received your RSVP for ETST's A Very Merry Soirée (${E.dateLong}).\n${DEADLINE_LINE[g.grp]}.\n\nRSVP here: ${url}\n`;
  return { subject, html: shell(base, inner, DEADLINE_LINE[g.grp]), text };
}

function update(g, base, { subject, message }) {
  const url = link(base, g);
  const inner = `
${p(`Dear ${esc(g.first_name)},`, 'font-size:19px;color:' + C.burgundy + ';margin-top:16px;')}
<div style="text-align:left;">${textToHtml(message)}</div>
${button(url, 'View my RSVP')}`;
  const text = `Dear ${g.first_name},\n\n${message}\n\nYour RSVP: ${url}\n`;
  return { subject, html: shell(base, inner, String(message).slice(0, 120)), text };
}

function build(kind, g, base, opts = {}) {
  const m = kind === 'invite' ? invite(g, base) : kind === 'reminder' ? reminder(g, base) : update(g, base, opts);
  m.html = m.html.replace('${to}', esc(g.email || 'you'));
  return m;
}

// ---------- sending ----------

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postBatch(messages) {
  const res = await fetch(`${config.resendApiUrl}/emails/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Resend returned ${res.status}`);
  return Array.isArray(body.data) ? body.data : [];
}

// Sends `kind` to each guest. Returns { sent, failed, errors[] }.
async function sendTo(guests, kind, base, sentBy, opts = {}) {
  const out = { sent: 0, failed: 0, errors: [] };
  const list = guests.filter(g => g.email);
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    const built = chunk.map(g => ({ g, m: build(kind, g, base, opts) }));
    const payload = built.map(({ g, m }) => ({
      from: config.mailFrom, to: [opts.overrideTo || g.email], reply_to: config.mailReplyTo,
      subject: (opts.overrideTo ? '[TEST] ' : '') + m.subject, html: m.html, text: m.text,
    }));
    try {
      const ids = await postBatch(payload);
      for (let j = 0; j < built.length; j++) {
        const { g, m } = built[j];
        out.sent++;
        if (!opts.overrideTo) await db.logEmail({ guest_id: g.id, to_email: g.email, kind, subject: m.subject, status: 'sent', provider_id: ids[j] && ids[j].id, sent_by: sentBy });
      }
    } catch (err) {
      out.failed += built.length;
      out.errors.push(err.message);
      if (!opts.overrideTo) {
        for (const { g, m } of built) await db.logEmail({ guest_id: g.id, to_email: g.email, kind, subject: m.subject, status: 'failed', error: err.message, sent_by: sentBy });
      }
    }
    if (i + 50 < list.length) await sleep(700);
  }
  return out;
}

// ---------- inbox (emails received at @etstevent.com through Resend) ----------

async function resendGet(path) {
  const res = await fetch(`${config.resendApiUrl}${path}`, { headers: { Authorization: `Bearer ${config.resendApiKey}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Resend returned ${res.status}`);
  return body;
}

async function listReceived(limit = 50) {
  const body = await resendGet(`/emails/receiving?limit=${limit}`);
  return Array.isArray(body.data) ? body.data : [];
}

async function getReceived(id) {
  return resendGet(`/emails/receiving/${encodeURIComponent(id)}`);
}

// Plain-address part of "Name <a@b.com>".
const addressOf = (v) => { const m = String(v || '').match(/<([^>]+)>/); return (m ? m[1] : String(v || '')).trim(); };

// The two mailboxes admins read and write from: info@ (questions) and rsvp@ (invitations go out from it).
const mailboxes = () => [...new Set([addressOf(config.mailReplyTo), addressOf(config.mailFrom)].filter(Boolean).map(a => a.toLowerCase()))];

async function sendMessage({ from, to, subject, text, inReplyTo }) {
  const fromAddr = mailboxes().includes(String(from || '').toLowerCase()) ? from.toLowerCase() : mailboxes()[0];
  const headers = inReplyTo ? { 'In-Reply-To': inReplyTo, References: inReplyTo } : undefined;
  const res = await fetch(`${config.resendApiUrl}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `ETST's Very Merry Soirée <${fromAddr}>`, to: [to], reply_to: fromAddr, subject, text, headers }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Resend returned ${res.status}`);
  return { ...body, from: fromAddr };
}

// Latest delivery event ("delivered", "bounced", ...) for each Resend email id.
// Uses the email list first (100 per call), then single lookups for any not found.
async function deliveryEvents(ids) {
  const want = new Set(ids), out = {};
  try {
    let after = '';
    for (let page = 0; page < 10 && Object.keys(out).length < want.size; page++) {
      const body = await resendGet(`/emails?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`);
      const data = Array.isArray(body.data) ? body.data : [];
      for (const e of data) if (want.has(e.id)) out[e.id] = e.last_event || '';
      if (!body.has_more || !data.length) break;
      after = data[data.length - 1].id;
      await sleep(600);
    }
  } catch (err) { console.error('Delivery list lookup failed:', err.message); }
  const missing = ids.filter(id => !(id in out)).slice(0, 60);
  for (const id of missing) {
    try { const e = await resendGet(`/emails/${encodeURIComponent(id)}`); out[id] = e.last_event || ''; }
    catch (err) { console.error('Delivery lookup failed:', err.message); }
    await sleep(600);
  }
  return out;
}

module.exports = { deliveryEvents, enabled, build, sendTo, DEADLINE_SHORT, listReceived, getReceived, sendMessage, mailboxes, addressOf };
