import sitesJson from '../../i18n/sites.json';
import slugsJson from '../../i18n/slugs.json';

export type Lang = 'nl' | 'de' | 'en' | 'fr' | 'it' | 'es';
type Site = { origin: string; locale: string; label: string; name: string; email: string };
export const sites = sitesJson as Record<Lang, Site>;
const slugs = slugsJson as Record<string, Partial<Record<Lang, string>>>;

export const LANGS = Object.keys(sites) as Lang[];
const envLang = (typeof process !== 'undefined' && process.env.SITE_LANG) || 'nl';
export const lang: Lang = (LANGS as string[]).includes(envLang) ? (envLang as Lang) : 'nl';

/** Pad (Nederlandse bron-URL) -> pad in de gekozen taal. */
export const pathFor = (nlPath: string, l: Lang): string => (l === 'nl' ? nlPath : slugs[nlPath]?.[l] ?? nlPath);

/** Absoluut adres voor SEO (canonical/hreflang): altijd het productiedomein. */
export const urlFor = (nlPath: string, l: Lang): string => sites[l].origin + pathFor(nlPath, l);

/**
 * Adres voor de taalkiezer. Met STAGING_BASE (bijv. palletrotator.devreugd-pt.nl) wijst de kiezer naar
 * https://<taal>.<base> (NL: https://<base>), zodat testen kan voordat de echte domeinen live staan.
 */
const stagingBase = (typeof process !== 'undefined' && process.env.STAGING_BASE) || '';
export const switchUrl = (nlPath: string, l: Lang): string =>
  stagingBase ? `https://${l === 'nl' ? '' : l + '.'}${stagingBase}${pathFor(nlPath, l)}` : urlFor(nlPath, l);
