-- Email notifications for coaches (via Resend) and meal plans built automatically from the intake
ALTER TABLE coaches ADD COLUMN email_aan INTEGER NOT NULL DEFAULT 1;        -- email copies of notifications
ALTER TABLE coaches ADD COLUMN email_berichten INTEGER NOT NULL DEFAULT 0;  -- also for every chat message
ALTER TABLE coaches ADD COLUMN auto_plan INTEGER NOT NULL DEFAULT 1;        -- build a meal plan from the intake
ALTER TABLE clients ADD COLUMN plan_intake INTEGER NOT NULL DEFAULT 0;      -- 1 = already built once (never again automatically)
