-- Recommendation plan per blood test (JSON {taal, gemaakt, ai, focus, meer, minder, dag, leefstijl, arts})
ALTER TABLE bloedonderzoek ADD COLUMN advies TEXT;
