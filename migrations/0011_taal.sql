-- Language of the account (nl, en, pt, es): push notifications and reminders are sent in it
ALTER TABLE clients ADD COLUMN taal TEXT;
ALTER TABLE coaches ADD COLUMN taal TEXT;
