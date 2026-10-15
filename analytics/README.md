# Cookieloze statistieken (Umami) — V33

Doel: meer inzicht dan de eenvoudige bezoektelling in het portaal (herhaalbezoek, bronnen, apparaten, landen, tijd op de pagina en conversies zoals *brochure-download* en *offerte-aanvraag*), **zonder cookies** en op de eigen server.

## Installeren
1. Portainer → Stacks → nieuwe stack `umami`; plak `docker-compose.yml` uit deze map (of "Stacks from Git" met dit bestand). Zet de variabelen `UMAMI_DB_PASSWORD` en `UMAMI_APP_SECRET` (willekeurig, lang).
2. NPM → Proxy Host, bijvoorbeeld `stats.palletrotator.eu` → `umami:3000`, met SSL. Deze host **niet** achter een Access List zetten (de websites moeten er het script vandaan kunnen laden).
3. Open Umami, log in (standaard `admin` / `umami`) en **wijzig direct het wachtwoord**.
4. Instellingen → Websites → Toevoegen: naam *PalletRotator*, domein `www.palletrotator.nl`. Kopieer het **Website-ID**.
5. Website-stack in Portainer: zet de variabelen `UMAMI_URL` (bijv. `https://stats.palletrotator.eu`) en `UMAMI_ID` (het Website-ID) en doe "Pull and redeploy". De build zet dan het script op alle zes de sites; zonder deze variabelen blijft de site volledig zonder script.
6. Eén Website-ID dekt alle taaldomeinen; in Umami zie je per domein (`www.palletrotator.de`, enz.) en per land wat er gebeurt.

## Gemeten
Paginaweergaven, bezoekers, bronnen/herkomst, apparaat, browser, land, **gebeurtenissen**: `brochure-download` en `offerte-aanvraag` (alleen na een geslaagde verzending). Umami zet geen cookies, bewaart geen IP-adres en herkent bezoekers aan een dagelijks wisselende hash. Het script respecteert "Do Not Track" en meet alleen op de eigen domeinen.

## Privacyverklaring (tekst om toe te voegen)
> **Statistieken.** Wij meten het gebruik van onze websites met Umami, op onze eigen server. Daarbij worden geen cookies geplaatst en worden geen IP-adressen bewaard; er wordt alleen geteld welke pagina's worden bekeken, via welke bron en met welk type apparaat, plus de gebeurtenissen "brochure gedownload" en "offerte aangevraagd". De gegevens zijn niet tot een persoon te herleiden en worden niet met derden gedeeld. Grondslag: gerechtvaardigd belang (inzicht in en verbetering van onze websites).
Laat dit door de eigen privacyverantwoordelijke controleren; de verklaring staat op devreugd-pt.nl.

## Nog niet getest in deze omgeving
De Docker-stack en het script zijn hier niet gedraaid (geen Docker/netwerk). Controleer na het live zetten in Umami (*Realtime*) of je eigen bezoek verschijnt.
