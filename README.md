# DCRAMERE Voeding

Voedingsplan-app voor cliënten met coachdashboard. Cliënten volgen een intake, voeren wekelijks hun gewicht en een check-in in, en krijgen een persoonlijk menu met recepten, een boodschappenlijst en een PDF in de DCRAMERE-huisstijl. Cliënten maken elke 4 weken progressiefoto's (voor, achter, zijkant), met een herinnering in de app. De coach beheert cliënten, metingen (incl. huidplooien), check-ins, progressiefoto's, intake, profielen en notities.

Live: https://dcramere-voeding.dcramere.workers.dev · Coach: `/coach/`

## Stack

- **Cloudflare Worker** (`src/worker.js`): API onder `/api/*`, serveert daarnaast `public/` als static assets. Zodra de coach het dashboard opent en de laatste back-up ouder is dan 7 dagen, schrijft de Worker op de achtergrond een volledige back-up naar KV (`BACKUPS`, 60 dagen bewaard). Een cron-trigger is niet mogelijk, omdat de 5 gratis cron-slots van het account al in gebruik zijn; de `scheduled`-handler bestaat nog voor als er een slot vrijkomt.
- **D1** (SQLite): schema in `migrations/`.
- **R2** (`dcramere-voeding-fotos`, privé): progressiefoto's onder `c/<client_id>/…`. De foto's worden alleen via de Worker geserveerd na een check van de sessie (cliënt: eigen foto's, coach: eigen cliënten). De app verkleint ze vóór het uploaden tot max. 1600 px; via canvas verdwijnt de EXIF, dus ook de GPS-locatie. De server controleert type (JPEG/WebP, op de bytes) en grootte (max. 5 MB).
- **Frontend**: plain HTML/JS, geen build. `public/core.js` bevat de berekeningen, de menu-optimalisatie, de boodschappenlijst en het PDF-document. Dit bestand wordt gedeeld door de cliënt-app (`/`) en het dashboard (`/coach/`).
- **Huisstijl**: Cinzel + Overpass (zelf gehost in `public/fonts/`), zwart/goud `#f4d03f`, logo in `public/img/`.

## Menugenerator

De keuze van de producten per maaltijd rouleert via `seed` en de wissel-offsets. De porties voor een hele dag worden samen opgelost: een gewogen kleinste-kwadratenoplossing op kcal, eiwit, koolhydraten en vet, plus de verdeling van calorieën en eiwit over de maaltijden, binnen realistische minimum- en maximumporties. Daarna wordt afgerond op echte eenheden (eieren, sneetjes, per 5 g) en volgt een greedy correctie. `npm run fit` toont hoe goed de menu's aansluiten over een set testprofielen.

## Accounts

- **Coach**: eenmalig aangemaakt via `/coach/` met de `SETUP_CODE`-secret. Daarna is setup uitgeschakeld.
- **Cliënt**: de coach maakt de cliënt aan en krijgt een uitnodigingslink (14 dagen geldig, eenmalig). De cliënt kiest daarmee een wachtwoord en geeft privacytoestemming. Bij een vergeten wachtwoord maakt de coach een nieuwe link; zonder eigen domein wordt er geen e-mail verstuurd.
- Wachtwoorden: PBKDF2-SHA256 (100k). Sessies: HttpOnly-cookies, 30 dagen. Na 8 mislukte pogingen volgt een lockout van 15 minuten per IP en per account.

## Ontwikkelen

```bash
npm install
npm run db:migrate:local
echo "SETUP_CODE=$(openssl rand -hex 8)" > .dev.vars
npm run dev            # http://localhost:8787 en /coach/
npm test               # unit- en API-tests (start zelf een tijdelijke wrangler dev)
```

## Deployen

```bash
npm run db:migrate     # alleen bij nieuwe migraties
npm run deploy         # draait eerst de tests
```

## Back-ups

- Het dashboard heeft de knop **Back-up downloaden**, die alle gegevens als JSON exporteert, zonder wachtwoorden. Foto's staan daar niet in; die blijven in R2.
- Een wekelijkse snapshot (gemaakt bij een bezoek aan het dashboard) staat in KV onder `backup/JJJJ-MM-DD.json`. Ophalen gaat zo:
  ```bash
  npx wrangler kv key get --binding BACKUPS --remote "backup/2026-10-04.json" > backup.json
  ```
- D1 heeft daarnaast 30 dagen Time Travel: `npx wrangler d1 time-travel restore dcramere-voeding --timestamp=...`.
