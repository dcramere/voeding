# DCRAMERE Voeding

Voedingsplan-app voor cliënten met coachdashboard. Cliënten voeren hun gewicht in; de app berekent calorieën, macro's en een dagmenu. De coach beheert cliënten, metingen (incl. huidplooien), profielen en notities.

## Stack

- **Cloudflare Worker** (`src/worker.js`): API onder `/api/*`, serveert daarnaast `public/` als static assets.
- **D1** (SQLite): `migrations/`.
- **Frontend**: plain HTML/JS, geen build. `public/core.js` bevat de berekeningen en de menugenerator, gedeeld door de cliënt-app (`/`) en het dashboard (`/coach/`).

## Accounts

- **Coach**: eenmalig aangemaakt via `/coach/` met de `SETUP_CODE`-secret. Daarna is setup uitgeschakeld.
- **Cliënt**: de coach maakt de cliënt aan en krijgt een uitnodigingslink (14 dagen geldig, eenmalig). De cliënt kiest daarmee een wachtwoord. Bij een vergeten wachtwoord maakt de coach een nieuwe link.
- Wachtwoorden: PBKDF2-SHA256 (100k). Sessies: HttpOnly-cookies, 30 dagen. Na 8 mislukte pogingen volgt een lockout van 15 minuten per IP en per account.

## Ontwikkelen

```bash
npm install
npm run db:migrate:local
echo "SETUP_CODE=$(openssl rand -hex 8)" > .dev.vars
npm run dev            # http://localhost:8787 en /coach/
```

## Deployen

```bash
npm run db:migrate     # alleen bij nieuwe migraties
npm run deploy
```
