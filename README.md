# PalletRotator website

Statische marketingsite (Astro) voor de PalletRotator — "Powered by De Vreugd
Productietechniek". Gebouwd volgens het visuele voorstel, met de echte
huisstijlkleuren (`#0A0A96` / `#0080FF`) en het echte De Vreugd-beeldmerk.

## V33
- Optionele cookieloze statistieken met Umami (eigen server): stack in `analytics/`, script alleen op de sites als `UMAMI_URL` en `UMAMI_ID` zijn gezet. Gebeurtenissen *brochure-download* en *offerte-aanvraag*. Zie `analytics/README.md` (installatie en privacytekst).

## V32
- Fotobestanden hernoemd naar Engelse, beschrijvende namen (bv. `palletrotator-k11-forklift-approach`, `palletrotator-coldstore`); fotoplekken in `portal-bundle/slots.json` meeveranderd. Een via het portaal vervangen foto onder de oude naam moet opnieuw worden geüpload.
- Alt-teksten van de fotoreeksen bevatten nu het zoekwoord (palletkantelaar / Palettenwender / pallet inverter / retourneur de palettes / ribaltatore di pallet / volteador de palets); vertalingen in `i18n/overrides`.

## V31
- Toepassingen: foto's met ronde hoeken (16 px) en zachtere schaduw.

## V30 — opmerkingen Duitse nalezer
- Brochurepagina: voorpagina per taal (`public/images/brochure-cover-<taal>.webp`, uit de PDF's) in plaats van altijd de Nederlandse.
- EPT-uitleg ("Wat betekent EPT?", component `EptUitleg`) op de EPT- en de specificatiepagina; vertalingen in `i18n/overrides/<taal>.json` (laat door moedertaalsprekers nalezen).
- Toepassingen: kleine landschapsfoto naast elke toepassing.
- Adres overal `Edisonring 11` / `NL-6669 NA, Dodewaard` (niet vertaald).
- "Powered by De Vreugd" (onder het logo, eyebrow, footer) blijft in alle talen origineel (`translate="no"`).
- Topbalk zonder aanhalingstekens in alle talen (override).
- Vast nummer +31 (0)488 412 828 onder elke portretfoto.

## Lokaal testen

```bash
npm install
npm run dev        # http://localhost:4321
```

```bash
npm run build      # bouwt statische site naar ./dist
npm run preview    # preview van de productie-build
```

## Paginastructuur / URL's (strategisch gekozen voor SEO)

| URL | Inhoud | Belangrijkste zoekterm |
|---|---|---|
| `/` | Homepage | palletkantelaar, palletwisselaar |
| `/palletrotator/` | Standaard uitvoering | palletkantelaar heftruck |
| `/palletrotator-ept/` | EPT-uitvoering | palletkantelaar palletwagen |
| `/vrieshuis-palletkantelaar/` | Coldstore-uitvoering | palletkantelaar vrieshuis, freezer spacers |
| `/toepassingen/` | 3 toepassingen (met ankers) | pallet wisselen, kunststof naar hout |
| `/specificaties/` | Volledige vergelijkingstabel | palletkantelaar specificaties |
| `/referenties/` | Klantlogo's + link naar De Vreugd-projecten | — |
| `/over-palletrotator/` | Merkverhaal / Powered by De Vreugd | — |
| `/offerte-aanvragen/` | Offerteformulier + contact | palletkantelaar offerte |

Elke pagina heeft een unieke `<title>`/meta-description met de bijbehorende
zoekterm (zie de `title`/`description` bovenaan elk `.astro`-bestand).
`public/sitemap.xml` is een handgeschreven, statische sitemap met alle 9
pagina's (er zaten compatibiliteitsproblemen tussen `@astrojs/sitemap` en
de gebruikte Astro-versie, die crashte de build — voor 9 vaste pagina's is
een statisch bestand net zo goed en simpeler). Voeg een nieuwe `<url>`-regel
toe in `public/sitemap.xml` als er ooit een pagina bijkomt.

## Nog open (bewust, voor na de eerste versie)

- **Offerteformulier** (`/offerte-aanvragen/`) post nu naar een
  placeholder-endpoint (`https://formspree.io/f/REPLACE_ME`). Vervang dit
  door een echte formulierverwerker (Formspree-account, of een klein eigen
  backend/e-mail-API) voordat de site live gaat.
