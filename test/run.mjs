// Zelftest van het beheerportaal: draait de server tegen tijdelijke mappen en loopt de belangrijkste functies en
// beveiligingsmaatregelen na. Gebruik: node test/run.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-test-'));
Object.assign(process.env, {
  PORTAL_NO_LISTEN: '1', DATA_DIR: path.join(tmp, 'data'), MEDIA_DIR: path.join(tmp, 'media'),
  BRIDGE_DIR: path.join(HERE, 'fixtures/bridge'),
  PORTAL_ADMIN_EMAIL: 'cees@example.nl', PORTAL_ADMIN_PASSWORD: 'Start-Wachtwoord-2026!x', REQUIRE_2FA: 'all',
});
const { server, seed } = await import('../server.mjs');
const { hotp, stepNow } = await import('../lib/totp.mjs');
seed();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0, failed = 0;
const ok = (cond, name, extra = '') => { if (cond) pass++; else { failed++; console.log(`  FOUT: ${name} ${extra}`); } };
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, `(kreeg ${JSON.stringify(a)}, verwacht ${JSON.stringify(b)})`);

class Jar {
  constructor() { this.c = {}; }
  header() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join('; '); }
  take(res) {
    for (const sc of res.headers.getSetCookie?.() || []) {
      const [kv] = sc.split(';'); const i = kv.indexOf('=');
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (/Max-Age=0/.test(sc) || !v) delete this.c[k]; else this.c[k] = v;
    }
  }
}
async function call(method, url, body, jar, headers = {}) {
  const h = { ...(method !== 'GET' ? { 'X-Requested-With': 'portal' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers };
  if (jar && jar.header()) h.Cookie = jar.header();
  const res = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  if (jar) jar.take(res);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  return { status: res.status, data, res };
}
const b64 = (f) => fs.readFileSync(path.join(HERE, 'fixtures', f)).toString('base64');
const totpCode = (secret, offset = 0) => hotp(secret, stepNow() + offset);

// ---------- 1. basis en beveiligingskoppen ----------
console.log('1. basis');
let r = await call('GET', '/api/health');
eq(r.status, 200, 'health');
ok(/default-src 'none'/.test(r.res.headers.get('content-security-policy')), 'CSP aanwezig');
ok(r.res.headers.get('x-frame-options') === 'DENY' && r.res.headers.get('cross-origin-opener-policy') === 'same-origin', 'koppen');
r = await call('GET', '/');
ok(r.status === 200 && /<div id="root">/.test(r.data), 'ui geserveerd');
r = await call('GET', '/../server.mjs');
ok(r.status === 404, 'geen path traversal via /..', String(r.status));
r = await call('GET', '/%2e%2e/server.mjs');
ok(r.status === 404, 'geen path traversal via %2e%2e', String(r.status));
r = await call('GET', '/api/overview');
eq(r.status, 401, 'overzicht vereist inlog');
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'x' }, null, { 'X-Requested-With': '' });
eq(r.status, 403, 'CSRF: zonder header geweigerd');
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'x' }, null, { Origin: 'https://evil.example', Host: 'x' });
eq(r.status, 403, 'CSRF: vreemde Origin geweigerd');

