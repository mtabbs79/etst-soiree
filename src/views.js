const config = require('./config');
const E = config.event;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attr = esc;

const fmtET = (d) => new Date(d).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) + ' ET';
const fmtShortET = (d) => d ? new Date(d).toLocaleString('en-US', {
  timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '';

function timeLeft(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) return 'RSVP is closed';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days >= 2) return `${days} days left to RSVP`;
  if (days === 1) return `1 day, ${hours} hours left to RSVP`;
  return `${Math.max(hours, 1)} hour${hours === 1 ? '' : 's'} left to RSVP`;
}

function layout(title, body, { admin = false, bodyClass = '' } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Great+Vibes&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/style.css?v=8">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='24' cy='40' r='12' fill='%237a1424'/><circle cx='42' cy='36' r='12' fill='%23a3203a'/><path d='M30 26 C34 14 44 10 52 12' stroke='%232f4a2a' stroke-width='5' fill='none'/></svg>">
</head>
<body class="${admin ? 'admin' : 'guest'} ${bodyClass}">
${body}
</body>
</html>`;
}

function card(inner) {
  return `<main class="frame"><div class="card">
  <img class="hero" src="/static/hero.jpg" width="1024" height="1057"
    alt="Please join us for ETST's Annual A Very Merry Soirée. Friday, December 11, 2026, 7:00 to 11:00 PM. Miami Springs Country Club, 650 Curtiss Pkwy, Miami Springs, FL 33166. After party to follow.">
  <div class="paper"><div class="paper-in">${inner}</div></div>
  <img class="footer-art" src="/static/footer.jpg" width="1024" height="461" alt="Leave the kids at home and join us for a night out! Attire: cocktail.">
</div></main>`;
}

function eventHeader() {
  return `<p class="maplink"><a href="${attr(E.mapUrl)}" target="_blank" rel="noopener">Map &amp; directions</a></p>`;
}

function bowSvg() {
  return `<svg width="44" height="22" viewBox="0 0 44 22" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M22 11 C14 2 4 2 4 8 C4 14 14 14 22 11 Z"/><path d="M22 11 C30 2 40 2 40 8 C40 14 30 14 22 11 Z"/><path d="M22 11 L15 21 M22 11 L29 21"/><circle cx="22" cy="11" r="2.2" fill="currentColor"/></svg>`;
}

function footerNotes() { return ''; }

function contactLine() {
  return config.contactEmail
    ? `Questions? Email <a href="mailto:${attr(config.contactEmail)}">${esc(config.contactEmail)}</a>.`
    : 'Questions? Reach out to the ETST admin team.';
}

// ---------- Guest pages ----------

function home({ error = '', values = {} } = {}) {
  return layout(`${E.title} ${E.titleAccent} · ETST`, card(`
  ${eventHeader()}
  <div class="banner"><strong>You and your plus one</strong><em>are cordially invited</em></div>
  <div class="notice">
    <p>Each guest has a <strong>personal RSVP link</strong> in their invitation email. Can’t find it? Look up your invitation below.</p>
    <p class="small">${contactLine()}</p>
  </div>
  <form method="post" action="/find" class="rsvp lookup">
    <fieldset>
      <legend>Find your invitation</legend>
      <p class="hint">Enter your name and the email address your invitation was sent to.</p>
      ${error ? `<div class="errors">${esc(error)}</div>` : ''}
      <label class="field"><span>Your name</span>
        <input name="name" value="${attr(values.name || '')}" required maxlength="120" autocomplete="name" placeholder="First and last name"></label>
      <label class="field"><span>Email</span>
        <input type="email" name="email" value="${attr(values.email || '')}" required maxlength="120" autocomplete="email" inputmode="email"></label>
      <button class="btn">Find my RSVP</button>
    </fieldset>
  </form>
  ${footerNotes()}`));
}

function radio(name, value, label, checked) {
  return `<label class="choice"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''} required><span>${label}</span></label>`;
}

