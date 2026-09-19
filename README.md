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

> Let op: dit is uitgeschreven maar in deze sessie niet kunnen builden —
> de sandbox had op dat moment geen toegang tot de npm-registry
> (netwerkbeleid van deze omgeving, niet van jullie VM). Draai
> `npm install && npm run build` als eerste check zodra je de code lokaal
> of in Portainer bouwt; een typefout in een pagina komt daar direct naar
> boven.

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
`sitemap-index.xml` wordt automatisch gegenereerd door `@astrojs/sitemap`
op basis van `site` in `astro.config.mjs` — pas dat adres aan zodra het
definitieve domein vaststaat (zie stap 3 hieronder).

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

## Stap 1 — Naar Git (eenmalig)

Deze site draait via Portainer's **"Stacks from Git"**, dus eerst naar een
Git-repository (GitHub/GitLab, publiek of privé):

```bash
cd palletrotator-website
git init
git add .
git commit -m "Initial PalletRotator website"
git branch -M main
git remote add origin <jullie-repo-url>
git push -u origin main
```

Dit hoeft maar één keer. Daarna publiceer je elke volgende wijziging met
`Publiceren.cmd` (zie hieronder) — die commit, tagt en pusht in één klik.

## Publiceren.cmd — een nieuwe versie pushen

In deze map staat `Publiceren.cmd` (Windows). Dubbelklikken volstaat:

1. Het leest het bestand `VERSION` (start op `1`) en gebruikt dat als
   versienummer, bijv. **V1**.
2. Het commit alle wijzigingen (`git add -A` + `git commit`), maakt een
   git-tag `V1` aan en pusht alles naar `origin`.
3. Het hoogt `VERSION` daarna automatisch op (naar `2`), zodat de
   eerstvolgende keer dat je het script draait automatisch **V2** wordt,
   enzovoort — je hoeft daar zelf niets voor bij te houden.

Vereist eenmalig: [Git for Windows](https://git-scm.com/download/win)
geïnstalleerd, en deze map al ingesteld als git-repo met een `origin`
remote (stap 1 hierboven).

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
   - Stack deployen. Container `palletrotator-app` komt op het
     `npm_default`-netwerk (zoals in `docker-compose.yml`), draait op
     interne poort 80.

2. **Nginx Proxy Manager → Proxy Hosts → Add Proxy Host**
   - Domain Names: `palletrotator.devreugd-pt.nl`
   - Forward Hostname/IP: `palletrotator-app`
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
   - Forward Hostname/IP: `palletrotator-app` (dezelfde container — geen
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
docker build -t palletrotator-app .
docker run --rm -p 8080:80 palletrotator-app
# open http://localhost:8080
```
