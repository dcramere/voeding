-- Weight unit for training (display and input only; weights are always stored in kg)
ALTER TABLE clients ADD COLUMN gewicht_eenheid TEXT;
ALTER TABLE coaches ADD COLUMN gewicht_eenheid TEXT;
