// Centrale contactgegevens. WhatsApp-nummer internationaal, zonder + en spaties.
// Leeg = knop wordt niet getoond.
export const whatsappNumber = '31488412828';

export type WaLang = 'nl' | 'de' | 'en' | 'fr' | 'it' | 'es';

export const whatsappTexts: Record<WaLang, { label: string; aria: string; prefill: string }> = {
  nl: { label: 'WhatsApp', aria: 'Stuur ons een bericht via WhatsApp', prefill: 'Hallo, ik heb een vraag over de PalletRotator.' },
  de: { label: 'WhatsApp', aria: 'Schreiben Sie uns über WhatsApp', prefill: 'Guten Tag, ich habe eine Frage zum PalletRotator.' },
  en: { label: 'WhatsApp', aria: 'Message us on WhatsApp', prefill: 'Hello, I have a question about the PalletRotator.' },
  fr: { label: 'WhatsApp', aria: 'Écrivez-nous sur WhatsApp', prefill: "Bonjour, j'ai une question concernant le PalletRotator." },
  it: { label: 'WhatsApp', aria: 'Scriveteci su WhatsApp', prefill: 'Buongiorno, ho una domanda sul PalletRotator.' },
  es: { label: 'WhatsApp', aria: 'Escríbanos por WhatsApp', prefill: 'Hola, tengo una pregunta sobre el PalletRotator.' },
};

export function whatsappUrl(lang: WaLang = 'nl'): string {
  if (!whatsappNumber) return '';
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappTexts[lang].prefill)}`;
}
