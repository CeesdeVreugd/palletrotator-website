// Maakt het koppelbestand (bundel) waarmee deze website zich aanmeldt bij de WebsiteBeheerPortal.
//   node portal-bundle/make.mjs <uitvoermap>
// Inhoud: manifest.json (naam, adressen, fotoplekken, talen), nalezen/*.csv, overrides/*.json en baseline/ (de
// originele foto's uit de build). Bij het opstarten van de website-container wordt de bundel naar het gedeelde volume
// "portal-bridge" gekopieerd (/bridge/palletrotator). Zie README, hoofdstuk "WebsiteBeheerPortal".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist-portal-bundle'));
const SITE_ID = 'palletrotator';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const sites = readJson(path.join(ROOT, 'i18n/sites.json'), {});
const slotDefs = readJson(path.join(ROOT, 'portal-bundle/slots.json'), []);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// adressen: de productiedomeinen + de testsite
const targets = Object.entries(sites).map(([lang, s]) => ({ id: lang, label: `${(s.label || lang).toUpperCase()} · ${new URL(s.origin).hostname}`, lang, url: s.origin + '/' }));
targets.push({ id: 'test', label: 'NL · testsite', lang: 'nl', url: 'https://palletrotator.devreugd-pt.nl/' });

// teksten
const langs = [];
const nalDir = path.join(ROOT, 'i18n/nalezen');
fs.mkdirSync(path.join(out, 'nalezen'), { recursive: true });
for (const f of fs.existsSync(nalDir) ? fs.readdirSync(nalDir) : []) {
  if (!/^[a-z]{2}\.csv$/.test(f)) continue;
  fs.copyFileSync(path.join(nalDir, f), path.join(out, 'nalezen', f));
  langs.push(f.slice(0, 2));
}
const ovDir = path.join(ROOT, 'i18n/overrides');
fs.mkdirSync(path.join(out, 'overrides'), { recursive: true });
for (const f of fs.existsSync(ovDir) ? fs.readdirSync(ovDir) : []) if (/^[a-z]{2}\.json$/.test(f)) fs.copyFileSync(path.join(ovDir, f), path.join(out, 'overrides', f));

// fotoplekken en originele foto's
const slots = slotDefs.map((s) => {
  const files = {};
  for (const size of s.sizes) {
    const rel = `images/${s.dir}/${s.base}-${size}.webp`;
    files[size] = rel;
    const src = path.join(ROOT, 'public', rel);
    if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(path.join(out, 'baseline', rel)), { recursive: true }); fs.copyFileSync(src, path.join(out, 'baseline', rel)); }
  }
  return { id: s.id, label: s.label, usage: s.usage, aspect: s.aspect, sizes: s.sizes, dims: s.dims, files };
});

const names = { nl: 'Nederlands', de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano', es: 'Español' };
const manifest = {
  version: 1, id: SITE_ID, name: 'PalletRotator',
  description: 'palletrotator.nl, .de, .eu, .fr, .it en .es',
  updated: new Date().toISOString(), targets,
  texts: langs.length ? { langs, names } : null,
  slots,
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`[portal-bundle] ${slots.length} fotoplekken, ${langs.length} talen, ${targets.length} adressen -> ${out}`);
