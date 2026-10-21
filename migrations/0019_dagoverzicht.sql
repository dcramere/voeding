-- Daily overview notification: hour in the client's local time (NULL = off), their UTC offset (minutes, as
-- Date.getTimezoneOffset) and the local date it was last sent
ALTER TABLE clients ADD COLUMN dagoverzicht INTEGER;
ALTER TABLE clients ADD COLUMN tz INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN dagoverzicht_laatst TEXT;