function rsvpForm(g, { errors = [], values = null, closed = false, adminView = false } = {}) {
  const isTravel = g.grp === 'travel';
  const deadline = config.deadlines[g.grp];
  const v = values || (g.responded ? {
    attending: g.attending ? 'yes' : 'no', plus_one: g.plus_one ? 'yes' : 'no', plus_one_name: g.plus_one_name,
    after_party: g.after_party, dietary: g.dietary, phone: g.phone, legal_name: g.legal_name,
    plus_one_legal_name: g.plus_one_legal_name, home_airport: g.home_airport, arrival_date: g.arrival_date,
    departure_date: g.departure_date, needs_hotel: g.attending && !g.needs_hotel ? 'no' : 'yes', travel_notes: g.travel_notes,
  } : {});
  const name = esc(g.first_name);

  const status = g.responded
    ? `<div class="status ${g.attending ? 'yes' : 'no'}">We have your reply: <strong>${g.attending ? 'Attending' : 'Not attending'}</strong>${g.attending && g.plus_one ? ` with ${esc(g.plus_one_name)}` : ''}. <span class="small">Last updated ${esc(fmtShortET(g.updated_at))}.</span></div>`
    : '';

  const errorBox = errors.length
    ? `<div class="errors" role="alert"><strong>Please check a few things:</strong><ul>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`
    : '';

  const deadlineBox = `<div class="deadline ${isTravel ? 'travel' : ''}"><strong>${isTravel
      ? 'Due to travel arrangements,<br>please RSVP no later than November 16' : 'RSVP by December 1, 2026'}</strong></div>
  <p class="countdown">${esc(timeLeft(deadline))} · closes ${esc(fmtET(deadline))}</p>`;

  const adminBar = adminView ? `<div class="admin-bar">Admin view: you can edit this RSVP even after the deadline. <a href="/admin">Back to dashboard</a></div>` : '';

  if (closed) {
    return layout(`RSVP · ${E.title} ${E.titleAccent}`, card(`
    ${eventHeader()}
    <div class="greeting"><p class="script small-script">Dear ${name},</p></div>
    ${status || '<div class="status no">We did not receive a reply before the deadline.</div>'}
    <div class="notice"><p>Online RSVP for your invitation closed on ${esc(fmtET(deadline))}.</p><p class="small">${contactLine()}</p></div>
    ${inviteThumb(g)}
    ${footerNotes()}`));
  }

  const plusOneBlock = true ? `
    <fieldset data-show="attending=yes">
      <legend>Will you bring a plus one?</legend>
      <div class="choices">${radio('plus_one', 'yes', 'Yes, I’ll bring a guest', v.plus_one === 'yes')}${radio('plus_one', 'no', 'Just me', v.plus_one === 'no')}</div>
      <label class="field" data-show="plus_one=yes"><span>Guest’s full name</span>
        <input name="plus_one_name" value="${attr(v.plus_one_name)}" autocomplete="off" maxlength="120"></label>
    </fieldset>` : '<input type="hidden" name="plus_one" value="no">';

  const travelBlock = isTravel ? `
    <fieldset data-show="attending=yes" class="travel-fields">
      <legend>Travel details</legend>
      <p class="hint">ETST is arranging airfare and hotel. Enter names <strong>exactly as they appear on the photo ID</strong> you’ll fly with.</p>
      <label class="field"><span>Your legal name (as on ID)</span>
        <input name="legal_name" value="${attr(v.legal_name)}" maxlength="120" autocomplete="name"></label>
      ${true ? `<label class="field" data-show="plus_one=yes"><span>Guest’s legal name (as on ID)</span>
        <input name="plus_one_legal_name" value="${attr(v.plus_one_legal_name)}" maxlength="120" autocomplete="off"></label>` : ''}
      <label class="field"><span>Home airport (city or code)</span>
        <input name="home_airport" value="${attr(v.home_airport)}" maxlength="60" placeholder="e.g. ATL or Atlanta"></label>
      <div class="two">
        <label class="field"><span>Preferred arrival date</span>
          <input type="date" name="arrival_date" value="${attr(v.arrival_date)}" min="2026-12-08" max="2026-12-11"></label>
        <label class="field"><span>Preferred departure date</span>
          <input type="date" name="departure_date" value="${attr(v.departure_date)}" min="2026-12-11" max="2026-12-15"></label>
      </div>
      <div class="choices-label">Do you need a hotel room?</div>
      <div class="choices">${radio('needs_hotel', 'yes', 'Yes', v.needs_hotel !== 'no')}${radio('needs_hotel', 'no', 'No, I have a place to stay', v.needs_hotel === 'no')}</div>
      <label class="field"><span>Anything else for travel? <em>(optional)</em></span>
        <textarea name="travel_notes" rows="2" maxlength="600" placeholder="Seat preference, time constraints, known traveler number to add later…">${esc(v.travel_notes)}</textarea></label>
    </fieldset>` : '';

  return layout(`RSVP · ${E.title} ${E.titleAccent}`, card(`
  ${adminBar}
  ${eventHeader()}
  <div class="banner"><strong>You and your plus one</strong><em>are cordially invited</em></div>
  ${deadlineBox}
  <div class="greeting"><p class="script small-script">Dear ${name},</p></div>
  ${status}
  ${errorBox}
  <form method="post" class="rsvp" novalidate>
    <fieldset>
      <legend>Will you join us?</legend>
      <div class="choices big">${radio('attending', 'yes', 'Joyfully accepts', v.attending === 'yes')}${radio('attending', 'no', 'Regretfully declines', v.attending === 'no')}</div>
    </fieldset>
    ${plusOneBlock}
    <fieldset data-show="attending=yes">
      <legend>A few details</legend>
      <div class="choices-label">Will you join the after party?</div>
      <div class="choices">${radio('after_party', 'yes', 'Yes', v.after_party === 'yes')}${radio('after_party', 'maybe', 'Maybe', v.after_party === 'maybe')}${radio('after_party', 'no', 'No', v.after_party === 'no')}</div>
      <label class="field"><span>Dietary needs or allergies <em>(optional)</em></span>
        <input name="dietary" value="${attr(v.dietary)}" maxlength="200" placeholder="For you and your guest"></label>
      <label class="field"><span>Cell phone${isTravel ? '' : ' <em>(optional)</em>'}</span>
        <input type="tel" name="phone" value="${attr(v.phone)}" maxlength="30" autocomplete="tel" placeholder="For day-of updates"></label>
    </fieldset>
    ${travelBlock}
    <button type="submit" class="btn">${g.responded ? 'Update my RSVP' : 'Send my RSVP'}</button>
    <p class="small center">You can come back to this link and change your answer until the deadline.</p>
  </form>
  ${inviteThumb(g)}
  ${footerNotes()}
  <p class="small center contact">${contactLine()}</p>
  `) + showWhenScript());
}

function inviteThumb(g) {
  // The travel artwork still prints the old Nov 13 date, so don't show it until it's updated.
  if (g.grp === 'travel') return '';
  const src = `/static/invite-${g.grp}.jpg`;
  return `<details class="invite"><summary>View your invitation</summary><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="Invitation to ${attr(E.title)} ${attr(E.titleAccent)}" loading="lazy" width="1024" height="1536"></a></details>`;
}

