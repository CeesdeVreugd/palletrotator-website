// Vertaalt de Nederlandse site met DeepL naar de gekozen talen en bewaart het resultaat als vertaalgeheugen
// (i18n/memory/<taal>.json). Bestaande vertalingen worden nooit overschreven. Geen dependencies (Node 18+).
//
//   node i18n/translate.mjs                    alle talen, alleen ontbrekende segmenten
//   node i18n/translate.mjs --lang de,fr       alleen deze talen
//   node i18n/translate.mjs --export           alleen de CSV's voor nalezen (zonder DeepL)
//   node i18n/translate.mjs --import bestand.csv --lang de    gecorrigeerde CSV terug in het geheugen
//   node i18n/translate.mjs --prune            verwijder geheugen-regels die niet meer op de site staan
//   node i18n/translate.mjs --dry              toon wat vertaald zou worden
// Sleutel: omgevingsvariabele DEEPL_API_KEY (nooit in de repo of chat).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, sites, LANGS, loadMemory, memoryPaths, skipSegment, tagsOk, listFiles, nlPathOfFile, jsonLd } from './lib.mjs';
import { parse, process as walk } from './html.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const langs = (opt('lang') ? opt('lang').split(',') : LANGS).filter((l) => LANGS.includes(l));
const KEY = process.env.DEEPL_API_KEY || '';
const API = (process.env.DEEPL_API_URL || (KEY.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com')).replace(/\/$/, '');

// ---------- segmenten uit de Nederlandse build ----------
function extract() {
  const nlDir = path.join(ROOT, 'dist', 'nl');
  if (!fs.existsSync(nlDir)) { console.error('Geen dist/nl gevonden. Bouw eerst de Nederlandse site (SITE_LANG=nl, astro build).'); process.exit(1); }
  const seg = new Map();
  for (const file of listFiles(nlDir).filter((f) => f.endsWith('.html'))) {
    const page = nlPathOfFile(path.relative(nlDir, file));
    const add = (key) => { if (!skipSegment(key)) { if (!seg.has(key)) seg.set(key, new Set()); seg.get(key).add(page); } return null; };
    walk(parse(fs.readFileSync(file, 'utf8')), { onSegment: add, onJsonLd: (t) => { jsonLd(t, 'de', add); return t; } });
  }
  return seg;
}

// ---------- CSV ----------
const toDisplay = (k) => k.replace(/<x(\d+)\/>/g, '{$1/}').replace(/<x(\d+)>/g, '{$1}').replace(/<\/x(\d+)>/g, '{/$1}');
const fromDisplay = (k) => k.replace(/\{(\d+)\/\}/g, '<x$1/>').replace(/\{\/(\d+)\}/g, '</x$1>').replace(/\{(\d+)\}/g, '<x$1>');
const csvCell = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function parseCsv(text) {
  text = text.replace(/^﻿/, ''); const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
function exportCsv(lang, seg, mem) {
  const p = memoryPaths(lang).review; fs.mkdirSync(path.dirname(p), { recursive: true });
  const lines = [['Pagina', 'Nederlands', sites[lang].name, 'Bron'].map(csvCell).join(';')];
  for (const [key, pages] of [...seg.entries()].sort((a, b) => [...a[1]][0].localeCompare([...b[1]][0]))) {
    const ov = mem.overrides[key] !== undefined;
    const tr = mem.overrides[key] ?? mem.memory[key] ?? '';
    lines.push([[...pages].slice(0, 3).join(' '), toDisplay(key), toDisplay(tr), ov ? 'handmatig' : tr ? 'DeepL' : 'ONTBREEKT'].map(csvCell).join(';'));
  }
  fs.writeFileSync(p, '﻿' + lines.join('\r\n') + '\r\n');
  console.log(`  nalezen-bestand: ${path.relative(ROOT, p)}`);
}

// ---------- DeepL ----------
async function deepl(method, url, body, tries = 5) {
  for (let t = 0; t < tries; t++) {
    const r = await fetch(API + url, { method, headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 1000 * 2 ** t)); continue; }
    if (!r.ok) throw new Error(`DeepL ${method} ${url}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? {} : r.json();
  }
  throw new Error(`DeepL ${method} ${url}: te veel pogingen`);
}
async function glossaryFor(lang) {
  const gp = memoryPaths(lang).glossary;
  if (!fs.existsSync(gp)) return undefined;
  const entries = fs.readFileSync(gp, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#') && l.includes('\t')).join('\n');
  if (!entries) return undefined;
  // DeepL Free staat maar 1 glossarium toe: ruim eerst onze eigen oude glossaria op
  try {
    const list = await deepl('GET', '/v2/glossaries');
    for (const x of list.glossaries || []) if ((x.name || '').startsWith('palletrotator-')) { try { await deepl('DELETE', `/v2/glossaries/${x.glossary_id}`); } catch {} }
  } catch {}
  const g = await deepl('POST', '/v2/glossaries', { name: `palletrotator-${lang}`, source_lang: 'nl', target_lang: sites[lang].deepl.slice(0, 2).toLowerCase(), entries, entries_format: 'tsv' });
  console.log(`  glossarium aangemaakt (${entries.split('\n').length} termen)`);
  return g.glossary_id;
}
const KEEP = /(PalletRotator|\bEPT\b|De Vreugd Productietechniek)/g;
const wrapKeep = (s) => s.replace(KEEP, '<keep>$1</keep>');
const unKeep = (s) => s.replace(/<\/?keep>/g, '');

async function translateAll(lang, keys) {
  const glossary_id = await glossaryFor(lang);
  try {
    return await translateInner(lang, keys, glossary_id);
  } finally {
    if (glossary_id) { try { await deepl('DELETE', `/v2/glossaries/${glossary_id}`); } catch {} }
  }
}
async function translateInner(lang, keys, glossary_id) {
  const out = {};
  let batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const body = { text: batch.map((k) => wrapKeep(k)), source_lang: 'NL', target_lang: sites[lang].deepl, tag_handling: 'xml', ignore_tags: ['keep'], preserve_formatting: true, split_sentences: 'nonewlines' };
    if (sites[lang].formality) body.formality = 'prefer_more';
    if (glossary_id) body.glossary_id = glossary_id;
    const res = await deepl('POST', '/v2/translate', body);
    res.translations.forEach((t, i) => { out[batch[i]] = unKeep(t.text); });
    batch = []; size = 0;
  };
  for (const k of keys) {
    if (batch.length >= 40 || size + k.length > 90000) await flush();
    batch.push(k); size += k.length;
  }
  await flush();
  return out;
}

// ---------- main ----------
const writeMem = (lang, obj) => {
  const p = memoryPaths(lang).memory; fs.mkdirSync(path.dirname(p), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0])));
  fs.writeFileSync(p, JSON.stringify(sorted, null, 2) + '\n');
};

if (opt('import')) {
  const lang = langs[0]; const rows = parseCsv(fs.readFileSync(opt('import'), 'utf8')).slice(1);
  const { memory } = loadMemory(lang); let n = 0, bad = 0;
  for (const r of rows) {
    if (r.length < 3 || !r[1] || !r[2]) continue;
    const key = fromDisplay(r[1]), tr = fromDisplay(r[2]);
    if (!tagsOk(key, tr)) { console.log(`  OVERGESLAGEN (tags {1}…{/1} kloppen niet): ${r[1].slice(0, 70)}`); bad++; continue; }
    if (memory[key] !== tr) { memory[key] = tr; n++; }
  }
  writeMem(lang, memory); console.log(`${lang}: ${n} regels bijgewerkt, ${bad} overgeslagen.`); process.exit(0);
}

const seg = extract();
console.log(`${seg.size} vertaalbare segmenten op de Nederlandse site.`);
for (const lang of langs) {
  console.log(`\n== ${sites[lang].name} (${lang}) ==`);
  const mem = loadMemory(lang);
  if (flag('prune')) { let n = 0; for (const k of Object.keys(mem.memory)) if (!seg.has(k)) { delete mem.memory[k]; n++; } writeMem(lang, mem.memory); console.log(`  ${n} verouderde regels verwijderd`); }
  const missing = [...seg.keys()].filter((k) => mem.overrides[k] === undefined && (flag('force') || mem.memory[k] === undefined));
  console.log(`  ${missing.length} nog te vertalen`);
  if (missing.length && !flag('export') && !flag('dry')) {
    if (!KEY) { console.error('  DEEPL_API_KEY ontbreekt. Zet de sleutel als omgevingsvariabele en probeer opnieuw.'); process.exit(1); }
    const res = await translateAll(lang, missing);
    let bad = 0;
    for (const [k, v] of Object.entries(res)) { if (!tagsOk(k, v)) { bad++; console.log(`  ! tagprobleem, overgeslagen: ${k.slice(0, 70)}`); continue; } mem.memory[k] = v; }
    writeMem(lang, mem.memory);
    console.log(`  ${missing.length - bad} vertaald${bad ? `, ${bad} met probleem` : ''}`);
  }
  exportCsv(lang, seg, loadMemory(lang));
}
console.log('\nKlaar.');
