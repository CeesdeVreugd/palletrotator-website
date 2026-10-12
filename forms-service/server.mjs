// PalletRotator formulier-service: brochure-aanvraag -> Laposta, offerte-aanvraag -> e-mail (SMTP).
// Geen dependencies (alleen Node 20). De API-sleutel staat ALLEEN in de omgeving
// (Portainer stack-variabele), nooit in de repo of in de browser.
import http from 'node:http';
import { sendMail } from './smtp.mjs';
import { offerteHtml } from './mail-template.mjs';
import { TALEN, ERR, CHOICES, SITE, confirmation, safeName } from './texts.mjs';

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.LAPOSTA_API_KEY || '';
const LIST_ID = process.env.LAPOSTA_LIST_ID || 'b12sde1bbp';
const BASE = (process.env.LAPOSTA_BASE_URL || 'https://api.laposta.nl').replace(/\/$/, '');
// Per taal moet public/downloads/PalletRotator-brochure-<taal>.pdf bestaan (nl, de, en, fr, it, es).
const normTaal = (t) => { t = String(t || '').toLowerCase().slice(0, 2); return TALEN.includes(t) ? t : 'nl'; };
const brochureUrl = (taal) => `/downloads/PalletRotator-brochure-${normTaal(taal)}.pdf`;
// Eigen Laposta-lijst per taal (voor de bevestigingsmail in de juiste taal): LAPOSTA_LIST_ID_DE, _EN, _FR, _IT, _ES.
const listFor = (taal) => process.env[`LAPOSTA_LIST_ID_${taal.toUpperCase()}`] || LIST_ID;
const CONFIRM_MAIL = String(process.env.CONFIRM_MAIL || 'true').toLowerCase() !== 'false';
const msg = (taal, key) => (ERR[taal] || ERR.nl)[key].replace('{mail}', (SITE[taal] || SITE.nl).email);
const SMTP = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  rejectUnauthorized: String(process.env.SMTP_INSECURE_TLS || '').toLowerCase() !== 'true',
};
const MAIL_FROM = process.env.MAIL_FROM || 'info@palletrotator.nl';
const MAIL_TO = process.env.MAIL_TO || 'sales@devreugd-pt.nl';
const MAX_BODY = 16 * 1024;
const MIN_FILL_MS = 2500;              // sneller dan 2,5 s ingevuld = waarschijnlijk bot
const RATE_MAX = 5, RATE_WINDOW = 60 * 60 * 1000; // 5 aanvragen per uur per IP

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW)) hits.delete(k);
  return list.length > RATE_MAX;
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || '0.0.0.0';
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > MAX_BODY) throw new Error('too_large'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) return JSON.parse(raw || '{}');
  return Object.fromEntries(new URLSearchParams(raw));
}