function showWhenScript() {
  return `<script>
(function(){
  var form=document.querySelector('form.rsvp'); if(!form) return;
  function val(n){var el=form.querySelector('input[name="'+n+'"]:checked')||form.querySelector('input[type=hidden][name="'+n+'"]');return el?el.value:'';}
  function sync(){
    form.querySelectorAll('[data-show]').forEach(function(el){
      var p=el.getAttribute('data-show').split('=');
      el.hidden = val(p[0])!==p[1];
    });
    form.querySelectorAll('input,textarea,select').forEach(function(i){
      i.disabled = !!i.closest('[data-show][hidden]');
    });
  }
  form.addEventListener('change',sync); sync();
})();
</script>`;
}

function thanks(g) {
  const coming = g.attending;
  return layout(`Thank you · ${E.title} ${E.titleAccent}`, card(`
  <p class="script">${coming ? 'See you there!' : 'You’ll be missed'}</p>
  <div class="status ${coming ? 'yes' : 'no'}">
    ${coming
      ? `Thank you, ${esc(g.first_name)}. We’ve got you down as <strong>attending</strong>${g.plus_one ? ` with <strong>${esc(g.plus_one_name)}</strong>` : ''}.`
      : `Thank you for letting us know, ${esc(g.first_name)}. We’ve recorded that you can’t make it.`}
  </div>
  ${coming && g.grp === 'travel' ? '<div class="notice"><p>Our team will be in touch with your flight and hotel details.</p></div>' : ''}
  <div class="detail-list">
    <p><span>When</span>${esc(E.dateLong)}, ${esc(E.time)}</p>
    <p><span>Where</span>${esc(E.venue)}, <a href="${attr(E.mapUrl)}" target="_blank" rel="noopener">${esc(E.address)}</a></p>
    <p><span>Attire</span>${esc(E.attire)}</p>
  </div>
  <p class="center"><a class="btn ghost" href="/i/${attr(g.token)}">Change my answer</a></p>
  <p class="small center">Bookmark this page’s link. You can update your RSVP until ${esc(fmtET(config.deadlines[g.grp]))}.</p>
  ${footerNotes()}`));
}

function notFound(msg = 'We couldn’t find that invitation.') {
  return layout('Not found', card(`
  <p class="script">Oh, dear</p>
  <div class="notice"><p>${esc(msg)}</p><p class="small">Please double-check the link in your invitation email. ${contactLine()}</p></div>`));
}

// ---------- Admin pages ----------

function adminShell(title, inner, admin) {
  return layout(`${title} · Soirée admin`, `
  <header class="admin-top">
    <div><span class="script-mini">A Very Merry Soirée</span><span class="admin-label">RSVP admin</span></div>
    ${admin ? `<nav><a class="link" href="/admin">Guests</a> <a class="link" href="/admin/inbox">Inbox</a> <span class="who">Signed in as ${esc(admin.name)}</span><form method="post" action="/admin/logout"><button class="link">Sign out</button></form></nav>` : ''}
  </header>
  <main class="admin-main">${inner}</main>`, { admin: true });
}

function adminLogin(error) {
  return adminShell('Sign in', `
  <form method="post" action="/admin/login" class="panel login">
    <h1>Admin sign-in</h1>
    ${error ? `<div class="errors">${esc(error)}</div>` : ''}
    ${config.adminPassword ? '' : '<div class="errors">ADMIN_PASSWORD is not set on the server, so sign-in is disabled.</div>'}
    <label class="field"><span>Your name</span><input name="name" required maxlength="60" autocomplete="name"></label>
    <label class="field"><span>Admin password</span><input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn">Sign in</button>
  </form>`);
}

function statusOf(g) { return !g.responded ? 'pending' : g.attending ? 'yes' : 'no'; }

function stats(guests) {
  const s = { all: mk(), florida: mk(), travel: mk() };
  function mk() { return { invited: 0, yes: 0, no: 0, pending: 0, heads: 0, plusOnes: 0, after: 0, hotel: 0 }; }
  for (const g of guests) {
    for (const k of ['all', g.grp]) {
      const t = s[k];
      t.invited++;
      t[statusOf(g)]++;
      if (g.responded && g.attending) {
        t.heads += 1 + (g.plus_one ? 1 : 0);
        if (g.plus_one) t.plusOnes++;
        if (g.after_party === 'yes') t.after += 1 + (g.plus_one ? 1 : 0);
        if (g.grp === 'travel' && g.needs_hotel) t.hotel++;
      }
    }
  }
  return s;
}

function tile(label, value, sub) {
  return `<div class="tile"><div class="tile-v">${value}</div><div class="tile-l">${label}</div>${sub ? `<div class="tile-s">${sub}</div>` : ''}</div>`;
}

