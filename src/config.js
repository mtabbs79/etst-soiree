// All event settings live here. Most can be overridden with environment
// variables in the Render dashboard without touching code.
const env = process.env;

module.exports = {
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || '').replace(/\/$/, ''), // e.g. https://party.etst.com
  databaseUrl: env.DATABASE_URL || 'postgres://localhost/etst_soiree',
  databaseSsl: env.DATABASE_SSL === 'true',
  adminPassword: env.ADMIN_PASSWORD || '',
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me',
  contactEmail: env.CONTACT_EMAIL || 'info@etstevent.com',

  // Email (Resend). Without RESEND_API_KEY the site can preview emails but not send them.
  resendApiKey: env.RESEND_API_KEY || '',
  resendApiUrl: (env.RESEND_API_URL || 'https://api.resend.com').replace(/\/$/, ''),
  mailFrom: env.MAIL_FROM || "ETST's Very Merry Soirée <rsvp@etstevent.com>",
  mailReplyTo: env.MAIL_REPLY_TO || 'info@etstevent.com',

  // Company shown for a guest when none was entered, looked up by email domain.
  companyByDomain: {
    'rxcs.net': 'Rx Compound Store',
    'mistermeds.com': 'Mister Meds',
    'meduvo.com': 'Meduvo',
    'magnechef.com': 'MagneChef',
    'peaknow.com': 'PeakNow',
    'zoolzy.com': 'Zoolzy',
    'earthsciencetech.com': 'Earth Science Tech',
    'etst.com': 'Earth Science Tech',
  },

  event: {
    host: "ETST's Annual",
    title: 'A Very Merry',
    titleAccent: 'Soirée',
    dateLong: 'Friday, December 11, 2026',
    time: '7:00 – 11:00 PM',
    venue: 'Miami Springs Country Club',
    address: '650 Curtiss Pkwy, Miami Springs, FL 33166',
    mapUrl: 'https://maps.google.com/?q=Miami+Springs+Country+Club+650+Curtiss+Pkwy+Miami+Springs+FL+33166',
    afterParty: 'After party to follow',
    attire: 'Cocktail',
    tagline: 'Leave the kids at home and join us for a night out!',
  },

  // Deadlines are stored as exact instants. Defaults:
  //   travel  = Nov 16, 2026 11:59 PM Eastern  ("no later than November 16")
  //   florida = Dec 1, 2026 11:59 PM Eastern   ("RSVP by December 1")
  deadlines: {
    travel: new Date(env.TRAVEL_DEADLINE || '2026-11-17T04:59:59Z'),
    florida: new Date(env.FLORIDA_DEADLINE || '2026-12-02T04:59:59Z'),
  },
  deadlineText: {
    travel: 'Due to travel arrangements, please RSVP no later than November 16',
    florida: 'RSVP by December 1, 2026',
  },
};
