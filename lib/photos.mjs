// Foto-slots per website: voorstellen, goedkeuren, terugzetten. Live foto's staan op het gedeelde volume
// "portal-media" (/media/<website>/…); de website serveert die vóór zijn ingebouwde foto's.
import fs from 'node:fs';
import path from 'node:path';
import { DATA, MEDIA, load, save, uid, writeFileAtomic } from './store.mjs';
import { siteById, siteDir } from './registry.mjs';

const within = (root, file) => { const r = path.resolve(root); const f = path.resolve(file); if (f !== r && !f.startsWith(r + path.sep)) throw Object.assign(new Error('Ongeldig pad.'), { code: 400 }); return f; };

export const slotsOf = (siteId) => (siteById(siteId)?.slots) || [];
export const slotOf = (siteId, slotId) => slotsOf(siteId).find((s) => s.id === slotId) || null;

const key = (siteId, slot) => `${siteId}:${slot.id}`;
export const livePath = (siteId, slot, size) => within(path.join(MEDIA, siteId), path.join(MEDIA, siteId, slot.files[size]));
export const baselinePath = (siteId, slot, size) => within(path.join(siteDir(siteId), 'baseline'), path.join(siteDir(siteId), 'baseline', slot.files[size]));
export const proposalPath = (siteId, slot, pid, size) => within(path.join(DATA, 'proposals'), path.join(DATA, 'proposals', siteId, slot.id, pid, `${size}.webp`));
const historyDir = (siteId, slot) => path.join(DATA, 'history', siteId, slot.id);

export function webpSize(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const t = b.toString('ascii', 12, 16);
  if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (t === 'VP8L') { if (b[20] !== 0x2f) return null; const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  return null;
}

const state = () => load('photos.json', {});

export function slotState(siteId, slot) {
  const st = state()[key(siteId, slot)] || { proposals: [], history: [] };
  const lp = livePath(siteId, slot, slot.sizes[0]);
  const live = fs.existsSync(lp);
  let version = 0;
  if (live) { try { version = Math.floor(fs.statSync(lp).mtimeMs); } catch {} }
  return { ...slot, site: siteId, live, version, proposals: st.proposals || [], history: (st.history || []).slice(-20).reverse(), hasBaseline: fs.existsSync(baselinePath(siteId, slot, slot.sizes[0])) };
}

export function createProposal(siteId, slot, user, note, files) {
  const buffers = {};
  for (const size of slot.sizes) {
    const b64 = files && files[size];
    if (typeof b64 !== 'string') throw Object.assign(new Error(`Bestand voor ${size}px ontbreekt.`), { code: 400 });
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 4 * 1024 * 1024) throw Object.assign(new Error('Foto is te groot (max 4 MB per formaat).'), { code: 400 });
    const d = webpSize(buf);
    if (!d) throw Object.assign(new Error('Alleen WebP-bestanden zijn toegestaan.'), { code: 400 });
    const want = slot.dims[size];
    if (Math.abs(d.w - want[0]) > 2 || Math.abs(d.h - want[1]) > 2) throw Object.assign(new Error(`Formaat ${size}px moet ${want[0]}×${want[1]} zijn (is ${d.w}×${d.h}).`), { code: 400 });
    buffers[size] = buf;
  }
  const id = uid(6);
  for (const size of slot.sizes) writeFileAtomic(proposalPath(siteId, slot, id, size), buffers[size]);
  const s = state();
  s[key(siteId, slot)] = s[key(siteId, slot)] || { proposals: [], history: [] };
  const p = { id, by: user.name || user.email, byId: user.id, at: new Date().toISOString(), note: String(note || '').slice(0, 500), status: 'pending' };
  s[key(siteId, slot)].proposals.push(p);
  save('photos.json');
  return p;
}

function archiveLive(siteId, slot, tag) {
  const dir = historyDir(siteId, slot);
  for (const size of slot.sizes) {
    const lp = livePath(siteId, slot, size);
    if (fs.existsSync(lp)) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(lp, path.join(dir, `${tag}-${size}.webp`)); }
  }
}

export function decide(siteId, slot, pid, user, approve) {
  const s = state();
  const entry = s[key(siteId, slot)];
  const p = entry && entry.proposals.find((x) => x.id === pid);
  if (!p) throw Object.assign(new Error('Voorstel niet gevonden.'), { code: 404 });
  if (p.status !== 'pending') throw Object.assign(new Error('Dit voorstel is al beoordeeld.'), { code: 409 });
  const by = user.name || user.email;
  if (approve) {
    archiveLive(siteId, slot, new Date().toISOString().replace(/[:.]/g, '-'));
    for (const size of slot.sizes) writeFileAtomic(livePath(siteId, slot, size), fs.readFileSync(proposalPath(siteId, slot, pid, size)));
    entry.history.push({ at: new Date().toISOString(), by, action: 'goedgekeurd en live gezet', proposalBy: p.by, note: p.note });
    p.status = 'approved';
  } else {
    p.status = 'rejected';
    entry.history.push({ at: new Date().toISOString(), by, action: 'voorstel afgewezen', proposalBy: p.by, note: p.note });
  }
  p.decidedBy = by; p.decidedAt = new Date().toISOString();
  save('photos.json');
  return p;
}

export function revert(siteId, slot, user) {
  archiveLive(siteId, slot, new Date().toISOString().replace(/[:.]/g, '-'));
  for (const size of slot.sizes) { try { fs.unlinkSync(livePath(siteId, slot, size)); } catch {} }
  const s = state();
  s[key(siteId, slot)] = s[key(siteId, slot)] || { proposals: [], history: [] };
  s[key(siteId, slot)].history.push({ at: new Date().toISOString(), by: user.name || user.email, action: 'teruggezet naar de originele foto' });
  save('photos.json');
}

export const pendingCount = (siteId) => Object.entries(state()).filter(([k]) => k.startsWith(siteId + ':')).reduce((n, [, e]) => n + (e.proposals || []).filter((p) => p.status === 'pending').length, 0);