function adminDashboard({ admin, guests, baseUrl, flash, importReport, email = {} }) {
  const s = stats(guests);
  const now = Date.now();
  const dl = (grp) => `${now > config.deadlines[grp] ? 'Closed' : 'Closes'} ${fmtShortET(config.deadlines[grp])}`;
  const group = (k, label) => {
    const t = s[k];
    return `<section class="panel group">
      <h2>${label} <span class="muted">${k === 'all' ? '' : dl(k)}</span></h2>
      <div class="tiles">
        ${tile('Total headcount', t.heads, `${t.yes} guest${t.yes === 1 ? '' : 's'} + ${t.plusOnes} plus one${t.plusOnes === 1 ? '' : 's'}`)}
        ${tile('Attending', t.yes)}
        ${tile('Declined', t.no)}
        ${tile('No reply yet', t.pending, `of ${t.invited} invited`)}
        ${tile('After party (people)', t.after)}
        ${k !== 'florida' ? tile('Hotel rooms', t.hotel) : ''}
      </div>
    </section>`;
  };

  const rows = guests.map(g => {
    const st = statusOf(g);
    const link = `${baseUrl}/i/${g.token}`;
    const search = `${g.first_name} ${g.last_name} ${g.email} ${g.plus_one_name || ''}`.toLowerCase();
    const domain = (g.email.split('@')[1] || '').toLowerCase();
    const plus = g.responded && g.attending ? (g.plus_one ? 'yes' : 'no') : '';
    return `<tr data-grp="${g.grp}" data-st="${st}" data-q="${attr(search)}" data-first="${attr(g.first_name.toLowerCase())}" data-last="${attr((g.last_name || '').toLowerCase())}"
      data-email="${attr(g.email.toLowerCase())}" data-co="${attr(domain)}" data-inv="${g.invited_at ? 'yes' : 'no'}" data-invat="${g.invited_at ? new Date(g.invited_at).toISOString() : ''}"
      data-upd="${g.responded ? new Date(g.updated_at).toISOString() : ''}" data-plus="${plus}" data-after="${g.responded && g.attending ? attr(g.after_party || '') : ''}">
      <td><strong>${esc(g.first_name)} ${esc(g.last_name)}</strong><div class="muted">${esc(g.email)}</div></td>
      <td><span class="pill ${g.grp}">${g.grp === 'travel' ? 'Travel' : 'Florida'}</span></td>
      <td>${g.invited_at ? `<div class="muted">Invited ${esc(fmtShortET(g.invited_at))}${g.invite_count > 1 ? ` (${g.invite_count}×)` : ''}</div>` : (g.email ? '<div class="muted">Not invited yet</div>' : '<div class="muted warn">No email</div>')}<span class="pill st-${st}">${st === 'yes' ? 'Attending' : st === 'no' ? 'Declined' : 'No reply'}</span>${g.responded ? `<div class="muted">${esc(fmtShortET(g.updated_at))}${g.updated_by !== 'guest' ? ' · by ' + esc(g.updated_by) : ''}</div>` : ''}</td>
      <td>${g.responded && g.attending && g.plus_one ? esc(g.plus_one_name) : '<span class="muted">—</span>'}</td>
      <td class="muted">${g.responded && g.attending ? esc([g.after_party ? 'After party: ' + g.after_party : '', g.dietary ? 'Diet: ' + g.dietary : ''].filter(Boolean).join(' · ')) : ''}</td>
      <td class="actions">
        <button type="button" class="link copy" data-link="${attr(link)}">Copy link</button>
        <a class="link" href="/i/${attr(g.token)}" target="_blank">Open RSVP</a>
        <a class="link" href="/admin/guests/${g.id}">Edit</a>
      </td>
    </tr>`;
  }).join('');

  const companies = [...new Set(guests.map(g => (g.email.split('@')[1] || '').toLowerCase()).filter(Boolean))].sort();
  return adminShell('Dashboard', `
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  ${importReport || ''}
  ${!baseUrl.startsWith('http') ? '' : ''}
  <div class="grid-3">${group('all', 'Everyone')}${group('florida', 'Florida')}${group('travel', 'Out of state (travel)')}</div>

  ${emailPanel(guests, email)}
  <section class="panel">
    <div class="panel-head">
      <h2>Guests <span class="muted">(${guests.length})</span></h2>
      <div class="downloads">
        <a class="btn small ghost" href="/admin/export/guests.csv">Download all (Excel/CSV)</a>
        <a class="btn small ghost" href="/admin/export/travel.csv">Download travel list</a>
        <a class="btn small ghost" href="/admin/export/links.csv">Download links for mail merge</a>
      </div>
    </div>
    <div class="filters">
      <input type="search" id="q" placeholder="Search name or email…">
      <select id="fg"><option value="">All groups</option><option value="florida">Florida</option><option value="travel">Travel</option></select>
      <select id="fs"><option value="">Any status</option><option value="yes">Attending</option><option value="no">Declined</option><option value="pending">No reply</option></select>
      <select id="fco"><option value="">All companies</option>${companies.map(d => `<option value="${attr(d)}">${esc(d)}</option>`).join('')}</select>
      <select id="finv"><option value="">Invited or not</option><option value="yes">Invitation sent</option><option value="no">Not invited yet</option></select>
      <select id="fplus"><option value="">Plus one: any</option><option value="yes">Bringing a plus one</option><option value="no">Coming alone</option></select>
      <select id="fafter"><option value="">After party: any</option><option value="yes">After party: yes</option><option value="maybe">After party: maybe</option><option value="no">After party: no</option></select>
      <label class="sortby">Sort by <select id="sortby">
        <option value="last">Last name</option><option value="first">First name</option><option value="email">Email</option><option value="co">Company (email)</option>
        <option value="grp">Group</option><option value="st">Status</option><option value="plus">Plus one</option><option value="after">After party</option>
        <option value="invat">Date invited</option><option value="upd">Date replied</option>
      </select></label>
      <button type="button" class="link" id="sortdir" title="Reverse order">A→Z</button>
      <button type="button" class="link" id="fclear">Clear filters</button>
      <span class="muted" id="count"></span>
    </div>
    <div class="table-wrap"><table class="guests">
      <thead><tr><th class="sort" data-sort="last">Guest</th><th class="sort" data-sort="grp">Group</th><th class="sort" data-sort="st">Status</th><th class="sort" data-sort="plus">Plus one</th><th class="sort" data-sort="after">Details</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted center">No guests yet. Add one below or import your list.</td></tr>'}</tbody>
    </table></div>
  </section>

  <div class="grid-2">
    <section class="panel">
      <h2>Add a guest</h2>
      <form method="post" action="/admin/guests" class="stack">
        ${guestFields({ grp: 'florida' })}
        <button class="btn">Add guest</button>
      </form>
    </section>
    <section class="panel">
      <h2>Import guest list</h2>
      <p class="muted">Paste from Excel or a CSV. Columns, in this order, with or without a header row:</p>
      <code class="cols">first name, last name, email, location</code>
      <p class="muted small">Location: <em>Florida</em> or <em>Other</em>. Florida = local invite (RSVP by Dec 1). Other = out of state, travel invite (RSVP by Nov 16, airfare and hotel covered). Rows with a blank location are not imported. Every guest is invited with a plus one. Emails already on the list are skipped.</p>
      <form method="post" action="/admin/import" class="stack">
        <textarea name="csv" rows="7" placeholder="Jane,Smith,jane@example.com,Florida&#10;Tom,Lee,tom@example.com,Other"></textarea>
        <button class="btn">Import</button>
      </form>
    </section>
  </div>
  ${adminScript()}`, admin);
}

