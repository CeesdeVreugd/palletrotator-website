// Wachtwoorden (scrypt), sessiecookies (HMAC) en rechten per rol. Geen dependencies.
import crypto from 'node:crypto';

export const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `s1$${salt.toString('hex')}$${h.toString('hex')}`;
};

export const verifyPassword = (pw, stored) => {
  try {
    const [v, saltHex, hashHex] = String(stored).split('$');
    if (v !== 's1') return false;
    const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
    const want = Buffer.from(hashHex, 'hex');
    return want.length === h.length && crypto.timingSafeEqual(h, want);
  } catch { return false; }
};

// Dummy-hash zodat inloggen met een onbekend adres even lang duurt als met een bekend adres.
export const DUMMY_HASH = hashPassword(crypto.randomBytes(8).toString('hex'));

const b64u = (b) => Buffer.from(b).toString('base64url');
export const sign = (payload, secret) => {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
};
export const unsign = (token, secret) => {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
};

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const ROLES = ['admin', 'editor', 'reviewer'];

// Rechten per rol
const PERMS = {
  admin: ['view', 'comment', 'resolve', 'accept', 'photo.propose', 'photo.approve', 'photos.view', 'sites', 'users', 'log', 'check', 'export', 'overview'],
  editor: ['view', 'comment', 'resolve', 'photo.propose', 'photos.view', 'check', 'export', 'overview'],
  reviewer: ['view', 'comment'],
};
export const can = (user, perm) => !!user && (PERMS[user.role] || []).includes(perm);

// Mag deze gebruiker deze site/taal zien? (langs/siteIds leeg of null = alles)
export const mayAccess = (user, siteId, lang) => {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.siteIds && user.siteIds.length && siteId && !user.siteIds.includes(siteId)) return false;
  if (user.langs && user.langs.length && lang && !user.langs.includes(lang)) return false;
  return true;
};

const COMMON = ['wachtwoord', 'password', 'welkom', 'qwerty', '123456', 'letmein', 'admin', 'palletrotator', 'devreugd', 'vreugd', 'changeme', 'iloveyou'];
export const passwordProblem = (pw, email = '') => {
  if (typeof pw !== 'string' || pw.length < 12) return 'Het wachtwoord moet minimaal 12 tekens hebben.';
  if (pw.length > 200) return 'Het wachtwoord is te lang.';
  const low = pw.toLowerCase();
  if (new Set(low).size < 5) return 'Kies een wachtwoord met meer verschillende tekens.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && low.includes(local)) return 'Het wachtwoord mag uw e-mailadres niet bevatten.';
  if (COMMON.some((w) => low.includes(w))) return 'Dit wachtwoord is te voorspelbaar. Gebruik bijvoorbeeld drie of vier willekeurige woorden.';
  return null;
};

// Versleuteling van geheimen in rust (TOTP-sleutels): AES-256-GCM, sleutel afgeleid van het servergeheim.
export const encryptSecret = (plain, secret) => {
  const key = crypto.createHash('sha256').update('totp:' + secret).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
};
export const decryptSecret = (packed, secret) => {
  try {
    const [iv, tag, enc] = String(packed).split('.').map((s) => Buffer.from(s, 'base64url'));
    const key = crypto.createHash('sha256').update('totp:' + secret).digest();
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
};

// IPv4-allowlist (CIDR of los adres). Leeg = iedereen.
export function ipAllowed(ip, list) {
  if (!list || !list.length) return true;
  const toInt = (a) => a.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0;
  const v4 = String(ip).replace(/^::ffff:/, '');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return false;
  return list.some((entry) => {
    const [net, bits] = entry.split('/');
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(net)) return false;
    const b = bits === undefined ? 32 : Number(bits);
    const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0;
    return (toInt(v4) & mask) === (toInt(net) & mask);
  });
}
