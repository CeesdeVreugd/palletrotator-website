import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const I18N = path.join(ROOT, 'i18n');
export const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
export const sites = readJson(path.join(I18N, 'sites.json'), {});
export const slugs = readJson(path.join(I18N, 'slugs.json'), {});
export const dnt = new Set(readJson(path.join(I18N, 'dnt.json'), []));
export const LANGS = Object.keys(sites).filter((l) => l !== 'nl');

export const hasLetters = (s) => /\p{L}{3,}/u.test(s);
export function skipSegment(key) {
  const plain = key.replace(/<\/?x\d+\/?>/g, '').trim();
  if (!hasLetters(plain)) return true;
  if (dnt.has(plain)) return true;
  if (/^\S+@\S+$/.test(plain) || /^https?:\/\/\S+$/.test(plain)) return true;
  return false;
}

// NL-pad -> pad in taal L (alleen als het pad in slugs.json staat). Behoudt ?query en #anker.
export function mapPath(href, lang) {
  if (lang === 'nl' || !href.startsWith('/')) return href;
  const m = href.match(/^([^?#]*)(.*)$/);
  const hit = slugs[m[1]];
  return hit && hit[lang] ? hit[lang] + m[2] : href;
}
export const pathFor = (nlPath, lang) => (lang === 'nl' ? nlPath : slugs[nlPath]?.[lang] || nlPath);

// Geheugen: handmatige overrides gaan voor, daarna het vertaalgeheugen.
export function memoryPaths(lang) {
  return {
    memory: path.join(I18N, 'memory', `${lang}.json`),
    overrides: path.join(I18N, 'overrides', `${lang}.json`),
    glossary: path.join(I18N, 'glossary', `${lang}.tsv`),
    review: path.join(I18N, 'nalezen', `${lang}.csv`),
  };
}
export function loadMemory(lang) {
  const p = memoryPaths(lang);
  return { memory: readJson(p.memory, {}), overrides: readJson(p.overrides, {}) };
}
// De bron (NL) bevat geen aanhalingstekens; die voegt de automatische vertaling soms toe rond merknamen en kopjes
// (bijv. „Standard“ und „EPT“). Die halen we er in alle talen weer uit (nalezer DE, oktober 2026).
export const stripQuotes = (s) => (typeof s === 'string' ? s.replace(/[«‹]\s*/g, '').replace(/\s*[»›]/g, '').replace(/[„“”]|&quot;|&ldquo;|&rdquo;|&bdquo;/g, '') : s);
export const lookup = (mem, key) => stripQuotes(mem.overrides[key] ?? mem.memory[key]);

// Valideer dat plaatshouders in dezelfde volgorde-structuur staan (open voor sluit, netjes genest).
export function tagsOk(src, tr) {
  const toks = (s) => (s.match(/<\/?x\d+\/?>/g) || []);
  const a = toks(src).slice().sort().join(''), b = toks(tr).slice().sort().join('');
  if (a !== b) return false;
  const st = [];
  for (const t of toks(tr)) {
    const n = t.match(/\d+/)[0];
    if (t.endsWith('/>')) continue;
    if (t.startsWith('</')) { if (st.pop() !== n) return false; } else st.push(n);
  }
  return st.length === 0;
}

// JSON-LD: tekstvelden vertalen, URL's naar het domein en het pad van de taal.
const LD_TEXT = new Set(['name', 'description', 'headline', 'text', 'caption', 'category', 'alternateName', 'abstract', 'jobTitle', 'slogan']);
export function jsonLd(text, lang, onSegment) {
  let data; try { data = JSON.parse(text); } catch { return text; }
  const nlOrigin = sites.nl.origin, to = sites[lang].origin;
  const walk = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k], k); return o; }
    if (typeof v === 'string') {
      if (v.startsWith(nlOrigin)) { const rest = v.slice(nlOrigin.length) || '/'; return to + mapPath(rest, lang); }
      if (LD_TEXT.has(key)) {
        const k = v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[ \t\r\n\f]+/g, ' ').trim();
        if (!skipSegment(k)) { const tr = onSegment(k, 'jsonld'); if (tr) return tr.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
      }
    }
    return v;
  };
  return JSON.stringify(walk(data));
}

export function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p)); else out.push(p);
  }
  return out;
}

export const nlPathOfFile = (rel) => '/' + rel.replace(/\\/g, '/').replace(/index\.html$/, '');

export function sitemapXml(lang, pages) {
  const o = sites[lang].origin;
  const prio = { '/': '1.0', '/offerte-aanvragen/': '0.9', '/palletrotator/': '0.8', '/palletrotator-ept/': '0.8', '/vrieshuis-palletkantelaar/': '0.8', '/freezer-spacers-verwijderen/': '0.8', '/palletwisselaar/': '0.8' };
  const langs = Object.keys(sites);
  const hreflang = (l) => (l === 'en' ? 'en' : l);
  const rows = pages.map((nl) => {
    const alts = langs.map((l) => `    <xhtml:link rel="alternate" hreflang="${hreflang(l)}" href="${sites[l].origin}${pathFor(nl, l)}"/>`).join('\n');
    const xdef = `    <xhtml:link rel="alternate" hreflang="x-default" href="${sites.nl.origin}${nl}"/>`;
    return `  <url>\n    <loc>${o}${pathFor(nl, lang)}</loc>\n${alts}\n${xdef}\n    <changefreq>monthly</changefreq>\n    <priority>${prio[nl] || '0.6'}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join('\n')}\n</urlset>\n`;
}
export const robotsTxt = (lang) => `User-agent: *\nAllow: /\n\nSitemap: ${sites[lang].origin}/sitemap.xml\n`;