function emailPanel(guests, email) {
  const notInvited = (grp) => guests.filter(g => g.email && !g.invited_at && (grp === 'all' || g.grp === grp)).length;
  const pending = (grp) => guests.filter(g => g.email && !g.responded && (grp === 'all' || g.grp === grp)).length;
  const grpSelect = `<select name="grp"><option value="all">Everyone</option><option value="florida">Florida</option><option value="travel">Travel</option></select>`;
  const recent = (email.recent || []).map(r => `<li><strong>${esc({ invite: 'Invitations', reminder: 'Reminder', update: 'Update' }[r.kind] || r.kind)}</strong> · ${esc(r.subject)} · ${r.sent} sent${r.failed ? `, <span class="warn">${r.failed} failed</span>` : ''} · ${esc(fmtShortET(r.at))} by ${esc(r.sent_by)}</li>`).join('');
  return `<section class="panel email-panel">
    <div class="panel-head"><h2>Email guests</h2>
      <span class="muted">From ${esc(config.mailFrom)} · replies go to ${esc(config.mailReplyTo)}${email.enabled ? ` · ${email.sentToday} sent in the last 24 hours` : ''}</span></div>
    ${email.enabled ? '' : '<div class="errors">Email isn’t connected yet (RESEND_API_KEY isn’t set). You can still preview every email.</div>'}
    <div class="grid-3">
      <form method="post" action="/admin/email/preview" class="stack mini">
        <input type="hidden" name="kind" value="invite">
        <h3>Send invitations</h3>
        <p class="muted">Not invited yet: ${notInvited('florida')} Florida · ${notInvited('travel')} Travel</p>
        <label class="field"><span>Who</span>${grpSelect}</label>
        <label class="field"><span>Include guests already invited?</span><select name="who"><option value="new">No, only guests not invited yet</option><option value="everyone">Yes, resend to everyone in the group</option></select></label>
        <label class="field"><span>Send at most</span><input type="number" name="limit" value="100" min="1" max="1000"></label>
        <button class="btn">Preview</button>
      </form>
      <form method="post" action="/admin/email/preview" class="stack mini">
        <input type="hidden" name="kind" value="reminder">
        <h3>Remind people who haven’t replied</h3>
        <p class="muted">No reply yet: ${pending('florida')} Florida · ${pending('travel')} Travel</p>
        <label class="field"><span>Who</span>${grpSelect}</label>
        <input type="hidden" name="who" value="pending">
        <label class="field"><span>Send at most</span><input type="number" name="limit" value="100" min="1" max="1000"></label>
        <button class="btn">Preview</button>
      </form>
      <form method="post" action="/admin/email/preview" class="stack mini">
        <input type="hidden" name="kind" value="update">
        <h3>Send a party update</h3>
        <div class="two">
          <label class="field"><span>Group</span>${grpSelect}</label>
          <label class="field"><span>Status</span><select name="who"><option value="attending">Attending</option><option value="pending">No reply yet</option><option value="everyone">Everyone invited</option></select></label>
        </div>
        <label class="field"><span>Subject</span><input name="subject" required maxlength="150" placeholder="Soirée update: parking & valet"></label>
        <label class="field"><span>Message</span><textarea name="message" rows="4" required maxlength="5000" placeholder="Write your update. Leave a blank line between paragraphs."></textarea></label>
        <input type="hidden" name="limit" value="1000">
        <button class="btn">Preview</button>
      </form>
    </div>
    ${recent ? `<details class="recent"><summary>Recent sends</summary><ul>${recent}</ul></details>` : ''}
  </section>`;
}

