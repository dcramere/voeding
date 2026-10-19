-- Training adjusts automatically after a hard check-in (lighter week, target weights)
ALTER TABLE coaches ADD COLUMN auto_training INTEGER NOT NULL DEFAULT 1;
