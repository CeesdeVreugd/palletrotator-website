// Tweestapsverificatie (TOTP, RFC 6238) zonder dependencies. Compatibel met Google/Microsoft Authenticator,
// Authy, 1Password, Bitwarden enz.
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

export function hotp(secretB32, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

export const stepNow = (t = Date.now()) => Math.floor(t / 1000 / 30);

// Geeft de stap terug waarop de code klopt (of null). Venster: 1 stap vroeg/laat. lastStep voorkomt hergebruik.
export function verifyTotp(secretB32, code, lastStep = 0, t = Date.now()) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepNow(t);
  for (const s of [now, now - 1, now + 1]) {
    if (s <= lastStep) continue;
    const want = Buffer.from(hotp(secretB32, s));
    const got = Buffer.from(c);
    if (want.length === got.length && crypto.timingSafeEqual(want, got)) return s;
  }
  return null;
}

export const otpauthUri = (secret, account, issuer = 'WebsiteBeheerPortal De Vreugd') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

// Herstelcodes (eenmalig te gebruiken). Opslag alleen als hash.
export const newRecoveryCodes = (n = 10) => Array.from({ length: n }, () => {
  const b = base32Encode(crypto.randomBytes(6)).slice(0, 10).toLowerCase();
  return `${b.slice(0, 5)}-${b.slice(5)}`;
});
export const normRecovery = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z2-7]/g, '');
