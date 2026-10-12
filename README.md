# WebsiteBeheerPortal V1 — losse stack

Eén beveiligd portaal voor al je websites: overzicht en monitoring, opmerkingen op teksten (ook door externe nalezers),
en foto's vervangen zonder de website opnieuw te bouwen. Geen externe afhankelijkheden (alleen Node 20), geen database (JSON-bestanden op een volume).

## Mappen op de pc
`WebsiteBeheerPortal-App\` bevat de versie-mappen (`WebsiteBeheerPortal-V1`, ...) naast de host-/git-map `WebsiteBeheerPortal\`.
Eenmalig, in de host-map: `git init`, `git remote add origin <repo-url>`, `git branch -M main`. Daarna per versie: `Publiceren.cmd` in de versie-map dubbelklikken (kopieert naar de host-map, commit, tagt, pusht).

## Installeren (Portainer)
1. De host-map `WebsiteBeheerPortal` is de eigen Git-repository van het portaal (apart van de website-repository).
2. Portainer → Stacks → Add stack → Repository. Compose path: `docker-compose.yml`.
3. Environment variables (in Portainer, **nooit** in de repo):
   - `PORTAL_ADMIN_PASSWORD` — tijdelijk startwachtwoord (leeg = willekeurig, staat dan in het containerlog). Moet bij eerste inlog worden vervangen.
   - `PORTAL_ADMIN_EMAIL` — standaard cees@devreugd-pt.nl
   - `PORTAL_URL` — bijv. `https://beheer.palletrotator.eu` (voor links in uitnodigingsmails)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` — voor uitnodigingsmails (zonder SMTP kopieer je de uitnodigingslink uit het portaal)
   - optioneel `REQUIRE_2FA` (`all` standaard | `staff`), `PORTAL_ALLOW_IPS` (komma-lijst IP's), `CHECK_INTERVAL_MIN` (15)
4. **Volgorde**: de volumes `portal-media` en `portal-bridge` worden door beide stacks gebruikt (vaste namen). Deploy de website-stack en deze stack in willekeurige volgorde; Docker maakt het volume bij de eerste aan.
5. Nginx Proxy Manager → Proxy Host, bijv. `beheer.palletrotator.eu` → Forward `websitebeheerportal` poort `3200`, SSL aan + Force SSL + HTTP/2. Websockets niet nodig.
   Extra laag (aanbevolen): een NPM Access List of IP-beperking op deze host.

## Eerste keer
Inloggen → nieuw wachtwoord kiezen (min. 12 tekens) → 2FA instellen (authenticator-app; de sleutel staat als tekst en otpauth-link, geen QR) → **10 herstelcodes bewaren**.

## Rollen
- **Beheerder**: alles, ook gebruikers, websites, foto's goedkeuren, opmerkingen accepteren, exports.
- **Redacteur**: overzicht, opmerkingen plaatsen, foto's voorstellen.
- **Nalezer**: alleen teksten lezen en opmerkingen/voorstellen plaatsen — beperkt tot de talen/sites die je aanvinkt.
Gebruikers nodig je uit met een eenmalige link (3 dagen geldig). Ook de uitgenodigde moet 2FA instellen.

## Beveiliging
Verplichte 2FA (TOTP, replay-beveiligd) + herstelcodes; scrypt-wachtwoorden met controle op zwakke wachtwoorden; sessies met 12 u absoluut / 2 u inactief, direct in te trekken; CSRF-header + Origin-controle; strikte CSP en beveiligingskoppen; rate limiting op login/uitnodiging/wachtwoord; TOTP-sleutels versleuteld (AES-256-GCM); foto's worden server-side gecontroleerd (WebP-header, afmetingen) en alleen na goedkeuring live; CSV-exports beschermd tegen formule-injectie; logboek van alle acties; container: non-root, read-only, cap_drop ALL, no-new-privileges, geheugen- en procesbegrenzing, geen gepubliceerde poorten.
Let op: `PORTAL_ALLOW_IPS` vertrouwt `X-Forwarded-For`; dat is veilig zolang alleen NPM het portaal kan bereiken.

## Hoe een website aansluit (contract v1)
De website schrijft naar het volume `portal-bridge` een map `/<id>/` met `manifest.json` (id, naam, doelen/URL's, tekstentalen, fotoplekken met afmetingen en bestandspaden) plus optioneel `nalezen/`, `overrides/`, `baseline/` (originele foto's).
Het portaal ontdekt sites automatisch (manifest-id moet gelijk zijn aan de mapnaam; paden worden gecontroleerd). Goedgekeurde foto's schrijft het portaal naar `portal-media` onder `/<id>/images/...`; de website serveert dat volume eerst en valt terug op de ingebouwde foto's. Een tweede website = zelfde twee volumes + eigen manifest. Sites zonder bridge kun je handmatig toevoegen (alleen monitoring).

## Ontwikkelen / testen
`node test/run.mjs` (138 controles; draait tegen tijdelijke mappen en `test/fixtures/bridge`).