// ---------- 2. inloggen, wachtwoord, 2FA ----------
console.log('2. inloggen en 2FA');
const admin = new Jar();
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'fout' }, admin);
eq(r.status, 401, 'fout wachtwoord');
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'Start-Wachtwoord-2026!x' }, admin, { 'X-Forwarded-Proto': 'https' });
eq(r.status, 200, 'inloggen met startwachtwoord');
ok(r.data.user.mustChange === true, 'moet wachtwoord wijzigen');
const sc = r.res.headers.getSetCookie()[0];
ok(/^__Host-pr_portal=/.test(sc) && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc) && /Path=\//.test(sc) && !/Domain=/i.test(sc), 'cookie: __Host-, HttpOnly, Secure, SameSite=Strict', sc);
ok(r.res.headers.get('strict-transport-security'), 'HSTS op https');
// cookie is alleen zichtbaar voor https-verzoeken; gebruik hierna dezelfde header
const H = { 'X-Forwarded-Proto': 'https' };
r = await call('GET', '/api/overview', null, admin, H);
eq(r.status, 403, 'eerst wachtwoord wijzigen');
r = await call('POST', '/api/password', { old: 'Start-Wachtwoord-2026!x', password: 'kort' }, admin, H);
eq(r.status, 400, 'te kort wachtwoord geweigerd');
r = await call('POST', '/api/password', { old: 'Start-Wachtwoord-2026!x', password: 'Wachtwoord123456' }, admin, H);
eq(r.status, 400, 'voorspelbaar wachtwoord geweigerd');
r = await call('POST', '/api/password', { old: 'Start-Wachtwoord-2026!x', password: 'Spoorwegbrug-Citroen-Vlinder-9' }, admin, H);
eq(r.status, 200, 'wachtwoord gewijzigd');
r = await call('GET', '/api/overview', null, admin, H);
eq(r.status, 403, '2FA verplicht: overzicht nog dicht');
ok(r.data.needs2fa === true, 'needs2fa-vlag');
r = await call('GET', '/api/users', null, admin, H);
eq(r.status, 403, '2FA verplicht: gebruikers nog dicht');
r = await call('POST', '/api/2fa/setup', {}, admin, H);
eq(r.status, 200, '2FA setup');
const adminSecret = r.data.secret;
ok(/^[A-Z2-7]{32}$/.test(adminSecret) && r.data.uri.startsWith('otpauth://totp/'), 'secret en otpauth-uri');
r = await call('POST', '/api/2fa/enable', { code: '000000' }, admin, H);
eq(r.status, 400, 'onjuiste code bij inschakelen');
r = await call('POST', '/api/2fa/enable', { code: totpCode(adminSecret) }, admin, H);
eq(r.status, 200, '2FA ingeschakeld');
const recovery = r.data.recoveryCodes;
eq(recovery.length, 10, '10 herstelcodes');
r = await call('GET', '/api/overview', null, admin, H);
eq(r.status, 200, 'overzicht open na 2FA');
ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'users.json'), 'utf8').includes(adminSecret), 'TOTP-sleutel staat versleuteld opgeslagen');
ok(!fs.readFileSync(path.join(process.env.DATA_DIR, 'users.json'), 'utf8').includes('Spoorwegbrug'), 'wachtwoord staat niet leesbaar opgeslagen');

// nieuw inloggen: wachtwoord + code
let admin2 = new Jar();
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'Spoorwegbrug-Citroen-Vlinder-9' }, admin2);
ok(r.data.needs2fa === true && r.data.ticket && !admin2.header(), 'login geeft alleen ticket, nog geen sessie');
const ticket = r.data.ticket;
r = await call('GET', '/api/overview', null, admin2);
eq(r.status, 401, 'zonder code geen toegang');
r = await call('POST', '/api/login/2fa', { ticket, code: '123456' }, admin2);
eq(r.status, 401, 'foute code geweigerd');
r = await call('POST', '/api/login/2fa', { ticket, code: totpCode(adminSecret, 1) }, admin2);
eq(r.status, 200, 'juiste code werkt');
r = await call('GET', '/api/overview', null, admin2);
eq(r.status, 200, 'sessie na 2FA');
// replay: dezelfde code mag niet nog eens
let j = new Jar();
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'Spoorwegbrug-Citroen-Vlinder-9' }, j);
r = await call('POST', '/api/login/2fa', { ticket: r.data.ticket, code: totpCode(adminSecret, 1) }, j);
eq(r.status, 401, 'TOTP-code kan niet hergebruikt worden (replay)');
// herstelcode: één keer bruikbaar
j = new Jar();
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'Spoorwegbrug-Citroen-Vlinder-9' }, j);
const t2 = r.data.ticket;
r = await call('POST', '/api/login/2fa', { ticket: t2, code: recovery[0] }, j);
eq(r.status, 200, 'herstelcode werkt');
j = new Jar();
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'Spoorwegbrug-Citroen-Vlinder-9' }, j);
r = await call('POST', '/api/login/2fa', { ticket: r.data.ticket, code: recovery[0] }, j);
eq(r.status, 401, 'herstelcode werkt maar één keer');
// ticket: maximaal 5 foute pogingen
j = new Jar();
r = await call('POST', '/api/login', { email: 'cees@example.nl', password: 'Spoorwegbrug-Citroen-Vlinder-9' }, j);
const t3 = r.data.ticket; let last;
for (let i = 0; i < 7; i++) last = await call('POST', '/api/login/2fa', { ticket: t3, code: '111111' }, j);
ok(last.status === 429, 'ticket geblokkeerd na te veel foute codes', String(last.status));
// vervalst ticket / sessie
r = await call('POST', '/api/login/2fa', { ticket: 'abc.def', code: '1' }, j);
eq(r.status, 401, 'vervalst ticket');
const forged = new Jar(); forged.c['pr_portal'] = 'eyJ0IjoicyIsInUiOiJ4In0.AAAA';
r = await call('GET', '/api/me', null, forged);
eq(r.status, 401, 'vervalste cookie geweigerd');

