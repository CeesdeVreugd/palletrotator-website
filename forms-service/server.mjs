// PalletRotator formulier-service: brochure-aanvraag -> Laposta.
// Geen dependencies (alleen Node 20). De API-sleutel staat ALLEEN in de omgeving
// (Portainer stack-variabele), nooit in de repo of in de browser.
import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.LAPOSTA_API_KEY || '';
const LIST_ID = process.env.LAPOSTA_LIST_ID || 'b12sde1bbp';
const BASE = (process.env.LAPOSTA_BASE_URL || 'https://api.laposta.nl').replace(/\/$/, '');
// Voeg een taal pas toe als het PDF-bestand in public/downloads staat (en, fr, it, es, pl volgen met hun taalversie).
const TALEN = ['nl', 'de'];
const brochureUrl = (taal) => `/downloads/PalletRotator-brochure-${TALEN.includes(taal) ? taal : 'nl'}.pdf`;
const MAX_BODY = 8 * 1024;
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

async function addToLaposta({ email, naam, bedrijf, ip, sourceUrl }) {
  const form = new URLSearchParams();
  form.set('list_id', LIST_ID);
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

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true, configured: Boolean(API_KEY) });
    if (req.method !== 'POST' || req.url.split('?')[0] !== '/api/brochure') return send(res, 404, { ok: false });

    const ip = clientIp(req);
    if (rateLimited(ip)) return send(res, 429, { ok: false, error: 'Te veel aanvragen. Probeer het later opnieuw.' });
    if (!API_KEY) { console.error('[config] LAPOSTA_API_KEY ontbreekt'); return send(res, 500, { ok: false, error: 'Formulier is tijdelijk niet beschikbaar.' }); }

    let body;
    try { body = await readBody(req); } catch { return send(res, 400, { ok: false, error: 'Ongeldig verzoek.' }); }

    const taal = clean(body.taal, 5).toLowerCase();
    // Honeypot: bots vullen het verborgen veld "website" in -> doen alsof het gelukt is.
    if (clean(body.website, 200)) return send(res, 200, { ok: true, download: brochureUrl(taal) });
    const filled = Date.now() - Number(body.t || 0);
    if (!Number(body.t) || filled < MIN_FILL_MS) return send(res, 200, { ok: true, download: brochureUrl(taal) });

    const naam = clean(body.naam, 100), bedrijf = clean(body.bedrijf, 120), email = clean(body.email, 200).toLowerCase();
    if (!naam) return send(res, 400, { ok: false, error: 'Vul uw naam in.' });
    if (!EMAIL.test(email)) return send(res, 400, { ok: false, error: 'Vul een geldig e-mailadres in.' });
    if (!(body.akkoord === true || body.akkoord === 'on' || body.akkoord === 'true' || body.akkoord === '1'))
      return send(res, 400, { ok: false, error: 'Vink aan dat u akkoord gaat om de brochure te ontvangen.' });

    const out = await addToLaposta({ email, naam, bedrijf, ip, sourceUrl: 'https://www.palletrotator.nl/brochure/' });
    if (!out.ok) return send(res, 502, { ok: false, error: 'Aanmelden is niet gelukt. Probeer het later opnieuw of mail naar info@palletrotator.nl.' });
    return send(res, 200, { ok: true, download: brochureUrl(taal) });
  } catch (e) {
    console.error('[server] onverwachte fout', e?.message);
    return send(res, 500, { ok: false, error: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
});
server.listen(PORT, () => console.log(`palletrotator-forms luistert op :${PORT}`));