- **Fotografie**: alle productfoto's staan nu als duidelijke placeholder-
  vlakken ("Foto: ..."). Vervang deze `<div class="media-placeholder">`
  blokken door echte `<img>`'s zodra er fotomateriaal is.
- **Referenties**: klantlogo's staan als tekst-pills; vervang door echte
  logo's/cases zodra beschikbaar (zie `/referenties/`).

---

## Mapstructuur op de PC (zelfde conventie als alle andere apps)

```
PalletRotatorWebsite/
├── palletrotator-website/            ← ROOT: de echte git-werkmap (geen versienummer)
├── palletrotator-website-app-V1/     ← versie-snapshot 1, incl. Publiceren.cmd
├── palletrotator-website-app-V2/     ← volgende versie, incl. Publiceren.cmd
└── ...
```

De map `palletrotator-website` (zonder versienummer) is de root en de
enige map die echt met git/GitHub praat. Elke `-app-V<n>`-map is een
snapshot van de site-bestanden voor die versie, mét een eigen kopie van
`Publiceren.cmd`. Werk je aan een nieuwe versie, maak dan een nieuwe
`-app-V<n+1>`-map (bijv. door de vorige te kopiëren), pas daarin de
bestanden aan, en draai daar `Publiceren.cmd`.

## Stap 1 — Naar Git (eenmalig)

Deze site draait via Portainer's **"Stacks from Git"**, dus eerst naar een
Git-repository (GitHub/GitLab, publiek of privé). Dit gebeurt eenmalig in
de **root-map** `palletrotator-website`:

```bash
cd palletrotator-website
git init
git add .
git commit -m "Initial PalletRotator website"
git branch -M main
git remote add origin <jullie-repo-url>
git push -u origin main
```

Dit hoeft maar één keer. Daarna publiceer je elke volgende wijziging vanuit
een versie-map met `Publiceren.cmd` (zie hieronder).

## Publiceren.cmd — een nieuwe versie pushen

`Publiceren.cmd` staat in elke versie-map (`palletrotator-website-app-V<n>`),
niet in de root. Dubbelklikken volstaat:

1. Het kopieert (via `robocopy /MIR`) alle bestanden uit de versie-map naar
   de root-map `palletrotator-website` (met uitzondering van `.git`,
   `node_modules`, `dist` en het script zelf).
2. Het commit die wijzigingen in de root-map (`git add -A` + `git commit`),
   maakt een git-tag aan met de naam van de versie-map (bijv. `V1`) en pusht
   alles naar `origin`.