// ---------- 3. gebruikers en uitnodigingen ----------
console.log('3. gebruikers');
const A = admin2; // beheerder met sessie
r = await call('POST', '/api/users', { email: 'nalezer@example.de', name: 'Anna Keller', role: 'reviewer', langs: ['de'], mail: false }, A);
eq(r.status, 200, 'nalezer uitgenodigd');
const link1 = r.data.invite.link; const token1 = link1.split('/').pop();
ok(link1.includes('/#/wachtwoord/'), 'uitnodigingslink');
r = await call('POST', '/api/users', { email: 'redacteur@example.nl', name: 'Wim', role: 'editor', mail: false }, A);
const token2 = r.data.invite.link.split('/').pop();
r = await call('POST', '/api/users', { email: 'nalezer@example.de', name: 'Dubbel', role: 'reviewer' }, A);
eq(r.status, 409, 'dubbel e-mailadres geweigerd');
r = await call('POST', '/api/users', { email: 'geen-email', name: 'X', role: 'admin' }, A);
eq(r.status, 400, 'ongeldig e-mailadres');
r = await call('GET', `/api/invite/${token1}`);
eq(r.data.email, 'nalezer@example.de', 'uitnodiging toont adres');
const rev = new Jar();
r = await call('POST', '/api/password/set', { token: token1, password: 'abc' }, rev);
eq(r.status, 400, 'zwak wachtwoord via uitnodiging geweigerd');
r = await call('POST', '/api/password/set', { token: token1, password: 'Nalezer-Wachtzin-Blauw-7712' }, rev);
eq(r.status, 400, 'wachtwoord met naam/adres geweigerd', String(r.status));
r = await call('POST', '/api/password/set', { token: token1, password: 'Fietsenmaker-Zomer-Kanaal-4821' }, rev);
eq(r.status, 200, 'wachtwoord via uitnodiging ingesteld');
r = await call('GET', `/api/invite/${token1}`);
eq(r.status, 404, 'uitnodiging is eenmalig');
r = await call('GET', '/api/texts/meta?site=palletrotator', null, rev);
eq(r.status, 403, 'nalezer moet eerst 2FA instellen');
r = await call('POST', '/api/2fa/setup', {}, rev); const revSecret = r.data.secret;
r = await call('POST', '/api/2fa/enable', { code: totpCode(revSecret) }, rev);
eq(r.status, 200, 'nalezer 2FA aan');

const ed = new Jar();
r = await call('POST', '/api/password/set', { token: token2, password: 'Olifant-Gordijn-Sneeuwklok-3150' }, ed);
r = await call('POST', '/api/2fa/setup', {}, ed); const edSecret = r.data.secret;
r = await call('POST', '/api/2fa/enable', { code: totpCode(edSecret) }, ed);
eq(r.status, 200, 'redacteur 2FA aan');

