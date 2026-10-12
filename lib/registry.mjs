// Websites ontdekken: elke website zet bij het opstarten een koppelbestand (manifest) klaar op het gedeelde volume
// "portal-bridge": /bridge/<id>/manifest.json (+ nalezen/, overrides/, baseline/). Handmatig toegevoegde websites
// (alleen adressen controleren) staan in sites.json op het data-volume.
import fs from 'node:fs';
import path from 'node:path';
import { load } from './store.mjs';

export const BRIDGE = process.env.BRIDGE_DIR || '/bridge';
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE = /^images\/[a-z0-9][a-z0-9/_-]*-\d{2,4}\.webp$/;

const cache = new Map();

function sanitizeTargets(list) {
  if (!Array.isArray(list)) return [];
  const used = new Set();
  const out = [];
  for (const t of list.slice(0, 30)) {
    let u; try { u = new URL(String(t.url)); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    let id = String(t.id || t.lang || out.length + 1).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || String(out.length + 1);
    while (used.has(id)) id += '-2';
    used.add(id);
    out.push({ id, label: String(t.label || u.hostname).slice(0, 60), lang: String(t.lang || '').toLowerCase().slice(0, 5), url: u.href });
  }
  return out;
}

function sanitizeSlots(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list.slice(0, 200)) {
    if (!s || !ID.test(String(s.id))) continue;
    const sizes = (Array.isArray(s.sizes) ? s.sizes : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 4000);
    if (!sizes.length) continue;
    const files = {}, dims = {};
    let good = true;
    for (const size of sizes) {
      const f = s.files && s.files[size];
      const d = s.dims && s.dims[size];
      if (typeof f !== 'string' || !FILE.test(f) || f.includes('..') || !Array.isArray(d) || d.length !== 2) { good = false; break; }
      files[size] = f; dims[size] = [Number(d[0]), Number(d[1])];
    }
    if (!good) continue;
    out.push({ id: String(s.id), label: String(s.label || s.id).slice(0, 80), usage: String(s.usage || '').slice(0, 200), aspect: String(s.aspect || '3:2').slice(0, 8), sizes, files, dims });
  }
  return out;
}

function readManifest(dirName) {
  const dir = path.join(BRIDGE, dirName);
  const file = path.join(dir, 'manifest.json');
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  const hit = cache.get(dirName);
  if (hit && hit.mtime === st.mtimeMs) return hit.value;
  let value = null;
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (m && ID.test(String(m.id)) && m.id === dirName) {
      const langs = Array.isArray(m.texts && m.texts.langs) ? m.texts.langs.map((l) => String(l).toLowerCase()).filter((l) => /^[a-z]{2}$/.test(l)) : [];
      value = {
        id: m.id, name: String(m.name || m.id).slice(0, 80), description: String(m.description || '').slice(0, 200), updated: m.updated || null,
        source: 'manifest', targets: sanitizeTargets(m.targets), slots: sanitizeSlots(m.slots),
        textsSource: langs.length ? { langs, names: m.texts.names || {} } : null,
      };
    }
  } catch { value = null; }
  cache.set(dirName, { mtime: st.mtimeMs, value });
  return value;
}

export function discovered() {
  let dirs = [];
  try { dirs = fs.readdirSync(BRIDGE, { withFileTypes: true }).filter((d) => d.isDirectory() && ID.test(d.name)).map((d) => d.name); } catch {}
  return dirs.map(readManifest).filter(Boolean);
}
export const manual = () => load('sites.json', []).map((s) => ({ ...s, source: 'manual', slots: [], textsSource: null }));

export function allSites() {
  const found = discovered();
  const ids = new Set(found.map((s) => s.id));
  return [...found, ...manual().filter((s) => !ids.has(s.id))];
}
export const siteById = (id) => allSites().find((s) => s.id === id) || null;
export const siteDir = (id) => path.join(BRIDGE, id);