function adminEmailPreview({ admin, kind, form, recipients, skipped, sample, enabled }) {
  const label = { invite: 'invitation', reminder: 'reminder', update: 'update' }[kind];
  const hidden = Object.entries(form).map(([k, v]) => `<input type="hidden" name="${attr(k)}" value="${attr(v)}">`).join('');
  const names = recipients.slice(0, 40).map(g => `${esc(g.first_name)} ${esc(g.last_name)}`).join(', ') + (recipients.length > 40 ? `, and ${recipients.length - 40} more` : '');
  return adminShell('Preview email', `
  <p><a href="/admin" class="link">← Back to dashboard</a></p>
  <div class="grid-2 preview-grid">
    <section class="panel">
      <h2>Send this ${label} to ${recipients.length} guest${recipients.length === 1 ? '' : 's'}?</h2>
      ${recipients.length ? `<p class="muted">${names}</p>` : '<p>Nobody matches. Nothing to send.</p>'}
      ${skipped ? `<p class="muted warn">${skipped} guest${skipped === 1 ? ' has' : 's have'} no email address and will be skipped.</p>` : ''}
      ${sample ? `<p><strong>Subject:</strong> ${esc(sample.subject)}</p>` : ''}
      ${!enabled ? '<div class="errors">Email isn’t connected yet, so sending is turned off.</div>' : ''}
      <form method="post" action="/admin/email/test" class="stack">
        ${hidden}
        <label class="field"><span>Send a test to yourself first</span><input type="email" name="test_to" required placeholder="you@example.com"></label>
        <button class="btn ghost small" ${enabled && recipients.length ? '' : 'disabled'}>Send test</button>
      </form>
      <hr>
      <form method="post" action="/admin/email/send" onsubmit="if(!confirm('Send this email to ${recipients.length} real guest${recipients.length === 1 ? '' : 's'} now? This can’t be undone.'))return false;this.querySelector('button').disabled=true;this.querySelector('button').textContent='Sending…';">
        ${hidden}
        <button class="btn" ${enabled && recipients.length ? '' : 'disabled'}>Send to ${recipients.length} guest${recipients.length === 1 ? '' : 's'}</button>
      </form>
    </section>
    <section class="panel">
      <h2>Preview${sample ? ` (as ${esc(sample.forName)} will see it)` : ''}</h2>
      ${sample ? `<iframe class="email-frame" sandbox srcdoc="${attr(sample.html)}"></iframe>` : '<p class="muted">No preview.</p>'}
    </section>
  </div>`, admin);
}

function guestFields(g) {
  return `
  <div class="two">
    <label class="field"><span>First name</span><input name="first_name" value="${attr(g.first_name)}" required maxlength="60"></label>
    <label class="field"><span>Last name</span><input name="last_name" value="${attr(g.last_name)}" maxlength="60"></label>
  </div>
  <label class="field"><span>Email</span><input type="email" name="email" value="${attr(g.email)}" maxlength="120"></label>
  <div>
    <label class="field"><span>Invitation</span><select name="grp">
      <option value="florida" ${g.grp === 'florida' ? 'selected' : ''}>Florida (RSVP Dec 1)</option>
      <option value="travel" ${g.grp === 'travel' ? 'selected' : ''}>Out of state, travel (RSVP Nov 16)</option>
    </select></label>

  </div>`;
}

function adminEditGuest({ admin, g, baseUrl, error }) {
  const link = `${baseUrl}/i/${g.token}`;
  return adminShell('Edit guest', `
  <p><a href="/admin" class="link">← Back to dashboard</a></p>
  <div class="grid-2">
    <section class="panel">
      <h2>${esc(g.first_name)} ${esc(g.last_name)}</h2>
      ${error ? `<div class="errors">${esc(error)}</div>` : ''}
      <p class="muted">Personal RSVP link:</p>
      <p><code class="linkbox">${esc(link)}</code> <button type="button" class="link copy" data-link="${attr(link)}">Copy</button></p>
      <form method="post" action="/admin/guests/${g.id}" class="stack">
        ${guestFields(g)}
        <button class="btn">Save changes</button>
      </form>
    </section>
    <section class="panel">
      <h2>Invitation email</h2>
      <p class="muted">${g.invited_at ? `Sent ${esc(fmtShortET(g.invited_at))}${g.invite_count > 1 ? ` (${g.invite_count} times)` : ''}.` : 'Not sent yet.'}</p>
      ${g.email ? `<form method="post" action="/admin/guests/${g.id}/invite" onsubmit="return confirm('Email the invitation to ${attr(g.email)}?')"><button class="btn ghost small">${g.invited_at ? 'Resend invitation' : 'Send invitation'}</button></form>` : '<p class="muted warn">Add an email address to send the invitation.</p>'}
      <hr>
      <h2>RSVP</h2>
      ${g.responded ? rsvpSummary(g) : '<p class="muted">No reply yet.</p>'}
      <p><a class="btn ghost small" href="/i/${attr(g.token)}" target="_blank">${g.responded ? 'Edit their RSVP' : 'RSVP on their behalf'}</a></p>
      ${g.responded ? `<form method="post" action="/admin/guests/${g.id}/clear-rsvp" onsubmit="return confirm('Clear this RSVP and mark as no reply?')"><button class="link danger">Clear RSVP</button></form>` : ''}
      <hr>
      <form method="post" action="/admin/guests/${g.id}/delete" onsubmit="return confirm('Remove ${attr(g.first_name)} from the guest list? Their link will stop working.')">
        <button class="link danger">Remove guest</button>
      </form>
    </section>
  </div>
  ${adminScript()}`, admin);
}

function rsvpSummary(g) {
  const row = (k, v) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '';
  return `<table class="kv">
    ${row('Attending', g.attending ? 'Yes' : 'No')}
    ${g.attending ? row('Plus one', g.plus_one ? g.plus_one_name : 'No') : ''}
    ${g.attending ? row('After party', g.after_party) : ''}
    ${row('Dietary', g.dietary)}
    ${row('Phone', g.phone)}
    ${row('Legal name', g.legal_name)}
    ${row('Guest legal name', g.plus_one ? g.plus_one_legal_name : '')}
    ${row('Home airport', g.home_airport)}
    ${row('Arrive', g.arrival_date)}
    ${row('Depart', g.departure_date)}
    ${g.grp === 'travel' && g.attending ? row('Hotel', g.needs_hotel ? 'Yes' : 'No') : ''}
    ${row('Travel notes', g.travel_notes)}
    ${row('Last updated', fmtShortET(g.updated_at) + (g.updated_by !== 'guest' ? ' by ' + g.updated_by : ' by guest'))}
  </table>`;
}