// ---------- 4. rechten ----------
console.log('4. rechten');
for (const [name, url, jar, want] of [
  ['nalezer: gebruikers', '/api/users', rev, 403], ['nalezer: overzicht', '/api/overview', rev, 403], ['nalezer: foto’s', '/api/photos?site=palletrotator', rev, 403],
  ['nalezer: logboek', '/api/log', rev, 403], ['nalezer: export', '/api/export/comments.csv', rev, 403],
  ['redacteur: gebruikers', '/api/users', ed, 403], ['redacteur: logboek', '/api/log', ed, 403], ['redacteur: overzicht', '/api/overview', ed, 200], ['redacteur: foto’s', '/api/photos?site=palletrotator', ed, 200],
]) { r = await call('GET', url, null, jar); eq(r.status, want, name); }
r = await call('POST', '/api/sites', { name: 'X', targets: [] }, ed); eq(r.status, 403, 'redacteur kan geen site toevoegen');
r = await call('POST', '/api/check', {}, rev); eq(r.status, 403, 'nalezer kan niet controleren');
r = await call('GET', '/api/texts?site=palletrotator&lang=fr', null, rev);
eq(r.status, 403, 'nalezer (alleen de) ziet geen Frans');
r = await call('GET', '/api/texts/meta?site=palletrotator', null, rev);
eq(r.data.langs.map((l) => l.code), ['de'], 'nalezer ziet alleen zijn taal in de meta');

// ---------- 5. teksten en opmerkingen ----------
console.log('5. teksten en opmerkingen');
r = await call('GET', '/api/texts?site=palletrotator&lang=de', null, rev);
eq(r.status, 200, 'teksten de'); eq(r.data.total, 5, '5 teksten');
const item = r.data.items.find((i) => i.nl.includes('palletkantelaar'));
ok(item && item.nl.includes('&') && !item.nl.includes('&amp;'), 'entiteiten gedecodeerd weergegeven', item && item.nl);
r = await call('GET', '/api/texts?site=palletrotator&lang=de&q=vrieshuizen', null, rev); eq(r.data.total, 1, 'zoeken');
r = await call('GET', '/api/texts?site=palletrotator&lang=de&page=/specificaties/&status=missing', null, rev); eq(r.data.total, 1, 'filter pagina + ontbreekt');
r = await call('GET', '/api/texts?site=palletrotator&lang=nl', null, rev); eq(r.status, 403, 'nalezer (alleen de) ziet geen NL-bron');