async function addToLaposta({ email, naam, bedrijf, ip, sourceUrl, taal = 'nl' }) {
  const form = new URLSearchParams();
  form.set('list_id', listFor(taal));
  form.set('ip', ip);
  form.set('email', email);
  form.set('source_url', sourceUrl);
  // Veldkoppeling volgens de lijst: Naam = {{voornaam}}, Bedrijfsnaam = {{achternaam}}
  form.set('custom_fields[voornaam]', naam);
  if (bedrijf) form.set('custom_fields[achternaam]', bedrijf);
  const r = await fetch(`${BASE}/v2/member`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${API_KEY}:`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(10000),
  });
  let data = {}; try { data = await r.json(); } catch {}
  if (r.ok) return { ok: true };
  const err = data?.error || {};
  // E-mailadres staat al in de lijst: voor een brochure-aanvraag is dat geen fout.
  if (err.code === 204 || /already|bestaat al|exists/i.test(String(err.message || ''))) return { ok: true, existing: true };
  console.error('[laposta] fout', r.status, err.code, err.message, err.parameter || '');
  return { ok: false, status: r.status, code: err.code };
}

const KEUZE = {
  model: ['std', 'ept', 'both'],
  aantal: ['1', '2', '3-5', '6+'],
  temperatuur: ['normal', 'frozen'],
};
const pick = (v, list) => (list.includes(String(v)) ? String(v) : list[0]);
const yes = (v) => v === true || v === 'on' || v === 'true' || v === '1';

async function handleOfferte(req, res) {
  const ip = clientIp(req);
  let body;
  try { body = await readBody(req); } catch { return send(res, 400, { ok: false, error: msg('nl', 'invalid') }); }
  const taal = normTaal(body.taal);
  if (rateLimited('offerte:' + ip)) return send(res, 429, { ok: false, error: msg(taal, 'tooMany') });
  // Honeypot / te snel ingevuld: doen alsof het gelukt is.
  if (clean(body.website, 200)) return send(res, 200, { ok: true });
  const filled = Date.now() - Number(body.t || 0);
  if (!Number(body.t) || filled < MIN_FILL_MS) return send(res, 200, { ok: true });

  const naam = clean(body.naam, 100), bedrijf = clean(body.bedrijf, 120), telefoon = clean(body.telefoon, 40);
  const email = clean(body.email, 200).toLowerCase();
  const opmerking = String(body.opmerking ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, 3000);
  if (!naam) return send(res, 400, { ok: false, error: msg(taal, 'name') });
  if (!telefoon) return send(res, 400, { ok: false, error: msg(taal, 'phone') });
  if (!EMAIL.test(email)) return send(res, 400, { ok: false, error: msg(taal, 'email') });
  if (!SMTP.host) { console.error('[config] SMTP_HOST ontbreekt'); return send(res, 500, { ok: false, error: msg(taal, 'unavailable') }); }

  const model = pick(body.model, KEUZE.model), aantal = pick(body.aantal, KEUZE.aantal), temperatuur = pick(body.temperatuur, KEUZE.temperatuur);
  const nieuwsbrief = yes(body.nieuwsbrief);
  // Mail aan sales: altijd in het Nederlands, met de taal/site van de aanvrager erbij.
  const nl = CHOICES.nl, site = SITE[taal], siteLabel = `${taal.toUpperCase()} (${site.origin.replace('https://', '')})`;
  const data = { naam, bedrijf, telefoon, email, model: nl.model[model], aantal: nl.aantal[aantal], temperatuur: nl.temperatuur[temperatuur], opmerking, nieuwsbrief, taal: siteLabel };
  const text = [
    'Nieuwe offerte-aanvraag via ' + site.origin.replace('https://', ''), `Taal / site: ${siteLabel}`, '',
    `Naam: ${naam}`, `Bedrijf: ${bedrijf || '-'}`, `Telefoon: ${telefoon}`, `E-mail: ${email}`, '',
    `Model: ${data.model}`, `Aantal: ${data.aantal}`, `Temperatuur: ${data.temperatuur}`, '',
    'Opmerking / vraag om demonstratie:', opmerking || '-', '',
    `Nieuwsbrief-toestemming: ${nieuwsbrief ? 'ja (toegevoegd aan Laposta)' : 'nee'}`,
  ].join('\n');
  try {
    await sendMail({ ...SMTP, from: MAIL_FROM, to: MAIL_TO, replyTo: email, subject: `[${taal.toUpperCase()}] Offerte-aanvraag PalletRotator: ${naam}${bedrijf ? ' (' + bedrijf + ')' : ''}`, text, html: offerteHtml(data) });
  } catch (e) {
    console.error('[smtp] fout', e?.message);
    return send(res, 502, { ok: false, error: msg(taal, 'sendFail') });
  }
  // Bevestiging naar de aanvrager (taal van de site). Een fout hier mag de aanvraag niet laten mislukken.
  if (CONFIRM_MAIL) {
    try {
      const c = confirmation(taal, { name: safeName(naam), model, aantal, temperatuur });
      await sendMail({ ...SMTP, from: MAIL_FROM, to: email, replyTo: site.email, subject: c.subject, text: c.text, html: c.html });
    } catch (e) { console.error('[smtp] bevestiging mislukt', e?.message); }
  }
  // Optioneel en alleen met toestemming.
  if (nieuwsbrief && API_KEY) {
    try { await addToLaposta({ email, naam, bedrijf, ip, taal, sourceUrl: site.origin + '/' }); }
    catch (e) { console.error('[laposta] nieuwsbrief mislukt', e?.message); }
  }
  return send(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, configured: Boolean(API_KEY), mailConfigured: Boolean(SMTP.host), talen: TALEN });
    const path = (req.url || '').split('?')[0];
    if (req.method === 'POST' && path === '/api/offerte') return handleOfferte(req, res);
    if (req.method !== 'POST' || path !== '/api/brochure') return send(res, 404, { ok: false });

    const ip = clientIp(req);
    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { ok: false, error: msg('nl', 'invalid') }); }
    const taal = normTaal(body.taal);
    if (rateLimited(ip)) return send(res, 429, { ok: false, error: msg(taal, 'tooMany') });
    if (!API_KEY) { console.error('[config] LAPOSTA_API_KEY ontbreekt'); return send(res, 500, { ok: false, error: msg(taal, 'unavailable') }); }

    // Honeypot: bots vullen het verborgen veld "website" in -> doen alsof het gelukt is.
    if (clean(body.website, 200)) return send(res, 200, { ok: true, download: brochureUrl(taal) });
    const filled = Date.now() - Number(body.t || 0);
    if (!Number(body.t) || filled < MIN_FILL_MS) return send(res, 200, { ok: true, download: brochureUrl(taal) });

    const naam = clean(body.naam, 100), bedrijf = clean(body.bedrijf, 120), email = clean(body.email, 200).toLowerCase();
    if (!naam) return send(res, 400, { ok: false, error: msg(taal, 'name') });
    if (!EMAIL.test(email)) return send(res, 400, { ok: false, error: msg(taal, 'email') });
    if (!yes(body.akkoord)) return send(res, 400, { ok: false, error: msg(taal, 'consent') });

    const out = await addToLaposta({ email, naam, bedrijf, ip, taal, sourceUrl: SITE[taal].origin + SITE[taal].brochure });
    if (!out.ok) return send(res, 502, { ok: false, error: msg(taal, 'signupFail') });
    return send(res, 200, { ok: true, download: brochureUrl(taal) });
  } catch (e) {
    console.error('[server] onverwachte fout', e?.message);
    return send(res, 500, { ok: false, error: msg('nl', 'generic') });
  }
});
server.listen(PORT, () => console.log(`palletrotator-forms luistert op :${PORT}`));
