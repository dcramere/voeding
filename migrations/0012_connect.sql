-- Stripe Connect: coaches receive their clients' subscription payments on their own Stripe (Express) account
ALTER TABLE coaches ADD COLUMN connect_account TEXT;      -- acct_…
ALTER TABLE coaches ADD COLUMN connect_status TEXT;       -- onboarding | actief | beperkt
ALTER TABLE coaches ADD COLUMN connect_land TEXT;         -- ISO country of the connected account
ALTER TABLE coaches ADD COLUMN client_prijs INTEGER;      -- monthly price for this coach's clients, in cents
ALTER TABLE coaches ADD COLUMN client_valuta TEXT;
ALTER TABLE coaches ADD COLUMN client_product TEXT;       -- prod_… on the platform account
ALTER TABLE coaches ADD COLUMN client_price TEXT;         -- price_… (current)
-- clients.abo_status 'nodig' = the coach asks this client to pay via the app, no subscription yet
