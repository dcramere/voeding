-- Platform: multiple coaches with a platform subscription; client subscriptions via Stripe

ALTER TABLE coaches ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;      -- platform owner: never billed
ALTER TABLE coaches ADD COLUMN status TEXT NOT NULL DEFAULT 'actief';   -- actief | betaling (awaiting first payment) | verlopen
ALTER TABLE coaches ADD COLUMN stripe_customer TEXT;
ALTER TABLE coaches ADD COLUMN stripe_subscription TEXT;
ALTER TABLE coaches ADD COLUMN abo_status TEXT;                          -- Stripe subscription status
ALTER TABLE coaches ADD COLUMN abo_einde INTEGER;                        -- current period end (unix)

ALTER TABLE clients ADD COLUMN stripe_customer TEXT;
ALTER TABLE clients ADD COLUMN stripe_subscription TEXT;
ALTER TABLE clients ADD COLUMN abo_status TEXT;                          -- NULL = not billed via Stripe (invited by a coach)
ALTER TABLE clients ADD COLUMN abo_einde INTEGER;

CREATE INDEX clients_stripe_sub ON clients(stripe_subscription);
CREATE INDEX coaches_stripe_sub ON coaches(stripe_subscription);

-- webhook idempotency
CREATE TABLE stripe_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- the first coach (created with the setup code) owns the platform
UPDATE coaches SET is_owner = 1 WHERE id = (SELECT MIN(id) FROM coaches);
