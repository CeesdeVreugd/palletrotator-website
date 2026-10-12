// Centrale contactgegevens. Vul het WhatsApp-nummer in internationaal formaat in,
// zonder + en zonder spaties (bijv. '31612345678'). Leeg = knop wordt niet getoond.
export const whatsappNumber = '31488412828';
export const whatsappText = 'Hallo, ik heb een vraag over de PalletRotator.';
export const whatsappUrl = whatsappNumber
  ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappText)}`
  : '';
