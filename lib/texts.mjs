// Leest per website de nalezen-bestanden (<bridge>/<site>/nalezen/<taal>.csv, door Vertalen.cmd aangemaakt) en maakt er
// een doorzoekbare lijst van.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { siteDir } from './registry.mjs';

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
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

// {1}…{/1}-weergave <-> interne <x1>…</x1>-vorm van het vertaalgeheugen
export const fromDisplay = (k) => k.replace(/\{(\d+)\/\}/g, '<x$1/>').replace(/\{\/(\d+)\}/g, '</x$1>').replace(/\{(\d+)\}/g, '<x$1>');
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&apos;': "'" };
export const decodeEntities = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, (m) => ENT[m]);
export const encodeEntities = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const idOf = (rawKey) => crypto.createHash('sha1').update(rawKey).digest('hex').slice(0, 12);

const tokens = (s) => (s.match(/\{\/?\d+\/?\}/g) || []).sort().join('|');
export const tokensMatch = (a, b) => tokens(a) === tokens(b);

const cache = new Map();
const nalezenDir = (site) => path.join(siteDir(site), 'nalezen');

function readLang(site, lang) {
  if (!/^[a-z]{2}$/.test(lang)) return null;
  const file = path.join(nalezenDir(site), `${lang}.csv`);
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const k = `${site}/${lang}`;
  const hit = cache.get(k);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const rows = parseCsv(fs.readFileSync(file, 'utf8')).slice(1);
  const items = [];
  for (const r of rows) {
    if (r.length < 3 || !r[1]) continue;
    const key = fromDisplay(r[1]);
    items.push({ id: idOf(key), key, pages: (r[0] || '').split(/\s+/).filter(Boolean), nlRaw: r[1], trRaw: r[2], bron: r[3] || '' });
  }
  const out = { mtime: st.mtimeMs, items };
  cache.set(k, out);
  return out;
}

export function availableLangs(site) {
  try { return fs.readdirSync(nalezenDir(site)).filter((f) => /^[a-z]{2}\.csv$/.test(f)).map((f) => f.slice(0, 2)).sort(); } catch { return []; }
}

// lang 'nl' = alleen de bronteksten (uit het eerste beschikbare nalezen-bestand)
export function getItems(site, lang) {
  if (lang === 'nl') {
    const first = availableLangs(site).find((l) => l !== 'nl');
    const d = first && readLang(site, first);
    return d ? d.items.map((i) => ({ ...i, trRaw: i.nlRaw, bron: 'bron' })) : [];
  }
  const d = readLang(site, lang);
  return d ? d.items : [];
}
export const getItem = (site, lang, id) => getItems(site, lang).find((i) => i.id === id) || null;
export const present = (i) => ({ id: i.id, pages: i.pages, page: i.pages[0] || '', nl: decodeEntities(i.nlRaw), tr: decodeEntities(i.trRaw), bron: i.bron });

export function bakedOverrides(site, lang) {
  try { return JSON.parse(fs.readFileSync(path.join(siteDir(site), 'overrides', `${lang}.json`), 'utf8')); } catch { return {}; }
}
