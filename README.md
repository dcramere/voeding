# DCRAMERE Coaching (voeding + training)

Voedingsplan-app voor cliënten met coachdashboard. Cliënten volgen een intake, voeren wekelijks hun gewicht en een check-in in, en krijgen een persoonlijk menu met recepten, een boodschappenlijst en een PDF in de DCRAMERE-huisstijl. Daarnaast is er een trainingsprogramma van 12 weken (Push/Pull/Legs, 6 dagen per week, met de fasen Fundament → Opbouw → Intensiteit → Deload). Cliënten loggen daarin per set het gewicht en de herhalingen, met 'vorige keer', een suggestie om het gewicht te verhogen, een rusttimer en records. Cliënten maken elke 4 weken progressiefoto's (voor, achter, zijkant), met een herinnering in de app. De coach beheert cliënten, metingen (incl. huidplooien), check-ins, progressiefoto's, intake, profielen en notities.

Live: https://dcramere-voeding.dcramere.workers.dev · Coach: `/coach/`

## Stack

- **Cloudflare Worker** (`src/worker.js`): API onder `/api/*`, serveert daarnaast `public/` als static assets. Zodra de coach het dashboard opent en de laatste back-up ouder is dan 7 dagen, schrijft de Worker op de achtergrond een volledige back-up naar KV (`BACKUPS`, 60 dagen bewaard). Een cron-trigger is niet mogelijk, omdat de 5 gratis cron-slots van het account al in gebruik zijn; de `scheduled`-handler bestaat nog voor als er een slot vrijkomt.
- **D1** (SQLite): schema in `migrations/`.
- **R2** (`dcramere-voeding-fotos`, privé): progressiefoto's onder `c/<client_id>/…`. De foto's worden alleen via de Worker geserveerd na een check van de sessie (cliënt: eigen foto's, coach: eigen cliënten). De app verkleint ze vóór het uploaden tot max. 1600 px; via canvas verdwijnt de EXIF, dus ook de GPS-locatie. De server controleert type (JPEG/WebP, op de bytes) en grootte (max. 5 MB).
- **Training**: `public/training.js` bevat de programma's, de oefeningen (met Nederlandse techniekcue, rusttijd en spiergroepen), de body-map-pictogrammen en de log-analyse. De programma-id's die de coach kan toewijzen staan ook in `PROGRAMMAS` in `src/worker.js`. Een sessie is één rij in `workouts`, met de sets als gevalideerde JSON.
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

## Contact, controle en beheer (sinds 30 sep 2026)

- **Chat en feedback**: berichten tussen coach en cliënt (met foto's) staan in de tabel `berichten`. De coach kan per check-in reageren (`checkin_id`).
- **Pushmeldingen**: via web push (VAPID). Het pushbericht zelf is leeg; de service worker `public/sw.js` haalt de tekst op via `/api/push/pending`, met de sessie van de gebruiker. Nodig: `VAPID_PUBLIC` (in de config) en de secret `VAPID_PRIVATE_JWK`.
- **Herinneringen**: de Durable Object `Scheduler` zet elk uur een alarm, zonder cron-slot. Om 12:00 UTC gaan de check-in- en fotoherinneringen uit; elk uur wordt de back-up gecontroleerd.
- **Coach-controle**:
  - handmatig dagdoel per cliënt (`clients.doelen`, komt als `profiel.override` in de app terecht);
  - eigen trainingsprogramma's (`programmas`, id `c<n>`). Houd de bibliotheek van oefeningen in `src/worker.js` (`BASE_EX`) gelijk aan die in `public/training.js`; daar is een test voor.
  - branding per coach (`coaches.merk`);
  - een voorbeeldcliënt via `POST /api/coach/demo`.
- **Self-service**: cliënten kunnen hun gegevens downloaden (`/api/account/export`) en hun account verwijderen. Een lopend Stripe-abonnement wordt daarbij stopgezet.
- **Monitoring**: serverfouten komen in `fouten` terecht, met een push naar de eigenaar (maximaal één per uur). Het overzicht staat onder Coaches → Systeem. Een uptime-check is beschikbaar op `GET /api/health`.
- Tests: `TEST_SERVER_LOG=pad npm test` schrijft de log van de testserver weg.

## Talen (nl / en / pt / es)

Nederlands is de brontekst. `public/i18n.js` kiest de taal (`?lang=` → eigen keuze → browsertaal → nl), laadt `public/i18n/<taal>.json`, vertaalt de statische HTML en start pas daarna de paginascripts. Dynamische tekst gaat via `T("Nederlandse tekst", {vars})`, `Tn(n, "1 …", "{n} …")` of `N_("…")` (opslaan als bron, vertalen bij tonen). De Worker gebruikt dezelfde JSON-bestanden (`src/i18n.js`) voor foutmeldingen, de coachwinkel en pushmeldingen (in de taal van het account, `clients.taal` / `coaches.taal`).

Nieuwe tekst toevoegen: schrijf hem in het Nederlands in `T(…)`, draai `node scripts/i18n-keys.mjs --list` voor wat nog ontbreekt, en voeg de vertalingen toe aan de drie JSON-bestanden (of via `python3 scripts/i18n-merge.py batch.json` met `{nl: [en, pt, es]}`). `test/i18n.test.mjs` faalt zolang er iets onvertaald is of placeholders/markup niet kloppen.

## Coaches laten betalen door hun cliënten (Stripe Connect)

Coaches koppelen onder Instellingen hun eigen Stripe-account (Express, ook buitenlandse bankrekeningen) en stellen een maandprijs in. Cliënten betalen dan in de app (coach zet "Laten betalen via de app" aan) of via "Direct starten" op de winkelpagina. Het abonnement staat op het platformaccount; elke betaling wordt doorgestuurd naar de coach (destination charges), min `CONNECT_FEE_PERCENT` (standaard 0) voor het platform. `CONNECT_PLATFORM_COUNTRY` (standaard US) is het land van het platformaccount; coaches in andere landen krijgen de "recipient"-overeenkomst.

Eenmalig in het Stripe-dashboard: **Connect → Get started** (platformprofiel invullen, Express kiezen). Zolang dat niet is gedaan, meldt de app aan coaches dat uitbetalen nog niet is geactiveerd.