Vereist eenmalig: [Git for Windows](https://git-scm.com/download/win)
geïnstalleerd, en de root-map al ingesteld als git-repo met een `origin`
remote (stap 1 hierboven). De versie-map moet als "sibling" naast de
root-map staan (zelfde bovenliggende map).

⚠️ `Publiceren.cmd` pusht alleen de code naar git. Als jullie Portainer-
stack geen automatische git-webhook heeft, moet je daarna nog in
Portainer op **"Pull and redeploy"** klikken (met "Re-pull image" aan)
om de nieuwe versie ook echt live te zetten — het script zegt dit ook
zelf aan het einde.

> **V29:** offerte- en brochureformulier op mobiel hersteld (de formuliervelden gingen buiten het scherm door een kolom te veel; nu één kolom, geen horizontaal scrollen).

> **V28:** het testadres verschijnt alleen nog in het portaal als `STAGING_BASE` is ingesteld. Het staging-domein opheffen? Zie de stappen in de chat/portaal: Proxy Host in NPM verwijderen en het adres in het portaal verwijderen.

## Stap 2 — Staging: `palletrotator.devreugd-pt.nl` (met wachtwoord)

Dit volgt exact hetzelfde patroon als de bestaande Cheese Stock Manager-stack
op jullie VM.

1. **Portainer → Environments → jullie VM → Stacks**
   - Eerst (indien nog niet gedaan voor dit repo) een **Source** aanmaken:
     verwijzing naar de Git-repo van stap 1. Bij een publieke repo:
     Authentication uit, Access Control: Administrators.
   - Nieuwe **Stack**, build-methode "Repository", gekoppeld aan die Source.
     Dit project heeft geen environment variables nodig voor de basisversie.
   - Stack deployen. Container `palletrotator-website` komt op het
     `npm_default`-netwerk (zoals in `docker-compose.yml`), draait op
     interne poort 80.

2. **Nginx Proxy Manager → Proxy Hosts → Add Proxy Host**
   - Domain Names: `palletrotator.devreugd-pt.nl`
   - Forward Hostname/IP: `palletrotator-website`
   - Forward Port: `80`
   - SSL-tab: Let's Encrypt-certificaat aanvragen, **Force SSL** aan.

3. **Wachtwoordbeveiliging (staging)** — dit hoeft niet in de code, NPM
   heeft dit ingebouwd:
   - NPM → **Access Lists** → nieuwe lijst, bijv. "PalletRotator staging".
     Voeg een gebruikersnaam/wachtwoord toe (Authorization-tab).
   - Ga terug naar de Proxy Host `palletrotator.devreugd-pt.nl` → tab
     **Access List** → selecteer deze lijst → Save.
   - Vanaf nu vraagt de browser een gebruikersnaam/wachtwoord voordat de
     staging-site zichtbaar wordt — ideaal om eerst intern te beoordelen
     voordat hij publiek gaat.

⚠️ Controleer voor deze stappen het interne IP van de VM opnieuw met
`hostname -I` op de VM zelf — dit stond in eerdere gesprekken wisselend
genoteerd (192.168.10.102 / 192.168.80.100) en mag niet zomaar worden
overgenomen.

## Stap 3 — Productie: `www.palletrotator.nl`

Zodra de staging-versie is goedgekeurd:

1. **Domein**: registreer `palletrotator.nl` (indien nog niet gedaan) en
   zet de DNS (A-record, of CNAME naar jullie bestaande domeinsetup) naar
   het publieke IP van de VM — dezelfde manier waarop
   `csm-app.beekvreugdkaas.nl` en `devreugd-pt.nl` al wijzen.
2. **`astro.config.mjs`**: pas `site: 'https://www.palletrotator.nl'` aan
   (staat al goed voor productie) — dit bepaalt de canonical-URL's en
   sitemap.
3. **Nginx Proxy Manager**: een **tweede** Proxy Host toevoegen op
   dezelfde container:
   - Domain Names: `www.palletrotator.nl` én `palletrotator.nl`
     (met een redirect van het kale domein naar `www.`, of andersom —
     kies er één als canoniek en redirect de rest, belangrijk voor SEO).
   - Forward Hostname/IP: `palletrotator-website` (dezelfde container — geen
     nieuwe stack nodig, één image bediende straks beide domeinen).
   - Forward Port: `80`
   - SSL: Let's Encrypt + Force SSL.
   - **Geen** Access List op deze Proxy Host — dit is de publieke,
     onbeveiligde productie-ingang.
4. Laat de staging-URL (`palletrotator.devreugd-pt.nl`, met wachtwoord)
   gewoon bestaan als interne review-omgeving voor toekomstige updates,
   of verwijder de Proxy Host als hij niet meer nodig is.

## Stap 4 — Doorklik vanaf devreugd-pt.nl

devreugd-pt.nl draait op WordPress; dat kan ik vanuit deze omgeving niet
zelf aanpassen (geen toegang tot dat CMS). Wat daar handmatig aangepast
moet worden zodra `www.palletrotator.nl` live staat:

- Op de bestaande pagina **`/palletrotator/`** op devreugd-pt.nl: voeg
  een duidelijke call-to-action toe, bijv. een knop
  "Bezoek de PalletRotator-website →" die linkt naar
  `https://www.palletrotator.nl/`.
- Overweeg hetzelfde op de **Machines**-overzichtspagina en in het
  hoofdmenu (`Machines → Palletrotator`).
- Zet op de PalletRotator-site zelf (al gedaan, zie `Header.astro` en
  `Footer.astro`) de omgekeerde link naar `devreugd-pt.nl` — deze
  wederzijdse link helpt ook de SEO-autoriteit te delen tussen beide
  domeinen.

## Docker — losse test (zonder Portainer)

```bash
docker build -t palletrotator-website .
docker run --rm -p 8080:80 palletrotator-website
# open http://localhost:8080
```


## Foto's en video (V9–V16)
- `/palletrotator-ept/`: fotoreeks (`PhotoSequence.astro`) met 4 stappen uit `public/images/foto/` (WebP 800/1600 px).
- `/palletrotator/` en `/palletrotator-ept/`: YouTube-video via `YouTubeEmbed.astro` (klik-om-te-laden, `youtube-nocookie.com`, eigen posterfoto, geen Google-verbinding vóór de klik).
- `VideoObject`-schema wordt pas geplaatst als `uploadDate` aan `YouTubeEmbed` is meegegeven.
- Fotoreeksen staan in `src/data/fotoreeks.ts` (K11 standaard en K13 EPT, 4 stappen met bijschrift). Homepage-hero en `/palletrotator/` tonen de K11-reeks, `/palletrotator-ept/` de K13-reeks. De oude crossfade-animatie en renders zijn verwijderd (V16).

## Referenties (V10)
- Klantlogo's staan transparant in `public/images/klanten/`; de lijst staat in `src/data/klanten.ts`.
- Component `KlantLogos.astro` toont ze als raster op de homepage (onder de hero-uitvoeringen) en groot op `/referenties/`.
- Nieuwe klant toevoegen = logo-PNG in die map + één regel in `klanten.ts`.

## Beeldmerk-uitsnede (V11)
- De grote decoratieve V op de donkere banden is het echte beeldmerk (`public/images/logo-mark-shape.png`), groot en half uit beeld geplaatst als uitsnede (class `title-shape`, `hero-shape`, `vrieshuis-shape`).
- V12: beeldmerk wordt nergens meer gespiegeld (vrieshuis-sectie gecorrigeerd).

## Brochure via Laposta (V13)
- Pagina `/brochure/` (formulier: naam, e-mail, bedrijf + akkoord). Na het versturen start de PDF-download direct.
- Het formulier post naar `/api/brochure`; nginx stuurt dat door naar de aparte container `palletrotator-forms` (map `forms-service/`, Node 20, geen dependencies) die het adres in Laposta-lijst `b12sde1bbp` zet. Veldkoppeling: Naam → `voornaam`, Bedrijfsnaam → `achternaam`.
- **Portainer:** voeg bij de stack de variabele `LAPOSTA_API_KEY` toe (de API-sleutel uit Laposta). Optioneel `LAPOSTA_LIST_ID` (standaard `b12sde1bbp`). De sleutel nooit in de repo zetten.
- Brochures staan in `public/downloads/PalletRotator-brochure-<taal>.pdf` (nu: nl en de; en, fr, it, es, pl volgen met hun taalversie: PDF in die map zetten en de taal toevoegen aan `TALEN` in `forms-service/server.mjs`). Het formulier stuurt `taal` mee; nu alleen `nl`.
- Spambeveiliging: verborgen veld, minimale invultijd en maximaal 5 aanvragen per uur per IP-adres.
- Health-check: `GET /api/health` (zegt of de sleutel is ingesteld).

- V14: EPT-cijfers gelijkgetrokken met de brochure (hoogte klembord 130 mm, klembereik 1250–2500 mm).
- V15: na het versturen van het brochureformulier verdwijnt het formulier nu echt (hidden-attribuut werd door `display:grid` overschreven).


## V17 — WhatsApp-knop en teamportretten

- `src/data/contact.ts`: WhatsApp-nummer (`whatsappNumber`, formaat `31488412828`, leeg = knop verdwijnt) en voorgevulde tekst. `WhatsAppButton.astro` staat in `BaseLayout` en dus op alle pagina's (rechtsonder; op mobiel alleen het icoon).
- `src/data/team.ts` + `TeamPortretten.astro`: blok "Maak kennis met het team" op `/offerte-aanvragen/` (Wim de Vreugd, Bert van Lankeren, Cees de Vreugd), foto's in `public/images/team/` (400/800 px WebP). Duitse functietitels staan al in `team.ts` (`functieDe`) voor de DE-versie.

## V18 — taalafhankelijke WhatsApp-knop en teamblok

- `src/data/contact.ts` bevat per taal (`nl`, `de`) knoptekst, toegankelijkheidslabel en voorgevulde WhatsApp-tekst (DE: "Guten Tag, ich habe eine Frage zum PalletRotator.", Sie-vorm). `BaseLayout` krijgt een `lang`-prop (standaard `nl`; zet ook `<html lang>` en `og:locale`) en geeft die door aan `WhatsAppButton`. `TeamPortretten` accepteert `lang` en toont dan de Duitse functietitels en tekst. Nieuwe talen: type `Lang` en teksten uitbreiden.

## V19/V20 — offerte-aanvraag per e-mail

- `/offerte-aanvragen/` post naar `/api/offerte` (zelfde `palletrotator-forms`-container). De service mailt de aanvraag via SMTP (`forms-service/smtp.mjs`, geen dependencies; STARTTLS op 587 of TLS op 465) naar `MAIL_TO` (standaard **sales@devreugd-pt.nl**, sinds V20), met Reply-To = aanvrager. Telefoon is verplicht. Optioneel vinkje 'Houd mij op de hoogte' zet het adres alleen met toestemming in Laposta-lijst `b12sde1bbp`.
- Portainer-variabelen: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` bij 465), `SMTP_USER`, `SMTP_PASS`, optioneel `MAIL_FROM`, `MAIL_TO`. `GET /api/health` toont `mailConfigured`. Spambeveiliging als bij de brochure (honeypot, 2,5 s, 5/uur/IP).
- Teamportretten in staand 3:2-formaat met telefoon en e-mail per persoon (`src/data/team.ts`).

### SMTP-instellingen (live, STH)

- `SMTP_HOST` moet de naam uit het certificaat zijn (`mail1.sth.host`), niet de MX-naam (`mx1.sth.nl`: certificaatfout). Poort 587 met `SMTP_SECURE=false` (STARTTLS); alternatief 465 met `SMTP_SECURE=true`.
- `MAIL_FROM` moet een afzender zijn die de server kent. info@palletrotator.nl gaf `451 unable to verify sender` zolang dat postvak/maildomein bij STH niet bestond; tijdelijk een bestaand devreugd-pt.nl-adres gebruiken. Zodra palletrotator.nl als maildomein staat (postvak, MX, SPF, DKIM): `MAIL_FROM` terugzetten op info@palletrotator.nl.
- Na elke variabelewijziging in Portainer: **Update the stack**.

## V21 — opgemaakte aanvraagmail

- De offertemail is een HTML-mail (navy kop, contactgegevens, aanvraag, opmerking, knoppen "Beantwoorden" en "Bel") met platte-tekst-versie als terugval. Opmaak in `forms-service/mail-template.mjs` (tabellen en inline CSS, werkt in Outlook/Gmail/Apple Mail; geen externe afbeeldingen). Alle invoer wordt ge-escaped.

## V22 — zes talen (NL, DE, EN, FR, IT, ES)

### Hoe het werkt

- **Eén broncode, één container, meerdere domeinen.** De Dockerfile bouwt de site zes keer (`SITE_LANG=nl|de|en|fr|it|es`) en vertaalt de niet-Nederlandse versies met het vertaalgeheugen. Nginx kiest de taal op basis van het domein (`map $host $site` in `nginx.conf`). Eén stack, één rollout in Portainer. De formulier-service blijft één container voor alle talen.
- **Vertaling**: `i18n/translate.mjs` haalt alle Nederlandse teksten uit de gebouwde site, vertaalt ze met DeepL (glossarium per taal, "PalletRotator" en "EPT" blijven staan) en bewaart ze in `i18n/memory/<taal>.json`. Bestaande vertalingen worden nooit overschreven. `i18n/localize.mjs` past het geheugen bij elke build toe, zet de taalspecifieke URL's (`i18n/slugs.json`), de sitemap met hreflang en de contactadressen (`i18n/sites.json`).
- **Handgeschreven SEO-teksten (Duits)**: titels en meta-beschrijvingen van alle pagina's en de functietitels van het team staan in `i18n/overrides/de.json` en gaan voor op DeepL.
- Ontbreekt een vertaling, dan blijft die tekst Nederlands en toont de build een waarschuwing (`[i18n] de: 410/412 segmenten vertaald, 2 ontbreken`). Met `I18N_STRICT=1` faalt de build in dat geval.

### Domeinen en Nginx Proxy Manager

| Taal | Domein (productie) | Pad-voorbeeld |
|---|---|---|
| NL | www.palletrotator.nl | /palletrotator/ |
| DE | www.palletrotator.de | /palettenwender/ |
| EN | www.palletrotator.eu | /pallet-inverter/ |
| FR | www.palletrotator.fr | /retourneur-de-palettes/ |
| IT | www.palletrotator.it | /ribaltatore-di-pallet/ |
| ES | www.palletrotator.es | /volteador-de-palets/ |

Welk domein bij welke taal hoort staat in `i18n/sites.json` (en in `nginx.conf` en `forms-service/texts.mjs`; houd die drie gelijk). EN staat op `.eu` (Brits Engels); `.co.uk` verwijst door.

**Proxy Hosts** (NPM, per taal één): Domain Names = `palletrotator.<tld>` en `www.palletrotator.<tld>`, Scheme `http`, Forward Hostname `palletrotator-website`, Port `80`, SSL: eigen Let's Encrypt-certificaat + Force SSL. Alle talen wijzen naar dezelfde container.

**Redirection Hosts** (zonder container, 301, "Preserve Path" uit): `.at` en `.ch` naar https://www.palletrotator.de, `.be` naar https://www.palletrotator.nl, `.co.uk` naar https://www.palletrotator.eu. Apex zonder www naar www.

**DNS**: laat alle domeinen (A-record, en www) naar hetzelfde IP wijzen als palletrotator.nl.

### Testen op subdomeinen (voordat de domeinen live gaan)

Zet in de Portainer-stack de variabele `STAGING_BASE=palletrotator.devreugd-pt.nl` en maak in NPM Proxy Hosts voor `de.palletrotator.devreugd-pt.nl`, `en.…`, `fr.…`, `it.…`, `es.…` (zelfde bestemming). De taalkiezer wijst dan naar die subdomeinen. Voor productie de variabele leeg laten. Canonical- en hreflang-tags wijzen altijd naar de productiedomeinen.

### Vertalen: eerste keer en bij wijzigingen

1. Pak de versie uit naast de map `PalletRotatorWebsite`, voer `Publiceren.cmd` uit (code in git; `i18n\memory` en `i18n\nalezen` in de root blijven behouden).
2. Voer `Vertalen.cmd` uit. Vereist Node.js (LTS). De DeepL-sleutel wordt gevraagd en nergens opgeslagen. Het script bouwt de Nederlandse site, vertaalt wat nog ontbreekt, schrijft het geheugen en de nalezen-bestanden en pusht dat naar git. `Vertalen.cmd --lang de` doet één taal.
3. Portainer: stack **Pull and redeploy**.
4. Nederlandse tekst gewijzigd? Opnieuw `Publiceren.cmd` en `Vertalen.cmd`: alleen nieuwe of gewijzigde zinnen worden vertaald. `node i18n/translate.mjs --prune` ruimt verouderde regels op.

### Nalezen door een native speaker

`i18n\nalezen\<taal>.csv` (UTF-8, puntkomma-gescheiden, opent in Excel): kolommen Pagina, Nederlands, de vertaling, Bron. Alleen de vertaalkolom aanpassen. Tekens als `{1}…{/1}` zijn opmaak (bijvoorbeeld een link of vet): laten staan, wel mag de plek in de zin verschuiven. Terugzetten: `Vertalen.cmd --import nalezen\de.csv --lang de`, daarna Pull and redeploy. Regels waarvan de `{n}`-tekens niet kloppen worden overgeslagen en gemeld.

Zoektermen die als uitgangspunt zijn gebruikt (glossarium in `i18n/glossary/<taal>.tsv`): DE Palettenwender (alternatieven Palettenwechsler/Palettenkipper/Palettendreher), EN pallet inverter (pallet changer/exchanger), FR retourneur de palettes (basculeur/changeur de palettes), IT ribaltatore di pallet, ES volteador de palets. Alleen het Duits is uitgebreid onderzocht; laat de overige talen door een native speaker controleren.

### E-mail, formulieren en Laposta

- Formulieren sturen `taal` mee. Foutmeldingen, de bevestigingsmail aan de aanvrager (zonder vrije invoer, naam alleen als die er als naam uitziet) en de brochure-PDF volgen die taal. `CONFIRM_MAIL=false` zet de bevestiging uit.
- Offertemail naar sales krijgt altijd Nederlands, met `[DE]` enzovoort in het onderwerp en de taal/site in de mail.
- Antwoordadres in de bevestiging en e-mailadres op de site per taal (V23): info@palletrotator.nl (NL), .de (DE), .eu (EN), .fr (FR), .it (IT), .es (ES); zie `SITE` in `forms-service/texts.mjs`, `i18n/sites.json` en `mail` in `src/data/formtext.ts`. Deze postvakken moeten bestaan (of doorsturen naar info@palletrotator.nl).
- Laposta: per taal optioneel een eigen lijst (`LAPOSTA_LIST_ID_DE`, `_EN`, `_FR`, `_IT`, `_ES`), met dezelfde velden (voornaam, achternaam) en een bevestigingsmail in die taal. Niet ingesteld = standaardlijst `LAPOSTA_LIST_ID`.
- Brochures: `public/downloads/PalletRotator-brochure-<taal>.pdf`. Ontbreekt een taal, dan serveert nginx de Engelse versie.

### Overzicht nieuwe bestanden

`i18n/` (sites.json, slugs.json, dnt.json, html.mjs, lib.mjs, translate.mjs, localize.mjs, build-all.mjs, glossary/, overrides/, memory/, nalezen/), `src/data/i18n.ts`, `src/data/formtext.ts`, `src/components/LanguageSwitch.astro`, `forms-service/texts.mjs`, `Vertalen.cmd`.


## V23

- Fotoreeks: het bijschrift vult nu de volle hoogte van de slide, zodat onder een kort bijschrift (zoals in het Engels) geen lichte rand meer zichtbaar is (`PhotoSequence.astro`).
- Elke taalsite toont het eigen e-mailadres (info@palletrotator.<tld>) op de site, in formuliermeldingen en in de bevestigingsmail.
- `i18n/translate.mjs`: werkt met DeepL Free (maar 1 glossarium tegelijk; wordt per taal aangemaakt en weer verwijderd).
- Let op: de brochures IT en ES (`public/downloads/PalletRotator-brochure-it.pdf` en `-es.pdf`) zitten niet in deze zip. Kopieer ze uit de map van V22 naar `public\downloads` van deze map voordat u Publiceren.cmd draait.

## V24

- Taalkiezer met vlaggen (NL, DE, EN = Britse vlag, FR, IT, ES) als inline SVG in `src/components/Flag.astro`; de vlag staat voor de taal, niet voor het domein. Op mobiel staat de taalkiezer in het menu.

## V25/V26 — aansluiting op de WebsiteBeheerPortal
De WebsiteBeheerPortal is een **losse stack** (eigen repository, map `WebsiteBeheerPortal-V1`). Deze website sluit er via twee gedeelde Docker-volumes met vaste namen op aan:
- `portal-bridge` — bij het opstarten schrijft de website `/bridge/palletrotator/` (manifest.json met doelen, tekstentalen en 12 fotoplekken, plus `nalezen/`, `overrides/`, `baseline/`). Gebouwd door `portal-bundle/make.mjs`, gekopieerd door `portal-bundle/45-portal-bundle.sh`.
- `portal-media` — hier zet het portaal goedgekeurde foto's. nginx serveert `/images/foto/` en `/images/team/` eerst vanaf dit volume (`/usr/share/nginx/media/palletrotator`, 5 min cache) en valt terug op de ingebouwde foto's.
Zonder portaal werkt de site gewoon (volumes zijn dan leeg).

**Vrieshuis-foto**: de pagina `vrieshuis-palletkantelaar` en de homepage tonen de foto `palletrotator-vrieshuis-{800,1600}.webp` zodra die bestaat; upload hem via het portaal (fotoplek "Vrieshuis"). Tot die tijd blijft de placeholder zichtbaar.

Deploy: eerst deze stack opnieuw (maakt de volumes aan), daarna de portaalstack; de volgorde maakt niet uit.

V26: alleen hernoeming — het portaal heet nu **WebsiteBeheerPortal** (stack/container `websitebeheerportal`, map `WebsiteBeheerPortal-V1`). Volumes `portal-bridge` en `portal-media` blijven ongewijzigd.

## V27 — bezoeken zichtbaar in de WebsiteBeheerPortal
De website legt per bekeken HTML-pagina één regel vast in `/bridge/_visits/palletrotator/JJJJ-MM-DD.log` (volume `portal-bridge`); de WebsiteBeheerPortal toont dit onder **Bezoeken** (bezoekers, paginaweergaven, populaire pagina's, herkomst, per taalsite, 404's).
- **Privacy**: geen cookies, geen scripts. Het IP-adres wordt in nginx geanonimiseerd vóór het wordt weggeschreven (IPv4 laatste deel weg, IPv6 alleen eerste drie blokken), van de herkomst blijft alleen het domein over, bestanden ouder dan 90 dagen worden bij het opstarten verwijderd. Noem dit in de privacyverklaring ("anonieme serverlogs voor statistiek, 90 dagen").
- Gebruikt `nginx.conf` (maps + `log_format visits`) en `portal-bundle/46-visits-dir.sh`. Zonder portaalvolume werkt de site gewoon (alleen een melding in het nginx-foutlogboek).
- De Docker-healthcheck en de websitevoorbeelden van het portaal worden niet meegeteld; robots worden in het portaal apart geteld.
