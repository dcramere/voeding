-- Automatic replies to check-ins (written by Workers AI in the coach's voice, sent in the coach's name)
ALTER TABLE coaches ADD COLUMN auto_checkin INTEGER NOT NULL DEFAULT 1;
ALTER TABLE berichten ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;  -- 1 = sent automatically (shown as such to the coach)
