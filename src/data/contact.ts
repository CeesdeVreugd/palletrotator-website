// Centrale contactgegevens. WhatsApp-nummer internationaal, zonder + en spaties.
// Leeg = knop wordt niet getoond.
export const whatsappNumber = '31488412828';

export type Lang = 'nl' | 'de';

export const whatsappTexts: Record<Lang, { label: string; aria: string; prefill: string }> = {
  nl: {
    label: 'WhatsApp',
    aria: 'Stuur ons een bericht via WhatsApp',
    prefill: 'Hallo, ik heb een vraag over de PalletRotator.',
  },
  de: {
    label: 'WhatsApp',
    aria: 'Schreiben Sie uns über WhatsApp',
    prefill: 'Guten Tag, ich habe eine Frage zum PalletRotator.',
  },
};

export function whatsappUrl(lang: Lang = 'nl'): string {
  if (!whatsappNumber) return '';
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappTexts[lang].prefill)}`;
}
