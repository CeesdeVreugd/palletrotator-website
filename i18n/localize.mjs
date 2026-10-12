// Maakt de taalversies: dist/<taal>-raw (Astro-build met SITE_LANG=<taal>) -> dist/<taal>
// met vertaalde tekst, taalspecifieke URL's, sitemap en robots.txt. Geen dependencies.
// Gebruik: node i18n/localize.mjs [taal ...]   (standaard: alle talen waarvoor een -raw map bestaat)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sites, slugs, LANGS, loadMemory, lookup, skipSegment, tagsOk, mapPath, pathFor, jsonLd, listFiles, nlPathOfFile, sitemapXml, robotsTxt } from './lib.mjs';
import { parse, serialize, process as walk, getAttr } from './html.mjs';

const dist = path.join(ROOT, 'dist');
const strict = process.env.I18N_STRICT === '1';
const wanted = process.argv.slice(2);
let exitCode = 0;

const pages = Object.keys(slugs);
// nl: alleen sitemap en robots met hreflang bijwerken
if (fs.existsSync(path.join(dist, 'nl'))) {
  fs.writeFileSync(path.join(dist, 'nl', 'sitemap.xml'), sitemapXml('nl', pages));
  fs.writeFileSync(path.join(dist, 'nl', 'robots.txt'), robotsTxt('nl'));
  console.log('[i18n] nl: sitemap en robots.txt bijgewerkt');
}

for (const lang of LANGS) {
  if (wanted.length && !wanted.includes(lang)) continue;
  const raw = path.join(dist, `${lang}-raw`);
  if (!fs.existsSync(raw)) { console.log(`[i18n] ${lang}: geen build gevonden (${path.relative(ROOT, raw)}), overgeslagen`); continue; }
  const out = path.join(dist, lang);
  fs.rmSync(out, { recursive: true, force: true });
  const mem = loadMemory(lang);
  const stat = { total: 0, done: 0, missing: new Set(), problems: [] };
  const site = sites[lang];

  for (const file of listFiles(raw)) {
    const rel = path.relative(raw, file);
    if (rel === 'sitemap.xml' || rel === 'robots.txt') continue;
    let target = rel;
    if (rel.endsWith('.html')) {
      const nlPath = nlPathOfFile(rel);
      const p = pathFor(nlPath, lang);
      target = nlPath === '/404.html' ? rel : p === '/' ? 'index.html' : p.replace(/^\//, '') + (p.endsWith('/') ? 'index.html' : '');
    }
    const dest = path.join(out, target);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!rel.endsWith('.html')) { fs.copyFileSync(file, dest); continue; }

    const tree = parse(fs.readFileSync(file, 'utf8'));
    const onSegment = (key) => {
      if (skipSegment(key)) return null;
      stat.total++;
      const tr = lookup(mem, key);
      if (!tr) { stat.missing.add(key); return null; }
      if (!tagsOk(key, tr)) { stat.problems.push(key); return null; }
      stat.done++; return tr;
    };
    walk(tree, {
      onSegment,
      onAttr: (el, name, value) => {
        if (el.tag === 'html' && name === 'lang') return lang;
        if (getAttr(el, 'data-keep-url')) return undefined;
        if (['href', 'content', 'src', 'action'].includes(name)) {
          if (name === 'href' && value.startsWith('/')) return mapPath(value, lang);
          if (value.startsWith(sites.nl.origin)) return site.origin + mapPath(value.slice(sites.nl.origin.length) || '/', lang);
        }
        return undefined;
      },
      onJsonLd: (text) => jsonLd(text, lang, onSegment),
      problems: stat.problems,
    });
    let html = serialize(tree);
    html = html.split(sites.nl.email).join(site.email);
    fs.writeFileSync(dest, html);
  }
  fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemapXml(lang, pages));
  fs.writeFileSync(path.join(out, 'robots.txt'), robotsTxt(lang));

  const miss = stat.missing.size;
  console.log(`[i18n] ${lang}: ${stat.done}/${stat.total} segmenten vertaald, ${miss} ontbreken, ${new Set(stat.problems).size} met tagprobleem`);
  if (miss) { console.log('        ontbrekend (eerste 8):'); [...stat.missing].slice(0, 8).forEach((k) => console.log('        - ' + k.slice(0, 110))); }
  if (strict && (miss || stat.problems.length)) exitCode = 1;
}
process.exit(exitCode);
