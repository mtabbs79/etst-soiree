const crypto = require('crypto');
const config = require('./config');

const COOKIE = 'etst_admin';
const MAX_AGE_S = 60 * 60 * 24 * 14; // 14 days

const sign = (v) => crypto.createHmac('sha256', config.sessionSecret).update(v).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function checkPassword(pw) {
  return !!config.adminPassword && safeEqual(pw, config.adminPassword);
}

function sessionCookie(name, secure) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = Buffer.from(JSON.stringify({ n: name, e: exp })).toString('base64url');
  const val = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`;
}

function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Returns { name } for a signed-in admin, or null.
function currentAdmin(req) {
  const raw = parseCookies(req)[COOKIE];
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    const { n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (e < Date.now() / 1000) return null;
    return { name: n };
  } catch { return null; }
}

module.exports = { checkPassword, sessionCookie, clearCookie, currentAdmin };