function adminScript() {
  return `<script>
document.addEventListener('click',function(e){
  var b=e.target.closest('.copy'); if(!b) return;
  var t=b.getAttribute('data-link');
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent='Copied!';setTimeout(function(){b.textContent='Copy link'},1500)},function(){prompt('Copy this link:',t)});
});
(function(){
  var $=function(id){return document.getElementById(id)};
  var q=$('q'),c=$('count'),sel=$('sortby'),dirBtn=$('sortdir');
  if(!q) return;
  var filters={grp:$('fg'),st:$('fs'),co:$('fco'),inv:$('finv'),plus:$('fplus'),after:$('fafter')};
  var tbody=document.querySelector('table.guests tbody');
  var rows=[].slice.call(tbody.querySelectorAll('tr[data-grp]'));
  var dir=1, KEY='soiree-guest-view';
  // Status order: attending, no reply, declined. Dates: blanks last.
  var rank={st:{yes:0,pending:1,no:2},plus:{yes:0,no:1,'':2},after:{yes:0,maybe:1,no:2,'':3},grp:{travel:0,florida:1}};
  function val(r,k){var d=r.dataset;
    if(rank[k]) return rank[k][d[k]];
    if(k==='co') return d.co+' '+d.last+' '+d.first;
    if(k==='last') return d.last+' '+d.first;
    if(k==='first') return d.first+' '+d.last;
    return d[k]||'';}
  function sort(){var k=sel.value;
    rows.sort(function(a,b){var x=val(a,k),y=val(b,k);
      if((k==='invat'||k==='upd')&&(!x||!y)) return x===y?0:(x?-1:1);
      var r=typeof x==='number'?x-y:String(x).localeCompare(String(y));
      if(!r) r=val(a,'last').localeCompare(val(b,'last'));
      return r*dir;});
    rows.forEach(function(r){tbody.appendChild(r)});
    var dateKey=k==='invat'||k==='upd';
    dirBtn.textContent=dateKey?(dir>0?'Oldest first':'Newest first'):(dir>0?'A→Z':'Z→A');
    document.querySelectorAll('th.sort').forEach(function(th){th.classList.toggle('on',th.dataset.sort===k);th.setAttribute('data-dir',dir>0?'up':'down')});}
  function filter(){var n=0,qs=q.value.trim().toLowerCase();
    rows.forEach(function(r){var on=!qs||r.dataset.q.indexOf(qs)>-1;
      for(var k in filters){var v=filters[k].value; if(v&&r.dataset[k]!==v){on=false;break;}}
      r.hidden=!on; if(on)n++;});
    c.textContent=n+' of '+rows.length+' shown';}
  function save(){try{var st={q:q.value,sort:sel.value,dir:dir};for(var k in filters)st[k]=filters[k].value;sessionStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
  function load(){try{var st=JSON.parse(sessionStorage.getItem(KEY)||'null');if(!st)return;q.value=st.q||'';if(st.sort)sel.value=st.sort;dir=st.dir||1;for(var k in filters)if(st[k]!=null)filters[k].value=st[k];}catch(e){}}
  function run(){sort();filter();save();}
  [q].concat(Object.keys(filters).map(function(k){return filters[k]})).forEach(function(el){el.addEventListener('input',function(){filter();save();})});
  sel.addEventListener('change',function(){dir=(sel.value==='invat'||sel.value==='upd')?-1:1;run();});
  dirBtn.addEventListener('click',function(){dir=-dir;run();});
  $('fclear').addEventListener('click',function(){q.value='';for(var k in filters)filters[k].value='';run();});
  document.querySelectorAll('th.sort').forEach(function(th){th.addEventListener('click',function(){
    if(sel.value===th.dataset.sort) dir=-dir; else {sel.value=th.dataset.sort;dir=1;} run();});});
  load(); run();
})();
</script>`;
}

// ---------- Inbox ----------

const addrList = (v) => (Array.isArray(v) ? v : [v]).filter(Boolean).join(', ');

function inboxTabs(boxes, box) {
  const tab = (key, label) => `<a class="tab ${box === key ? 'on' : ''}" href="/admin/inbox?box=${encodeURIComponent(key)}">${esc(label)}</a>`;
  return `<nav class="tabs">${tab('all', 'All')}${boxes.map(b => tab(b, b)).join('')}${tab('sent', 'Sent')}</nav>`;
}

