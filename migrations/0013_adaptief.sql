-- Adaptive targets: weekly kcal correction from the actual weight trend
-- JSON {kcal, uit, laatst, gewijzigd, historie:[{t, van, naar, delta, tempo, reden}]}
ALTER TABLE clients ADD COLUMN adaptief TEXT;
