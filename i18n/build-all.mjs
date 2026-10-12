// Bouwt alle taalversies en maakt daarna de vertaalde sites: npm run build:all [taal ...]
import { execSync } from 'node:child_process';
import { sites } from './lib.mjs';

const only = process.argv.slice(2);
const langs = Object.keys(sites).filter((l) => !only.length || only.includes(l));
for (const l of langs) {
  console.log(`\n=== astro build (${l}) ===`);
  execSync('npx astro build', { stdio: 'inherit', env: { ...process.env, SITE_LANG: l } });
}
console.log('\n=== vertalen en taalversies maken ===');
execSync('node i18n/localize.mjs' + (only.length ? ' ' + only.filter((l) => l !== 'nl').join(' ') : ''), { stdio: 'inherit' });