r = await call('POST', '/api/comments', { site: 'palletrotator', lang: 'de', scope: 'text', textId: item.id, text: 'Gebruik Palettenkipper erbij.', proposal: 'Der PalletRotator ist der Palettenkipper.' }, rev);
eq(r.status, 400, 'voorstel zonder markeringen geweigerd');
r = await call('POST', '/api/comments', { site: 'palletrotator', lang: 'de', scope: 'text', textId: item.id, text: 'Gebruik Palettenkipper erbij.', proposal: item.tr.replace('Palettenwender &', 'Palettenwender (Palettenkipper) &') }, rev);
eq(r.status, 200, 'opmerking met voorstel');
const cid = r.data.comment.id;
ok(r.data.comment.key.includes('<x1>'), 'sleutel in geheugenvorm opgeslagen');
r = await call('POST', '/api/comments', { site: 'palletrotator', lang: 'fr', scope: 'general', text: 'x' }, rev);
eq(r.status, 403, 'nalezer kan niet op Frans reageren');
r = await call('POST', '/api/comments', { site: 'palletrotator', lang: '__proto__', scope: 'general', text: 'x' }, A);
eq(r.status, 400, 'ongeldige taalcode geweigerd');
r = await call('POST', '/api/comments', { site: 'bestaat-niet', lang: 'de', scope: 'general', text: 'x' }, A);
eq(r.status, 404, 'onbekende site');
r = await call('POST', '/api/comments', { site: 'palletrotator', lang: 'de', scope: 'general', text: '<img src=x onerror=alert(1)>', page: '/' }, rev);
eq(r.status, 200, 'html in opmerking wordt als tekst opgeslagen');
r = await call('POST', `/api/comments/${cid}/reply`, { text: 'Dank!' }, A); eq(r.status, 200, 'reactie');
r = await call('POST', `/api/comments/${cid}/status`, { status: 'accepted' }, rev); eq(r.status, 403, 'nalezer kan niet accepteren');
r = await call('POST', `/api/comments/${cid}/status`, { status: 'accepted' }, ed); eq(r.status, 403, 'redacteur kan niet accepteren');
r = await call('POST', `/api/comments/${cid}/status`, { status: 'accepted' }, A); eq(r.status, 200, 'beheerder accepteert');
r = await call('GET', '/api/texts?site=palletrotator&lang=de&status=pending', null, A);
eq(r.data.total, 1, 'voorstel staat als nog door te voeren');
r = await call('GET', '/api/export/overrides?site=palletrotator&lang=de', null, A);
const ov = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
ok(ov['Offerte aanvragen'] === 'Angebot anfordern', 'export bevat bestaande overrides');
const key = Object.keys(ov).find((k) => k.includes('<x1>PalletRotator</x1>'));
ok(key && ov[key].includes('Palettenkipper') && ov[key].includes('&amp;') && ov[key].includes('<x1>'), 'export bevat voorstel in geheugenvorm', JSON.stringify(ov));
r = await call('GET', '/api/comments?lang=de&status=open', null, rev); eq(r.data.comments.length, 1, 'nalezer ziet eigen open opmerking');
r = await call('GET', '/api/comments?lang=fr', null, rev); eq(r.data.comments.length, 0, 'nalezer ziet geen Franse opmerkingen');
r = await call('POST', '/api/comments/' + cid + '/status', { status: 'open' }, A);
r = await call('GET', '/api/export/overrides?site=palletrotator&lang=de', null, A);
ok(!Object.values(typeof r.data === 'string' ? JSON.parse(r.data) : r.data).some((v) => v.includes('Palettenkipper')), 'heropenen haalt voorstel weer uit de export');
r = await call('GET', '/api/export/comments.csv', null, A);
ok(r.status === 200 && r.data.includes('Dank!'), 'csv-export');
r = await call('POST', '/api/comments', { site: 'palletrotator', lang: 'de', scope: 'general', text: '=HYPERLINK("http://x","klik")', page: '/' }, A);
r = await call('GET', '/api/export/comments.csv', null, A);
ok(r.data.includes(`"'=HYPERLINK`), 'csv-formule onschadelijk gemaakt');

