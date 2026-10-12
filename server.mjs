// WebsiteBeheerPortal voor de websites (PalletRotator e.a.). Node 20, geen dependencies.
// Inlog met rollen (admin / editor / reviewer), overzicht en bereikbaarheid, teksten nalezen met opmerkingen en
// vertaalvoorstellen, foto's vervangen met goedkeuring. Opslag: JSON-bestanden op het data-volume.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DATA, load, save, uid, log, readLog } from './lib/store.mjs';
import { hashPassword, verifyPassword, DUMMY_HASH, sign, unsign, sha256, ROLES, can, mayAccess, passwordProblem, encryptSecret, decryptSecret, ipAllowed } from './lib/auth.mjs';
import { newSecret, verifyTotp, otpauthUri, newRecoveryCodes, normRecovery } from './lib/totp.mjs';
import { availableLangs, getItems, getItem, present, bakedOverrides, fromDisplay, encodeEntities, decodeEntities, tokensMatch } from './lib/texts.mjs';
import { runChecks, startMonitor, uptimePct, targetKey } from './lib/monitor.mjs';
import { slotsOf, slotOf, slotState, createProposal, decide, revert, livePath, baselinePath, proposalPath, pendingCount } from './lib/photos.mjs';
import { allSites, siteById, manual } from './lib/registry.mjs';
import { sendMail } from './lib/smtp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(HERE, 'ui');
const PORT = Number(process.env.PORT || 3200);
const ABS_MS = 12 * 3600 * 1000;       // een sessie duurt nooit langer dan 12 uur
const IDLE_MS = 2 * 3600 * 1000;       // en vervalt na 2 uur inactiviteit
const TICKET_MS = 5 * 60 * 1000;       // tijd om de 2FA-code in te voeren na het wachtwoord
const INVITE_MS = 3 * 24 * 3600 * 1000;
// Tweestapsverificatie: 'all' (iedereen, standaard), 'staff' (beheerder en redacteur) of 'off'.
const REQUIRE_2FA = (process.env.REQUIRE_2FA || 'all').toLowerCase();
const ALLOW_IPS = String(process.env.PORTAL_ALLOW_IPS || '').split(',').map((x) => x.trim()).filter(Boolean);
const twoFaRequired = (u) => REQUIRE_2FA === 'all' || (REQUIRE_2FA === 'staff' && u.role !== 'reviewer');

const SMTP = process.env.SMTP_HOST ? {
  host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER, pass: process.env.SMTP_PASS,
} : null;
const MAIL_FROM = process.env.MAIL_FROM || 'info@palletrotator.nl';

// ---------- geheim voor sessies ----------
function secret() {
  const f = path.join(DATA, 'secret.key');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
const SECRET = process.env.SESSION_SECRET || secret();

// ---------- gegevens ----------
const users = () => load('users.json', []);
const manualSites = () => load('sites.json', []);
const comments = () => load('comments.json', []);
const overrides = () => load('overrides.json', {});

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const clean = (s, n) => String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, n);
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, langs: u.langs || [], siteIds: u.siteIds || [], disabled: !!u.disabled, mustChange: !!u.mustChange, invited: !!u.inviteHash, lastLogin: u.lastLogin || null, twoFa: !!(u.totp && u.totp.enabled), needs2fa: twoFaRequired(u) && !(u.totp && u.totp.enabled), recoveryLeft: (u.recovery || []).length });

function seed() {
  if (!users().length) {
    const email = (process.env.PORTAL_ADMIN_EMAIL || 'cees@devreugd-pt.nl').toLowerCase();
    let pw = process.env.PORTAL_ADMIN_PASSWORD;
    let generated = false;
    if (!pw || pw.length < 10) { pw = crypto.randomBytes(9).toString('base64url'); generated = true; }
    users().push({ id: uid(5), email, name: 'Beheerder', role: 'admin', langs: [], siteIds: [], hash: hashPassword(pw), mustChange: true, sv: 0, created: new Date().toISOString() });
    save('users.json');
    log('systeem', 'beheerder aangemaakt', email);
    if (generated) console.log(`[portal] Eerste inlog: ${email} / ${pw}  (wijzig dit wachtwoord direct na het inloggen)`);
    else console.log(`[portal] Beheerder aangemaakt: ${email} (wachtwoord uit PORTAL_ADMIN_PASSWORD; moet bij eerste inlog gewijzigd worden)`);
  }
}

// ---------- hulpfuncties HTTP ----------
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self'; manifest-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'X-Robots-Tag': 'noindex, nofollow',
};
const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(code, { ...HEADERS, 'Content-Type': type, ...extra });
  res.end(body);
};
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), undefined, extra);
const fail = (code, message) => Object.assign(new Error(message), { code });

