// HTML-opmaak voor de offerte-aanvraagmail (tabel-layout en inline CSS: werkt in Outlook, Gmail, Apple Mail).
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function offerteHtml({ naam, bedrijf, telefoon, email, model, aantal, temperatuur, opmerking, nieuwsbrief, taal }) {
  const row = (label, value) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #E3E6F3;width:38%;font-size:13px;color:#5B6390;vertical-align:top;">${esc(label)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E3E6F3;font-size:15px;color:#1B2144;font-weight:600;vertical-align:top;">${value}</td>
      </tr>`;
  const tel = telefoon.replace(/[^+\d]/g, '');
  const btn = (href, label, bg, color, border) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;margin:0 8px 8px 0;border-radius:24px;background:${bg};color:${color};border:2px solid ${border};font-size:14px;font-weight:700;text-decoration:none;">${esc(label)}</a>`;
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nieuwe offerte-aanvraag</title></head>
<body style="margin:0;padding:0;background:#F5F7FD;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Offerte-aanvraag van ${esc(naam)}${bedrijf ? ' (' + esc(bedrijf) + ')' : ''}: ${esc(model)}, ${esc(aantal)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FD;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E3E6F3;">
    <tr><td style="background:#0A0A96;padding:26px 32px;">
      <div style="font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:.2px;">PalletRotator</div>
      <div style="font-size:12px;color:#B9C8FF;margin-top:4px;">Powered by De Vreugd Productietechniek</div>
    </td></tr>
    <tr><td style="padding:30px 32px 8px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#0080FF;">Nieuwe offerte-aanvraag</div>
      <h1 style="margin:8px 0 6px;font-size:24px;line-height:1.25;color:#0A0A96;">${esc(naam)}${bedrijf ? ' <span style="color:#5B6390;font-weight:400;">&middot; ' + esc(bedrijf) + '</span>' : ''}</h1>
      <p style="margin:0;font-size:14px;color:#5B6390;">Via het formulier op palletrotator.nl. Antwoorden kan direct op deze mail.</p>
    </td></tr>
    <tr><td style="padding:12px 32px 4px;">
      <div style="font-size:13px;font-weight:700;color:#0A0A96;margin:14px 0 2px;">Contactgegevens</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Taal / site', esc(taal || 'NL'))}
        ${row('Naam', esc(naam))}
        ${row('Bedrijf', bedrijf ? esc(bedrijf) : '-')}
        ${row('Telefoon', `<a href="tel:${esc(tel)}" style="color:#0080FF;text-decoration:none;">${esc(telefoon)}</a>`)}
        ${row('E-mail', `<a href="mailto:${esc(email)}" style="color:#0080FF;text-decoration:none;">${esc(email)}</a>`)}
      </table>
      <div style="font-size:13px;font-weight:700;color:#0A0A96;margin:22px 0 2px;">Aanvraag</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row('Model', esc(model))}
        ${row('Aantal', esc(aantal))}
        ${row('Temperatuur', esc(temperatuur))}
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px 6px;">
      <div style="font-size:13px;font-weight:700;color:#0A0A96;margin-bottom:8px;">Opmerking / vraag om demonstratie</div>
      <div style="background:#F5F7FD;border-left:4px solid #0080FF;border-radius:6px;padding:14px 16px;font-size:14px;line-height:1.6;color:#1B2144;white-space:pre-wrap;">${opmerking ? esc(opmerking) : '<span style="color:#7B84AD;">Geen opmerking</span>'}</div>
    </td></tr>
    <tr><td style="padding:22px 32px 8px;">
      ${btn('mailto:' + email, 'Beantwoorden per e-mail', '#0080FF', '#FFFFFF', '#0080FF')}${btn('tel:' + tel, 'Bel ' + telefoon, '#FFFFFF', '#0A0A96', '#C9CEE6')}
    </td></tr>
    <tr><td style="padding:14px 32px 28px;">
      <div style="font-size:12px;color:#7B84AD;line-height:1.6;">Nieuwsbrief-toestemming: <strong>${nieuwsbrief ? 'ja, toegevoegd aan Laposta' : 'nee'}</strong></div>
    </td></tr>
    <tr><td style="background:#F5F7FD;padding:16px 32px;font-size:11px;color:#7B84AD;">Automatisch verstuurd door de PalletRotator-website. De gegevens zijn alleen bedoeld om deze aanvraag te beantwoorden.</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}