// ---------- 6. foto's ----------
console.log('6. foto’s');
r = await call('GET', '/api/sites', null, A);
ok(r.data.sites.some((x) => x.id === 'palletrotator'), 'site automatisch ontdekt via bridge');
ok(!r.data.sites.some((x) => x.id === 'evil' && (x.targets || []).some((t) => /^javascript:/.test(t.url))), 'kwaadaardig manifest: javascript-doel niet overgenomen');
ok(!r.data.sites.some((x) => x.id === 'andere' || x.id === 'niet-gelijk'), 'manifest met afwijkend id genegeerd');
r = await call('GET', '/api/photos?site=evil', null, A);
ok(r.status !== 200 || !(r.data.slots || []).some((x) => (x.files || []).length), 'pad-traversal in manifest geen bestanden', String(r.status));
r = await call('GET', '/api/photos?site=palletrotator', null, ed);
eq(r.data.slots.length, 3, '3 fotoplekken uit manifest');
ok(r.data.slots.find((s) => s.id === 'k11-machine').hasBaseline, 'origineel aanwezig');
const body = { note: 'Mooiere foto', files: { 1600: b64('ok-1600.webp'), 800: b64('ok-800.webp') } };
r = await call('POST', '/api/photos/palletrotator/k11-machine/proposals', { note: 'x', files: { 1600: b64('bad.webp'), 800: b64('ok-800.webp') } }, ed);
eq(r.status, 400, 'verkeerd formaat geweigerd');
r = await call('POST', '/api/photos/palletrotator/k11-machine/proposals', { note: 'x', files: { 1600: Buffer.from('<?php echo 1; ?>').toString('base64'), 800: b64('ok-800.webp') } }, ed);
eq(r.status, 400, 'geen webp geweigerd');
r = await call('POST', '/api/photos/palletrotator/..%2fetc/proposals', body, ed); ok(r.status === 404 || r.status === 400, 'onbekende plek', String(r.status));
r = await call('POST', '/api/photos/palletrotator/k11-machine/proposals', body, rev); eq(r.status, 403, 'nalezer kan geen foto voorstellen');
r = await call('POST', '/api/photos/palletrotator/k11-machine/proposals', body, ed);
eq(r.status, 200, 'redacteur stelt foto voor');
const pid = r.data.proposal.id;
r = await call('POST', `/api/photos/palletrotator/k11-machine/proposals/${pid}/approve`, {}, ed); eq(r.status, 403, 'redacteur kan niet goedkeuren');
ok(!fs.existsSync(path.join(process.env.MEDIA_DIR, 'palletrotator/images/foto/palletrotator-k11-machine-1600.webp')), 'nog niet live na voorstel');
r = await call('GET', `/file/proposal/palletrotator/k11-machine/${pid}/1600`, null, ed);
ok(r.status === 200 && r.res.headers.get('content-type') === 'image/webp', 'voorstel-afbeelding te zien');
r = await call('GET', `/file/proposal/palletrotator/k11-machine/..%2f..%2fusers/1600`, null, ed); ok(r.status === 404, 'pad-traversal in voorstel-id geweigerd', String(r.status));
r = await call('GET', `/file/proposal/palletrotator/k11-machine/${pid}/1600`, null, rev); eq(r.status, 403, 'nalezer ziet geen voorstel-afbeelding');
r = await call('POST', `/api/photos/palletrotator/k11-machine/proposals/${pid}/approve`, {}, A); eq(r.status, 200, 'beheerder keurt goed');
const live = path.join(process.env.MEDIA_DIR, 'palletrotator/images/foto/palletrotator-k11-machine-1600.webp');
ok(fs.existsSync(live) && fs.readFileSync(live).equals(fs.readFileSync(path.join(HERE, 'fixtures/ok-1600.webp'))), 'foto staat op het mediavolume');
r = await call('POST', `/api/photos/palletrotator/k11-machine/proposals/${pid}/approve`, {}, A); eq(r.status, 409, 'voorstel kan niet twee keer');
r = await call('GET', '/file/live/palletrotator/k11-machine/1600', null, A);
ok(r.status === 200, 'live-foto bekijkbaar');
r = await call('POST', '/api/photos/palletrotator/k11-machine/revert', {}, A); eq(r.status, 200, 'terugzetten');
ok(!fs.existsSync(live), 'terugzetten verwijdert de vervanging');
r = await call('POST', '/api/photos/palletrotator/team-cees/proposals', { note: '', files: { 800: b64('sq-800.webp'), 400: b64('sq-400.webp') } }, ed);
eq(r.status, 200, 'vierkant teamportret');
r = await call('POST', '/api/photos/palletrotator/team-cees/proposals', body, ed); eq(r.status, 400, '3:2-foto op vierkante plek geweigerd');

// ---------- 7. websites en monitor ----------
console.log('7. websites en monitor');
const dummy = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><html lang="de"><head></head><body>hoi</body></html>'); });
await new Promise((res) => dummy.listen(0, '127.0.0.1', res));
const durl = `http://127.0.0.1:${dummy.address().port}/`;
r = await call('POST', '/api/sites', { name: 'Testsite', targets: [{ label: 'DE test', lang: 'de', url: durl }, { label: 'FR test', lang: 'fr', url: durl }, { label: 'Dood', lang: 'nl', url: 'http://127.0.0.1:1/' }] }, A);
eq(r.status, 200, 'site toegevoegd');
const sid = r.data.site.id;
r = await call('POST', '/api/sites', { name: 'Slecht', targets: [{ url: 'javascript:alert(1)' }] }, A); eq(r.status, 400, 'javascript:-adres geweigerd');
r = await call('POST', '/api/sites', { name: 'Slecht', targets: [{ url: 'file:///etc/passwd' }] }, A); eq(r.status, 400, 'file:-adres geweigerd');
r = await call('POST', '/api/check', { site: sid }, A);
eq(r.status, 200, 'controle uitgevoerd');
const tg = r.data.sites.find((s) => s.id === sid).targets;
ok(tg[0].last.ok && tg[0].last.langOk === true && tg[0].last.htmlLang === 'de', 'bereikbaar en taal klopt');
ok(tg[1].last.ok && tg[1].last.langOk === false, 'verkeerde taal wordt gemeld');
ok(tg[2].last.ok === false && tg[2].last.error, 'onbereikbaar wordt gemeld', JSON.stringify(tg[2].last));
r = await call('DELETE', '/api/sites/palletrotator', null, A); eq(r.status, 400, 'gekoppelde site niet te verwijderen');
r = await call('DELETE', `/api/sites/${sid}`, null, A); eq(r.status, 200, 'site verwijderd');
dummy.close();

