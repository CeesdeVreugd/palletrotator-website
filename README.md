# PalletRotator website

Statische marketingsite (Astro) voor de PalletRotator — "Powered by De Vreugd
Productietechniek". Gebouwd volgens het visuele voorstel, met de echte
huisstijlkleuren (`#0A0A96` / `#0080FF`) en het echte De Vreugd-beeldmerk.

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