function fromSelect(boxes, selected) {
  return `<select name="from">${boxes.map(b => `<option value="${attr(b)}" ${b === selected ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
}

function adminInbox({ admin, boxes = [], box = 'all', emails = [], sent = null, error = '', flash = '' }) {
  let table;
  if (sent) {
    const rows = sent.map(e => `<tr>
      <td><a href="/admin/inbox/sent/${e.id}"><strong>${esc(e.subject || '(no subject)')}</strong></a></td>
      <td>${esc(e.to_email)}</td><td class="muted">${esc(e.from_email)}</td>
      <td class="muted">${esc(e.sent_by)}</td><td class="muted">${esc(fmtShortET(e.created_at))}</td></tr>`).join('');
    table = `<thead><tr><th>Subject</th><th>To</th><th>From</th><th>Sent by</th><th>Sent</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted center">Nothing sent from the Inbox yet.</td></tr>'}</tbody>`;
  } else {
    const rows = emails.map(e => `<tr>
      <td><a href="/admin/inbox/${attr(e.id)}"><strong>${esc(e.subject || '(no subject)')}</strong></a></td>
      <td>${esc(addrList(e.from))}</td>
      <td class="muted">${esc(addrList(e.to))}</td>
      <td class="muted">${esc(fmtShortET(e.created_at))}</td></tr>`).join('');
    table = `<thead><tr><th>Subject</th><th>From</th><th>To</th><th>Received</th></tr></thead>
      <tbody>${rows || (error ? '' : '<tr><td colspan="4" class="muted center">No emails here yet.</td></tr>')}</tbody>`;
  }
  return adminShell('Inbox', `
  <p><a href="/admin" class="link">← Back to dashboard</a></p>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  <section class="panel">
    <div class="panel-head"><h1>Inbox</h1>
      <div><a class="btn ghost small" href="/admin/inbox?box=${encodeURIComponent(box)}">Refresh</a>
      ${boxes.length ? `<a class="btn small" href="/admin/inbox/new${boxes.includes(box) ? `?from=${encodeURIComponent(box)}` : ''}">New email</a>` : ''}</div></div>
    ${boxes.length ? inboxTabs(boxes, box) : ''}
    <p class="muted">${sent ? 'Emails written from this page (replies and new emails).' : 'Emails sent to info@, rsvp@ or any other @etstevent.com address, including guests replying to invitations. Newest first.'}</p>
    ${error ? `<div class="errors">${esc(error)}</div>` : ''}
    <div class="table-wrap"><table class="guests">${table}</table></div>
  </section>`, admin);
}

function adminInboxMessage({ admin, msg, boxes = [], replyFrom = '', error = '', draft = '' }) {
  // Email HTML is shown inside a sandboxed frame so nothing in it can run scripts.
  const body = msg.html
    ? `<iframe class="mailframe" sandbox="" referrerpolicy="no-referrer" srcdoc="${attr(msg.html)}"></iframe>`
    : `<pre class="mailtext">${esc(msg.text || '(empty message)')}</pre>`;
  return adminShell(msg.subject || 'Email', `
  <p><a href="/admin/inbox" class="link">← Back to inbox</a></p>
  <section class="panel">
    <h1>${esc(msg.subject || '(no subject)')}</h1>
    <table class="kv">
      <tr><th>From</th><td>${esc(addrList(msg.from))}</td></tr>
      <tr><th>To</th><td>${esc(addrList(msg.to))}</td></tr>
      ${msg.cc && msg.cc.length ? `<tr><th>Cc</th><td>${esc(addrList(msg.cc))}</td></tr>` : ''}
      <tr><th>Received</th><td>${esc(fmtShortET(msg.created_at))}</td></tr>
      ${msg.attachments && msg.attachments.length ? `<tr><th>Attachments</th><td>${esc(msg.attachments.map(a => a.filename).join(', '))} <span class="muted">(open in Resend to download)</span></td></tr>` : ''}
    </table>
    ${body}
  </section>
  <section class="panel">
    <h2>Reply</h2>
    ${error ? `<div class="errors">${esc(error)}</div>` : ''}
    <form method="post" action="/admin/inbox/${attr(msg.id)}/reply" class="stack" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Sending…';">
      <label class="field"><span>Reply from</span>${fromSelect(boxes, replyFrom)}</label>
      <textarea name="message" rows="6" required placeholder="Write your reply…">${esc(draft)}</textarea>
      <p class="muted">Signed with your name. Counts toward the 100 emails/day limit.</p>
      <button class="btn">Send reply</button>
    </form>
  </section>`, admin);
}

function adminCompose({ admin, boxes, values = {}, error = '' }) {
  return adminShell('New email', `
  <p><a href="/admin/inbox" class="link">← Back to inbox</a></p>
  <section class="panel">
    <h1>New email</h1>
    ${error ? `<div class="errors">${esc(error)}</div>` : ''}
    <form method="post" action="/admin/inbox/new" class="stack" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').textContent='Sending…';">
      <label class="field"><span>From</span>${fromSelect(boxes, values.from)}</label>
      <label class="field"><span>To</span><input type="email" name="to" value="${attr(values.to || '')}" required maxlength="120" placeholder="guest@example.com"></label>
      <label class="field"><span>Subject</span><input name="subject" value="${attr(values.subject || '')}" required maxlength="150"></label>
      <label class="field"><span>Message</span><textarea name="message" rows="10" required>${esc(values.message || '')}</textarea></label>
      <p class="muted">Signed with your name. Replies come back to the address you send from and show up in this Inbox. Counts toward the 100 emails/day limit.</p>
      <button class="btn">Send</button>
    </form>
  </section>`, admin);
}

function adminSentMessage({ admin, sm }) {
  return adminShell(sm.subject || 'Sent email', `
  <p><a href="/admin/inbox?box=sent" class="link">← Back to sent</a></p>
  <section class="panel">
    <h1>${esc(sm.subject || '(no subject)')}</h1>
    <table class="kv">
      <tr><th>From</th><td>${esc(sm.from_email)}</td></tr>
      <tr><th>To</th><td>${esc(sm.to_email)}</td></tr>
      <tr><th>Sent by</th><td>${esc(sm.sent_by)}</td></tr>
      <tr><th>Sent</th><td>${esc(fmtShortET(sm.created_at))}</td></tr>
    </table>
    <pre class="mailtext">${esc(sm.body || '(no copy saved)')}</pre>
    <p><a class="btn ghost small" href="/admin/inbox/new?from=${encodeURIComponent(sm.from_email)}&to=${encodeURIComponent(sm.to_email)}">Write again</a></p>
  </section>`, admin);
}

module.exports = { adminInbox, adminInboxMessage, adminCompose, adminSentMessage, adminEmailPreview, home, rsvpForm, thanks, notFound, adminLogin, adminDashboard, adminEditGuest, esc, statusOf };