// ---------- 8. beheer van gebruikers ----------
console.log('8. beheer');
r = await call('GET', '/api/users', null, A);
const anna = r.data.users.find((u) => u.email === 'nalezer@example.de');
ok(anna.twoFa === true && !('hash' in anna) && !('totp' in anna) && !('recovery' in anna), 'lijst bevat geen geheimen');
const me = r.data.users.find((u) => u.email === 'cees@example.nl');
r = await call('PUT', `/api/users/${me.id}`, { role: 'editor' }, A); eq(r.status, 400, 'laatste beheerder kan niet teruggezet worden');
r = await call('PUT', `/api/users/${me.id}`, { disabled: true }, A); eq(r.status, 400, 'laatste beheerder kan niet geblokkeerd worden');
r = await call('DELETE', `/api/users/${me.id}`, null, A); eq(r.status, 400, 'eigen account niet te verwijderen');
r = await call('POST', `/api/users/${anna.id}/revoke`, {}, A); eq(r.status, 200, 'sessies beëindigd');
r = await call('GET', '/api/texts/meta?site=palletrotator', null, rev); eq(r.status, 401, 'oude sessie van nalezer is ongeldig');
r = await call('POST', `/api/users/${anna.id}/reset2fa`, {}, A); eq(r.status, 200, '2FA gereset');
const rev2 = new Jar();
r = await call('POST', '/api/login', { email: 'nalezer@example.de', password: 'Fietsenmaker-Zomer-Kanaal-4821' }, rev2);
ok(r.status === 200 && !r.data.needs2fa, 'na reset: inloggen zonder code, daarna verplicht opnieuw instellen');
r = await call('GET', '/api/texts/meta?site=palletrotator', null, rev2); eq(r.status, 403, 'na reset eerst 2FA instellen');
r = await call('PUT', `/api/users/${anna.id}`, { disabled: true }, A); eq(r.status, 200, 'gebruiker geblokkeerd');
r = await call('POST', '/api/login', { email: 'nalezer@example.de', password: 'Fietsenmaker-Zomer-Kanaal-4821' }, new Jar()); eq(r.status, 401, 'geblokkeerde gebruiker kan niet inloggen');
r = await call('GET', '/api/log', null, A);
ok(r.data.log.some((l) => l.action === 'inloggen mislukt') && r.data.log.some((l) => l.action === 'foto goedgekeurd'), 'logboek bevat gebeurtenissen');
ok(!JSON.stringify(r.data.log).includes('Spoorwegbrug'), 'logboek bevat geen wachtwoorden');

// ---------- 9. begrenzing ----------
console.log('9. begrenzing');
const big = 'x'.repeat(70 * 1024);
try { r = await call('POST', '/api/comments', { site: 'palletrotator', lang: 'de', scope: 'general', text: big }, A); } catch { r = { status: 0 }; }
ok(r.status === 413 || r.status === 400 || r.status === 500 || r.status === 0, 'te grote aanvraag geweigerd', String(r.status));
let blocked = 0;
const jj = new Jar();
for (let i = 0; i < 12; i++) { const x = await call('POST', '/api/login', { email: 'bestaatniet@example.nl', password: 'x' + i }, jj); if (x.status === 429) blocked++; }
ok(blocked >= 1, 'brute force wordt afgeremd', `geblokkeerd: ${blocked}`);

console.log(`\n${pass} gelukt, ${failed} mislukt.`);
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