const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const parseCookies = (h) => Object.fromEntries(String(h || '').split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const isHttps = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' || process.env.COOKIE_SECURE === 'true';
// Op https krijgt de cookie het __Host--voorvoegsel: dan accepteert de browser hem alleen met Secure en zonder Domain.
const cookieName = (req) => (isHttps(req) ? '__Host-pr_portal' : 'pr_portal');
const sessionCookie = (req, user, issuedAt) => {
  const now = Date.now();
  const iss = issuedAt || now;
  const token = sign({ t: 's', u: user.id, e: iss + ABS_MS, i: iss, a: now, v: user.sv || 0 }, SECRET);
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ABS_MS / 1000}${isHttps(req) ? '; Secure' : ''}`;
};
const setSession = (req, res, user) => sessionCookie(req, user);
const clearCookie = (req) => `${cookieName(req)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isHttps(req) ? '; Secure' : ''}`;

// Geeft { user, issued } terug of null. Controleert handtekening, absolute en idle-verloopdatum en sessieversie.
function userFrom(req) {
  const jar = parseCookies(req.headers.cookie);
  const p = unsign(jar[cookieName(req)], SECRET);
  const now = Date.now();
  if (!p || p.t !== 's' || p.e < now || now - (p.a || 0) > IDLE_MS) return null;
  const u = users().find((x) => x.id === p.u);
  if (!u || u.disabled || (u.sv || 0) !== p.v) return null;
  return { user: u, issued: p.i, activity: p.a };
}

const ticketFor = (user) => sign({ t: '2fa', u: user.id, e: Date.now() + TICKET_MS, n: crypto.randomBytes(6).toString('hex') }, SECRET);
const ticketFails = new Map();

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (d) => { n += d.length; if (n > limit) { reject(fail(413, 'Bestand te groot.')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(fail(400, 'Ongeldige gegevens.')); }
    });
    req.on('error', reject);
  });
}

// ---------- rate limit inloggen ----------
const attempts = new Map();
function throttled(key, max = 10, windowMs = 15 * 60000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + windowMs }); return false; }
  a.n++;
  return a.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k); }, 600000).unref();

// ---------- routes ----------
const routes = [];
const route = (method, pattern, opts, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, opts: typeof opts === 'string' ? { perm: opts } : opts, handler });
};
const PUBLIC = { public: true };

function needSite(user, id, lang) {
  const s = siteById(id);
  if (!s) throw fail(404, 'Website niet gevonden.');
  if (!mayAccess(user, s.id, lang)) throw fail(403, 'Geen toegang tot deze website of taal.');
  return s;
}

// -- sessie
route('GET', '/api/health', PUBLIC, (c) => json(c.res, 200, { ok: true }));

const loginResponse = (c, u) => {
  u.lastLogin = new Date().toISOString(); save('users.json');
  log(u, 'ingelogd', c.ip);
  json(c.res, 200, { user: publicUser(u) }, { 'Set-Cookie': setSession(c.req, c.res, u) });
};

route('POST', '/api/login', PUBLIC, (c) => {
  const email = clean(c.body.email, 200).toLowerCase();
  const pw = String(c.body.password || '').slice(0, 300);
  if (throttled('ip:' + c.ip) || throttled('em:' + email, 8)) throw fail(429, 'Te veel pogingen. Probeer het over een kwartier opnieuw.');
  const u = users().find((x) => x.email === email && !x.disabled);
  const ok = verifyPassword(pw, u && u.hash ? u.hash : DUMMY_HASH) && !!u && !!u.hash;
  if (!ok) { log(email, 'inloggen mislukt', c.ip); throw fail(401, 'E-mailadres of wachtwoord klopt niet.'); }
  if (u.totp && u.totp.enabled) return json(c.res, 200, { needs2fa: true, ticket: ticketFor(u) });
  loginResponse(c, u);
});

// Tweede stap: code uit de authenticator-app of een herstelcode
route('POST', '/api/login/2fa', PUBLIC, (c) => {
  if (throttled('ip2:' + c.ip, 15)) throw fail(429, 'Te veel pogingen. Probeer het over een kwartier opnieuw.');
  const t = unsign(c.body.ticket, SECRET);
  if (!t || t.t !== '2fa' || t.e < Date.now()) throw fail(401, 'De inlogstap is verlopen. Log opnieuw in.');
  const fails = ticketFails.get(t.n) || 0;
  if (fails >= 5) throw fail(429, 'Te veel foute codes. Log opnieuw in.');
  const u = users().find((x) => x.id === t.u && !x.disabled);
  if (!u || !u.totp || !u.totp.enabled) throw fail(401, 'Log opnieuw in.');
  const code = String(c.body.code || '').trim();
  const secret = decryptSecret(u.totp.enc, SECRET);
  const step = secret ? verifyTotp(secret, code, u.totp.step || 0) : null;
  let used = false;
  if (step === null) {
    const h = sha256(normRecovery(code));
    const i = (u.recovery || []).indexOf(h);
    if (normRecovery(code).length === 10 && i >= 0) { u.recovery.splice(i, 1); used = true; }
  }
  if (step === null && !used) {
    ticketFails.set(t.n, fails + 1);
    log(u, '2FA-code onjuist', c.ip);
    throw fail(401, 'Deze code klopt niet.');
  }
  ticketFails.delete(t.n);
  if (step !== null) u.totp.step = step;
  if (used) log(u, 'herstelcode gebruikt', `${u.recovery.length} over`);
  loginResponse(c, u);
});
route('POST', '/api/logout', PUBLIC, (c) => json(c.res, 200, { ok: true }, { 'Set-Cookie': clearCookie(c.req) }));
route('GET', '/api/me', { auth: true }, (c) => json(c.res, 200, { user: publicUser(c.user) }));

route('POST', '/api/password', { auth: true }, (c) => {
  const { old, password } = c.body;
  if (throttled('pw:' + c.user.id, 8)) throw fail(429, 'Te veel pogingen.');
  if (!verifyPassword(String(old || ''), c.user.hash)) throw fail(400, 'Het huidige wachtwoord klopt niet.');
  const p = passwordProblem(password, c.user.email); if (p) throw fail(400, p);
  if (verifyPassword(password, c.user.hash)) throw fail(400, 'Kies een ander wachtwoord dan het huidige.');
  c.user.hash = hashPassword(password); c.user.mustChange = false; c.user.sv = (c.user.sv || 0) + 1;
  save('users.json'); log(c.user, 'wachtwoord gewijzigd');
  json(c.res, 200, { ok: true }, { 'Set-Cookie': setSession(c.req, c.res, c.user) });
});

// -- tweestapsverificatie instellen
const MFA_OK = new Set(['/api/me', '/api/password', '/api/logout', '/api/2fa/setup', '/api/2fa/enable']);
route('POST', '/api/2fa/setup', { auth: true }, (c) => {
  if (c.user.totp && c.user.totp.enabled) throw fail(400, 'Tweestapsverificatie staat al aan.');
  const secret = newSecret();
  c.user.totpPending = encryptSecret(secret, SECRET);
  save('users.json');
  json(c.res, 200, { secret, uri: otpauthUri(secret, c.user.email) });
});
route('POST', '/api/2fa/enable', { auth: true }, (c) => {
  if (throttled('mfa:' + c.user.id, 10)) throw fail(429, 'Te veel pogingen.');
  if (!c.user.totpPending) throw fail(400, 'Start eerst de installatie.');
  const secret = decryptSecret(c.user.totpPending, SECRET);
  const step = secret ? verifyTotp(secret, c.body.code, 0) : null;
  if (step === null) throw fail(400, 'Deze code klopt niet. Controleer de tijd op uw telefoon en probeer het opnieuw.');
  const codes = newRecoveryCodes();
  c.user.totp = { enc: c.user.totpPending, enabled: true, step };
  c.user.totpPending = null;
  c.user.recovery = codes.map((x) => sha256(normRecovery(x)));
  c.user.sv = (c.user.sv || 0) + 1;
  save('users.json'); log(c.user, 'tweestapsverificatie ingeschakeld');
  json(c.res, 200, { recoveryCodes: codes, user: publicUser(c.user) }, { 'Set-Cookie': setSession(c.req, c.res, c.user) });
});
route('POST', '/api/2fa/recovery', { auth: true }, (c) => {
  if (throttled('mfa:' + c.user.id, 10)) throw fail(429, 'Te veel pogingen.');
  if (!c.user.totp || !c.user.totp.enabled) throw fail(400, 'Tweestapsverificatie staat niet aan.');
  if (!verifyPassword(String(c.body.password || ''), c.user.hash)) throw fail(400, 'Het wachtwoord klopt niet.');
  const secret = decryptSecret(c.user.totp.enc, SECRET);
  const step = secret ? verifyTotp(secret, c.body.code, c.user.totp.step || 0) : null;
  if (step === null) throw fail(400, 'Deze code klopt niet.');
  c.user.totp.step = step;
  const codes = newRecoveryCodes();
  c.user.recovery = codes.map((x) => sha256(normRecovery(x)));
  save('users.json'); log(c.user, 'nieuwe herstelcodes aangemaakt');
  json(c.res, 200, { recoveryCodes: codes });
});
route('POST', '/api/2fa/disable', { auth: true }, (c) => {
  if (twoFaRequired(c.user)) throw fail(400, 'Voor uw rol is tweestapsverificatie verplicht.');
  if (!c.user.totp || !c.user.totp.enabled) throw fail(400, 'Tweestapsverificatie staat niet aan.');
  if (!verifyPassword(String(c.body.password || ''), c.user.hash)) throw fail(400, 'Het wachtwoord klopt niet.');
  const secret = decryptSecret(c.user.totp.enc, SECRET);
  if (verifyTotp(secret, c.body.code, c.user.totp.step || 0) === null) throw fail(400, 'Deze code klopt niet.');
  c.user.totp = null; c.user.recovery = []; c.user.sv = (c.user.sv || 0) + 1;
  save('users.json'); log(c.user, 'tweestapsverificatie uitgeschakeld');
  json(c.res, 200, { ok: true }, { 'Set-Cookie': setSession(c.req, c.res, c.user) });
});

const byInvite = (token) => {
  const h = sha256(String(token || ''));
  return users().find((u) => u.inviteHash === h && u.inviteExp > Date.now());
};
route('GET', '/api/invite/:token', PUBLIC, (c) => {
  const u = byInvite(c.params.token);
  if (!u) throw fail(404, 'Deze link is verlopen of al gebruikt.');
  json(c.res, 200, { email: u.email, name: u.name });
});
route('POST', '/api/password/set', PUBLIC, (c) => {
  if (throttled('set:' + c.ip, 20)) throw fail(429, 'Te veel pogingen.');
  const u = byInvite(c.body.token);
  if (!u) throw fail(400, 'Deze link is verlopen of al gebruikt.');
  const p = passwordProblem(c.body.password, u.email); if (p) throw fail(400, p);
  u.hash = hashPassword(c.body.password); u.mustChange = false; u.inviteHash = null; u.inviteExp = null; u.sv = (u.sv || 0) + 1; u.lastLogin = new Date().toISOString();
  save('users.json'); log(u, 'wachtwoord ingesteld via uitnodiging');
  // Heeft de gebruiker al 2FA, dan wordt niet automatisch ingelogd: een gelekte link mag nooit de tweede stap omzeilen.
  if (u.totp && u.totp.enabled) return json(c.res, 200, { user: null, login: true });
  json(c.res, 200, { user: publicUser(u) }, { 'Set-Cookie': setSession(c.req, c.res, u) });
});

// -- gebruikers
function baseUrl(req) {
  if (process.env.PORTAL_URL) return process.env.PORTAL_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${host}`;
}
async function invite(req, user, mail) {
  const token = crypto.randomBytes(24).toString('base64url');
  user.inviteHash = sha256(token); user.inviteExp = Date.now() + INVITE_MS;
  save('users.json');
  const link = `${baseUrl(req)}/#/wachtwoord/${token}`;
  let mailed = false, mailError = null;
  if (mail && SMTP) {
    try {
      await sendMail({ ...SMTP, from: MAIL_FROM, to: user.email,
        subject: 'Uitnodiging WebsiteBeheerPortal',
        text: `Hallo ${user.name},\n\nU bent uitgenodigd voor de WebsiteBeheerPortal van De Vreugd. Stel via deze link uw wachtwoord in (3 dagen geldig):\n\n${link}\n\nMet vriendelijke groet,\nDe Vreugd Productietechniek`,
        html: `<p>Hallo ${esc(user.name)},</p><p>U bent uitgenodigd voor de WebsiteBeheerPortal van De Vreugd. Stel via onderstaande knop uw wachtwoord in (3 dagen geldig).</p><p><a href="${esc(link)}" style="background:#0A0A96;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Wachtwoord instellen</a></p><p style="color:#666;font-size:13px">Werkt de knop niet? Kopieer dan deze link: ${esc(link)}</p><p>Met vriendelijke groet,<br>De Vreugd Productietechniek</p>` });
      mailed = true;
    } catch (e) { mailError = String(e.message || e).slice(0, 120); console.error('[portal] uitnodiging mailen mislukt:', mailError); }
  }
  return { link, mailed, mailError, smtp: !!SMTP };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const listOf = (v, allowed) => (Array.isArray(v) ? v.map((x) => String(x).toLowerCase().slice(0, 20)).filter((x) => !allowed || allowed.includes(x)) : []);
route('GET', '/api/users', 'users', (c) => json(c.res, 200, { users: users().map(publicUser) }));
route('POST', '/api/users', 'users', async (c) => {
  const email = clean(c.body.email, 200).toLowerCase();
  const name = clean(c.body.name, 80);
  const role = c.body.role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Vul een geldig e-mailadres in.');
  if (!name) throw fail(400, 'Vul een naam in.');
  if (!ROLES.includes(role)) throw fail(400, 'Kies een rol.');
  if (users().some((u) => u.email === email)) throw fail(409, 'Dit e-mailadres bestaat al.');
  const u = { id: uid(5), email, name, role, langs: listOf(c.body.langs), siteIds: listOf(c.body.siteIds), hash: null, sv: 0, created: new Date().toISOString() };
  users().push(u); save('users.json');
  log(c.user, 'gebruiker aangemaakt', `${email} (${role})`);
  const inv = await invite(c.req, u, c.body.mail !== false);
  json(c.res, 200, { user: publicUser(u), invite: inv });
});
route('PUT', '/api/users/:id', 'users', (c) => {
  const u = users().find((x) => x.id === c.params.id);
  if (!u) throw fail(404, 'Gebruiker niet gevonden.');
  const role = c.body.role !== undefined ? c.body.role : u.role;
  const disabled = c.body.disabled !== undefined ? !!c.body.disabled : !!u.disabled;
  if (!ROLES.includes(role)) throw fail(400, 'Ongeldige rol.');
  const othersAdmin = users().some((x) => x.id !== u.id && x.role === 'admin' && !x.disabled);
  if (!othersAdmin && (role !== 'admin' || disabled)) throw fail(400, 'Er moet minimaal één actieve beheerder blijven.');
  if (c.body.name !== undefined) u.name = clean(c.body.name, 80) || u.name;
  if (c.body.langs !== undefined) u.langs = listOf(c.body.langs);
  if (c.body.siteIds !== undefined) u.siteIds = listOf(c.body.siteIds);
  if (role !== u.role || disabled !== !!u.disabled) u.sv = (u.sv || 0) + 1;
  u.role = role; u.disabled = disabled;
  save('users.json'); log(c.user, 'gebruiker gewijzigd', u.email);
  json(c.res, 200, { user: publicUser(u) });
});
route('POST', '/api/users/:id/invite', 'users', async (c) => {
  const u = users().find((x) => x.id === c.params.id);
  if (!u) throw fail(404, 'Gebruiker niet gevonden.');
  log(c.user, 'uitnodiging/reset verstuurd', u.email);
  json(c.res, 200, { invite: await invite(c.req, u, c.body.mail !== false) });
});
route('POST', '/api/users/:id/reset2fa', 'users', (c) => {
  const u = users().find((x) => x.id === c.params.id);
  if (!u) throw fail(404, 'Gebruiker niet gevonden.');
  u.totp = null; u.totpPending = null; u.recovery = []; u.sv = (u.sv || 0) + 1;
  save('users.json'); log(c.user, 'tweestapsverificatie gereset', u.email);
  json(c.res, 200, { user: publicUser(u) });
});
route('POST', '/api/users/:id/revoke', 'users', (c) => {
  const u = users().find((x) => x.id === c.params.id);
  if (!u) throw fail(404, 'Gebruiker niet gevonden.');
  u.sv = (u.sv || 0) + 1;
  save('users.json'); log(c.user, 'alle sessies beëindigd', u.email);
  json(c.res, 200, { ok: true });
});
route('DELETE', '/api/users/:id', 'users', (c) => {
  const list = users();
  const i = list.findIndex((x) => x.id === c.params.id);
  if (i < 0) throw fail(404, 'Gebruiker niet gevonden.');
  if (list[i].id === c.user.id) throw fail(400, 'U kunt uzelf niet verwijderen.');
  const [gone] = list.splice(i, 1);
  if (!list.some((x) => x.role === 'admin' && !x.disabled)) { list.splice(i, 0, gone); throw fail(400, 'Er moet minimaal één actieve beheerder blijven.'); }
  save('users.json'); log(c.user, 'gebruiker verwijderd', gone.email);
  json(c.res, 200, { ok: true });
});

// -- websites
const siteView = (s) => ({ id: s.id, name: s.name, description: s.description || '', source: s.source, texts: !!s.textsSource, photos: (s.slots || []).length > 0, targets: s.targets || [] });
route('GET', '/api/sites', { auth: true }, (c) => json(c.res, 200, { sites: allSites().filter((s) => mayAccess(c.user, s.id)).map(siteView) }));
function readTargets(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  return list.slice(0, 20).map((t, i) => {
    const url = clean(t.url, 300);
    let u; try { u = new URL(url); } catch { throw fail(400, `Ongeldige URL: ${url}`); }
    if (!/^https?:$/.test(u.protocol)) throw fail(400, 'Alleen http(s)-adressen zijn toegestaan.');
    let id = slug(t.id || t.lang || t.label || `t${i + 1}`) || `t${i + 1}`;
    while (used.has(id)) id += '-2';
    used.add(id);
    return { id, label: clean(t.label, 60) || u.hostname, lang: clean(t.lang, 5).toLowerCase(), url: u.href };
  });
}
route('POST', '/api/sites', 'sites', (c) => {
  const name = clean(c.body.name, 80);
  if (!name) throw fail(400, 'Vul een naam in.');
  let id = slug(c.body.id || name) || 'website';
  while (siteById(id)) id += '-2';
  const s = { id, name, description: clean(c.body.description, 200), targets: readTargets(c.body.targets) };
  manualSites().push(s); save('sites.json'); log(c.user, 'website toegevoegd', name);
  json(c.res, 200, { site: siteView({ ...s, source: 'manual', slots: [] }) });
});
route('PUT', '/api/sites/:id', 'sites', (c) => {
  const s = manualSites().find((x) => x.id === c.params.id);
  if (!s) throw fail(siteById(c.params.id) ? 400 : 404, siteById(c.params.id) ? 'Deze website meldt zichzelf automatisch aan; pas haar adressen aan in de website zelf.' : 'Website niet gevonden.');
  if (c.body.name !== undefined) s.name = clean(c.body.name, 80) || s.name;
  if (c.body.description !== undefined) s.description = clean(c.body.description, 200);
  if (c.body.targets !== undefined) s.targets = readTargets(c.body.targets);
  save('sites.json'); log(c.user, 'website gewijzigd', s.name);
  json(c.res, 200, { site: siteView({ ...s, source: 'manual', slots: [] }) });
});
route('DELETE', '/api/sites/:id', 'sites', (c) => {
  const list = manualSites();
  const i = list.findIndex((x) => x.id === c.params.id);
  if (i < 0) throw fail(siteById(c.params.id) ? 400 : 404, siteById(c.params.id) ? 'Deze website meldt zichzelf automatisch aan en kan hier niet verwijderd worden.' : 'Website niet gevonden.');
  const [gone] = list.splice(i, 1); save('sites.json'); log(c.user, 'website verwijderd', gone.name);
  json(c.res, 200, { ok: true });
});

// -- overzicht
function overview(user) {
  const checks = load('checks.json', {});
  const all = comments();
  return allSites().filter((s) => mayAccess(user, s.id)).map((s) => {
    const mine = all.filter((x) => x.site === s.id && mayAccess(user, s.id, x.lang));
    return {
      ...siteView(s),
      targets: (s.targets || []).map((t) => {
        const k = checks[targetKey(s.id, t.id)] || {};
        return { ...t, last: k.last || null, uptime: uptimePct(k.history), downSince: k.downSince || null };
      }),
      open: mine.filter((x) => x.status === 'open').length,
      total: mine.length,
      pendingPhotos: (s.slots || []).length && can(user, 'photo.approve') ? pendingCount(s.id) : 0,
    };
  });
}
route('GET', '/api/overview', 'overview', (c) => json(c.res, 200, { sites: overview(c.user) }));
route('POST', '/api/check', 'check', async (c) => {
  const only = c.body.site ? needSite(c.user, c.body.site).id : undefined;
  await runChecks(allSites(), only);
  json(c.res, 200, { sites: overview(c.user) });
});

// -- teksten
const LANG_NAMES = { nl: 'Nederlands', de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano', es: 'Español' };
function textSite(user, id, lang) {
  const s = needSite(user, id, lang);
  if (!s.textsSource) throw fail(400, 'Voor deze website zijn geen teksten gekoppeld.');
  return s;
}
const langsFor = (user, s) => ['nl', ...availableLangs(s.id)].filter((l, i, a) => a.indexOf(l) === i && mayAccess(user, s.id, l));
route('GET', '/api/texts/meta', 'view', (c) => {
  const s = textSite(c.user, c.query.site);
  const langs = langsFor(c.user, s);
  const nl = getItems(s.id, 'nl');
  const pages = {};
  for (const i of nl) pages[i.pages[0] || '(onbekend)'] = (pages[i.pages[0] || '(onbekend)'] || 0) + 1;
  json(c.res, 200, { langs: langs.map((code) => ({ code, name: LANG_NAMES[code] || code })), pages: Object.entries(pages).map(([page, count]) => ({ page, count })).sort((a, b) => a.page.localeCompare(b.page)) });
});

const acceptedFor = (site, lang, textId) => comments().filter((x) => x.site === site && x.lang === lang && x.textId === textId && x.status === 'accepted' && x.proposal);
route('GET', '/api/texts', 'view', (c) => {
  const lang = c.query.lang || 'nl';
  const s = textSite(c.user, c.query.site, lang);
  let items = getItems(s.id, lang);
  const all = comments().filter((x) => x.site === s.id && x.lang === lang && x.scope === 'text');
  const by = new Map();
  for (const x of all) { const e = by.get(x.textId) || { open: 0, total: 0, accepted: [] }; e.total++; if (x.status === 'open') e.open++; if (x.status === 'accepted') e.accepted.push(x); by.set(x.textId, e); }
  const q = clean(c.query.q, 100).toLowerCase();
  const page = c.query.page || '';
  const status = c.query.status || '';
  let rows = items.map((i) => {
    const p = present(i); const e = by.get(i.id) || { open: 0, total: 0, accepted: [] };
    const acc = e.accepted[e.accepted.length - 1];
    return { ...p, open: e.open, total: e.total, accepted: acc ? { proposal: acc.proposal, applied: i.bron === 'handmatig' && p.tr === acc.proposal } : null };
  });
  if (page) rows = rows.filter((r) => r.pages.includes(page));
  if (q) rows = rows.filter((r) => r.nl.toLowerCase().includes(q) || r.tr.toLowerCase().includes(q));
  if (status === 'open') rows = rows.filter((r) => r.open > 0);
  else if (status === 'commented') rows = rows.filter((r) => r.total > 0);
  else if (status === 'machine') rows = rows.filter((r) => r.bron === 'DeepL');
  else if (status === 'manual') rows = rows.filter((r) => r.bron === 'handmatig');
  else if (status === 'missing') rows = rows.filter((r) => r.bron === 'ONTBREEKT');
  else if (status === 'pending') rows = rows.filter((r) => r.accepted && !r.accepted.applied);
  const total = rows.length;
  const offset = Math.max(0, Number(c.query.offset) || 0), limit = Math.min(200, Math.max(1, Number(c.query.limit) || 50));
  json(c.res, 200, { total, items: rows.slice(offset, offset + limit) });
});

// -- opmerkingen
const commentView = (x) => x;
route('GET', '/api/comments', 'view', (c) => {
  const q = c.query;
  let list = comments().filter((x) => mayAccess(c.user, x.site, x.lang));
  if (q.site) list = list.filter((x) => x.site === q.site);
  if (q.lang) list = list.filter((x) => x.lang === q.lang);
  if (q.status) list = list.filter((x) => (q.status === 'closed' ? x.status !== 'open' : x.status === q.status));
  if (q.textId) list = list.filter((x) => x.textId === q.textId);
  list = list.slice().sort((a, b) => (a.created < b.created ? 1 : -1));
  json(c.res, 200, { comments: list.slice(0, 500).map(commentView) });
});
route('POST', '/api/comments', 'comment', (c) => {
  const b = c.body;
  const lang = clean(b.lang, 5).toLowerCase();
  if (lang && !/^[a-z]{2}$/.test(lang)) throw fail(400, 'Ongeldige taal.');
  const s = needSite(c.user, clean(b.site, 40), lang || undefined);
  const text = clean(b.text, 3000);
  if (!text) throw fail(400, 'Schrijf eerst een opmerking.');
  const scope = ['text', 'page', 'general'].includes(b.scope) ? b.scope : 'general';
  const x = { id: uid(6), site: s.id, lang, scope, text, status: 'open', author: { id: c.user.id, name: c.user.name, role: c.user.role }, created: new Date().toISOString(), replies: [] };
  if (scope === 'text') {
    if (!s.textsSource) throw fail(400, 'Voor deze website zijn geen teksten gekoppeld.');
    const item = getItem(s.id, lang, clean(b.textId, 20));
    if (!item) throw fail(404, 'Tekst niet gevonden (is de website opnieuw vertaald?).');
    const p = present(item);
    Object.assign(x, { textId: item.id, key: item.key, page: p.page, quote: p.nl, trAtTime: p.tr });
    if (b.proposal !== undefined && b.proposal !== null && String(b.proposal).trim() !== '') {
      if (lang === 'nl') throw fail(400, 'Voor de Nederlandse brontekst kunt u alleen een opmerking plaatsen.');
      const prop = clean(b.proposal, 3000);
      if (!tokensMatch(prop, p.tr)) throw fail(400, 'De markeringen {1}, {/1} enz. in de vertaling moeten behouden blijven (zelfde aantal en soort).');
      if (prop === p.tr) throw fail(400, 'Het voorstel is gelijk aan de huidige vertaling.');
      x.proposal = prop;
    }
  } else {
    x.page = clean(b.page, 300); x.quote = clean(b.quote, 500);
  }
  comments().push(x); save('comments.json');
  log(c.user, 'opmerking geplaatst', `${s.name} ${lang} ${x.page || ''}`.trim());
  json(c.res, 200, { comment: commentView(x) });
});
const findComment = (c) => {
  const x = comments().find((k) => k.id === c.params.id);
  if (!x || !mayAccess(c.user, x.site, x.lang)) throw fail(404, 'Opmerking niet gevonden.');
  return x;
};
route('POST', '/api/comments/:id/reply', 'comment', (c) => {
  const x = findComment(c);
  const text = clean(c.body.text, 3000);
  if (!text) throw fail(400, 'Schrijf eerst een reactie.');
  x.replies.push({ id: uid(4), text, author: { id: c.user.id, name: c.user.name, role: c.user.role }, created: new Date().toISOString() });
  save('comments.json');
  json(c.res, 200, { comment: commentView(x) });
});
route('POST', '/api/comments/:id/status', 'view', (c) => {
  const x = findComment(c);
  const status = c.body.status;
  if (!['open', 'resolved', 'accepted', 'rejected'].includes(status)) throw fail(400, 'Ongeldige status.');
  if ((status === 'accepted' || status === 'rejected') && !can(c.user, 'accept')) throw fail(403, 'Alleen een beheerder kan een voorstel accepteren of afwijzen.');
  if ((status === 'open' || status === 'resolved') && !can(c.user, 'resolve') && x.author.id !== c.user.id) throw fail(403, 'Geen rechten.');
  if (status === 'accepted') {
    if (!x.proposal) throw fail(400, 'Deze opmerking bevat geen vertaalvoorstel.');
    const o = overrides(); o[x.site] = o[x.site] || {}; o[x.site][x.lang] = o[x.site][x.lang] || {};
    o[x.site][x.lang][x.key] = fromDisplay(encodeEntities(x.proposal)); save('overrides.json');
  } else if (x.status === 'accepted') {
    const o = overrides();
    if (o[x.site]?.[x.lang]?.[x.key] === fromDisplay(encodeEntities(x.proposal || ''))) { delete o[x.site][x.lang][x.key]; save('overrides.json'); }
  }
  x.status = status; x.statusBy = c.user.name; x.statusAt = new Date().toISOString();
  save('comments.json'); log(c.user, `opmerking ${status}`, `${x.site} ${x.lang} ${x.page || ''}`.trim());
  json(c.res, 200, { comment: commentView(x) });
});
route('DELETE', '/api/comments/:id', 'accept', (c) => {
  const list = comments();
  const i = list.findIndex((k) => k.id === c.params.id);
  if (i < 0) throw fail(404, 'Opmerking niet gevonden.');
  const [gone] = list.splice(i, 1); save('comments.json'); log(c.user, 'opmerking verwijderd', gone.id);
  json(c.res, 200, { ok: true });
});

// -- export
route('GET', '/api/export/overrides', 'export', (c) => {
  const lang = clean(c.query.lang, 5).toLowerCase();
  if (!/^[a-z]{2}$/.test(lang) || lang === 'nl') throw fail(400, 'Kies een vertaaltaal.');
  const s = textSite(c.user, c.query.site, lang);
  const merged = { ...bakedOverrides(s.id, lang), ...(overrides()[s.id]?.[lang] || {}) };
  send(c.res, 200, JSON.stringify(merged, null, 2) + '\n', 'application/json; charset=utf-8', { 'Content-Disposition': `attachment; filename="${lang}.json"` });
});
// Voorkomt dat Excel een cel als formule uitvoert (CSV-injectie): cellen die met = + - @ beginnen krijgen een apostrof.
const csvCell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
route('GET', '/api/export/comments.csv', 'export', (c) => {
  let list = comments().filter((x) => mayAccess(c.user, x.site, x.lang));
  if (c.query.status) list = list.filter((x) => x.status === c.query.status);
  const rows = [['Website', 'Taal', 'Pagina', 'Status', 'Tekst (NL)', 'Vertaling toen', 'Opmerking', 'Voorstel', 'Auteur', 'Datum', 'Reacties'].map(csvCell).join(';')];
  for (const x of list) rows.push([siteById(x.site)?.name || x.site, x.lang, x.page, x.status, x.quote, x.trAtTime, x.text, x.proposal, x.author.name, x.created.slice(0, 10), x.replies.map((r) => `${r.author.name}: ${r.text}`).join(' | ')].map(csvCell).join(';'));
  send(c.res, 200, '﻿' + rows.join('\r\n') + '\r\n', 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="opmerkingen.csv"' });
});

// -- foto's (per website en fotoplek; de plekken komen uit het koppelbestand van de website)
route('GET', '/api/photos', 'photos.view', (c) => {
  const s = needSite(c.user, c.query.site);
  json(c.res, 200, { slots: slotsOf(s.id).map((slot) => slotState(s.id, slot)) });
});
function needSlot(user, siteId, slotId) {
  const s = needSite(user, siteId);
  const slot = slotOf(s.id, slotId);
  if (!slot) throw fail(404, 'Fotoplek niet gevonden.');
  return { s, slot };
}
route('POST', '/api/photos/:site/:slot/proposals', { perm: 'photo.propose', limit: 14 * 1024 * 1024 }, (c) => {
  const { s, slot } = needSlot(c.user, c.params.site, c.params.slot);
  const p = createProposal(s.id, slot, c.user, c.body.note, c.body.files);
  log(c.user, 'foto voorgesteld', `${s.name}: ${slot.label}`);
  json(c.res, 200, { proposal: p, slot: slotState(s.id, slot) });
});
route('POST', '/api/photos/:site/:slot/proposals/:pid/approve', 'photo.approve', (c) => {
  const { s, slot } = needSlot(c.user, c.params.site, c.params.slot);
  decide(s.id, slot, c.params.pid, c.user, true); log(c.user, 'foto goedgekeurd', `${s.name}: ${slot.label}`);
  json(c.res, 200, { slot: slotState(s.id, slot) });
});
route('POST', '/api/photos/:site/:slot/proposals/:pid/reject', 'photo.approve', (c) => {
  const { s, slot } = needSlot(c.user, c.params.site, c.params.slot);
  decide(s.id, slot, c.params.pid, c.user, false); log(c.user, 'foto afgewezen', `${s.name}: ${slot.label}`);
  json(c.res, 200, { slot: slotState(s.id, slot) });
});
route('POST', '/api/photos/:site/:slot/revert', 'photo.approve', (c) => {
  const { s, slot } = needSlot(c.user, c.params.site, c.params.slot);
  revert(s.id, slot, c.user); log(c.user, 'foto teruggezet naar origineel', `${s.name}: ${slot.label}`);
  json(c.res, 200, { slot: slotState(s.id, slot) });
});
const sendFile = (res, file) => {
  let data;
  try { data = fs.readFileSync(file); } catch { throw fail(404, 'Geen afbeelding.'); }
  send(res, 200, data, 'image/webp', { 'Cache-Control': 'private, no-cache' });
};
route('GET', '/file/live/:site/:slot/:size', 'photos.view', (c) => {
  const { s, slot } = needSlot(c.user, c.params.site, c.params.slot);
  if (!slot.sizes.map(String).includes(c.params.size)) throw fail(404, 'Onbekend formaat.');
  const lp = livePath(s.id, slot, c.params.size);
  sendFile(c.res, fs.existsSync(lp) ? lp : baselinePath(s.id, slot, c.params.size));
});
route('GET', '/file/proposal/:site/:slot/:pid/:size', 'photos.view', (c) => {
  const { s, slot } = needSlot(c.user, c.params.site, c.params.slot);
  if (!/^[a-f0-9]+$/.test(c.params.pid) || !slot.sizes.map(String).includes(c.params.size)) throw fail(404, 'Onbekend.');
  sendFile(c.res, proposalPath(s.id, slot, c.params.pid, c.params.size));
});

route('GET', '/api/log', 'log', (c) => json(c.res, 200, { log: readLog(300) }));

// ---------- statische UI ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(UI, rel);
  if (!file.startsWith(UI + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream', { 'Cache-Control': 'no-cache' });
  return true;
}

// ---------- server ----------
const MUST_CHANGE_OK = new Set(['/api/me', '/api/password', '/api/logout']);

// Algemene rem per IP (600 verzoeken per minuut) tegen misbruik
const hits = new Map();
function tooMany(ip) {
  const now = Date.now(); const m = Math.floor(now / 60000);
  const h = hits.get(ip);
  if (!h || h.m !== m) { hits.set(ip, { m, n: 1 }); return false; }
  return ++h.n > 600;
}
setInterval(() => { const m = Math.floor(Date.now() / 60000); for (const [k, v] of hits) if (v.m < m) hits.delete(k); }, 120000).unref();

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = url.pathname;
  const ip = ipOf(req);
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  try {
    if (!ipAllowed(ip, ALLOW_IPS)) return send(res, 403, 'Geen toegang', 'text/plain; charset=utf-8');
    if (tooMany(ip)) return json(res, 429, { error: 'Te veel verzoeken. Probeer het zo opnieuw.' });
    if (req.method === 'GET' && !pathname.startsWith('/api/') && !pathname.startsWith('/file/')) {
      if (serveStatic(req, res, pathname)) return;
      return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
    }
    const r = routes.find((x) => x.method === req.method && x.re.test(pathname));
    if (!r) return json(res, 404, { error: 'Niet gevonden.' });
    const m = pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const sess = userFrom(req);
    const user = sess && sess.user;
    if (req.method !== 'GET') {
      // CSRF: eigen header (kan cross-site niet gezet worden zonder CORS-toestemming) én Origin moet bij dit adres horen
      if (req.headers['x-requested-with'] !== 'portal') return json(res, 403, { error: 'Ongeldig verzoek.' });
      const origin = req.headers.origin;
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (origin) { let oh = ''; try { oh = new URL(origin).host; } catch {} if (oh !== host) return json(res, 403, { error: 'Ongeldig verzoek.' }); }
    }
    if (!r.opts.public) {
      if (!user) return json(res, 401, { error: 'Log eerst in.' });
      if (user.mustChange && !MUST_CHANGE_OK.has(pathname)) return json(res, 403, { error: 'Kies eerst een eigen wachtwoord.', mustChange: true });
      if (twoFaRequired(user) && !(user.totp && user.totp.enabled) && !MFA_OK.has(pathname)) return json(res, 403, { error: 'Stel eerst tweestapsverificatie in.', needs2fa: true });
      if (r.opts.perm && !can(user, r.opts.perm)) return json(res, 403, { error: 'U heeft hier geen rechten voor.' });
      // Sliding session: cookie verversen als de laatste activiteit meer dan 5 minuten geleden is (absolute duur blijft 12 uur)
      if (Date.now() - sess.activity > 5 * 60000) res.setHeader('Set-Cookie', sessionCookie(req, user, sess.issued));
    }
    let body = {};
    if (req.method !== 'GET') body = await readBody(req, r.opts.limit || 64 * 1024);
    const query = Object.fromEntries(url.searchParams);
    await r.handler({ req, res, user, params, query, body, ip });
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error('[portal]', e);
    if (!res.headersSent) json(res, code, { error: code === 500 ? 'Er ging iets mis op de server.' : e.message });
  }
});
server.headersTimeout = 15000;
server.requestTimeout = 60000;
server.keepAliveTimeout = 5000;
server.maxHeadersCount = 60;
server.on('clientError', (err, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch {} });

if (process.env.PORTAL_NO_LISTEN !== '1') {
  seed();
  startMonitor(() => allSites());
  server.listen(PORT, () => console.log(`[portal] luistert op poort ${PORT}`));
}
export { seed };
