// Eenvoudige JSON-opslag op het data-volume (atomair schrijven, cache in geheugen). Geen dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA = process.env.DATA_DIR || '/data';
export const MEDIA = process.env.MEDIA_DIR || '/media';
fs.mkdirSync(DATA, { recursive: true });

const cache = new Map();

export function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let v;
  try { v = JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { v = structuredClone(fallback); }
  cache.set(name, v);
  return v;
}

export function save(name) {
  const v = cache.get(name);
  const p = path.join(DATA, name);
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
  fs.renameSync(tmp, p);
}

export const uid = (n = 8) => crypto.randomBytes(n).toString('hex');

export function log(user, action, detail = '') {
  const line = JSON.stringify({ at: new Date().toISOString(), user: user ? (user.email || user) : 'systeem', action, detail }) + '\n';
  try { fs.appendFileSync(path.join(DATA, 'log.jsonl'), line); } catch (e) { console.error('[log]', e.message); }
}

export function readLog(limit = 200) {
  try {
    const p = path.join(DATA, 'log.jsonl');
    const st = fs.statSync(p);
    const size = Math.min(st.size, 400 * 1024);
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(size);
    fs.readSync(fd, buf, 0, size, st.size - size);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    const out = [];
    for (const l of lines.slice(-limit).reverse()) { try { out.push(JSON.parse(l)); } catch {} }
    return out;
  } catch { return []; }
}

export function writeFileAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${uid(3)}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
