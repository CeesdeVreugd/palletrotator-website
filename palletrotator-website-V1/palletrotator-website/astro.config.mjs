import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.palletrotator.nl',
  integrations: [sitemap()],
  output: 'static'
});
