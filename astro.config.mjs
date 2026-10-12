import { defineConfig } from 'astro/config';
import fs from 'node:fs';

// Eén broncode, meerdere talen: SITE_LANG bepaalt de taalversie (nl, de, en, fr, it, es).
// NL bouwt rechtstreeks naar dist/nl; de andere talen naar dist/<taal>-raw en worden daarna door
// i18n/localize.mjs vertaald naar dist/<taal>.
const sites = JSON.parse(fs.readFileSync(new URL('./i18n/sites.json', import.meta.url), 'utf8'));
const lang = process.env.SITE_LANG && sites[process.env.SITE_LANG] ? process.env.SITE_LANG : 'nl';

export default defineConfig({
  site: sites[lang].origin,
  output: 'static',
  outDir: lang === 'nl' ? './dist/nl' : `./dist/${lang}-raw`,
});
