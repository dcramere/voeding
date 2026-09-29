-- Intake questionnaire, privacy consent and weekly check-ins

ALTER TABLE clients ADD COLUMN intake TEXT;               -- JSON, NULL until filled in
ALTER TABLE clients ADD COLUMN privacy_akkoord INTEGER;   -- unix time the client accepted the privacy statement

CREATE TABLE checkins (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  datum       TEXT    NOT NULL,               -- YYYY-MM-DD
  energie     INTEGER NOT NULL CHECK (energie BETWEEN 1 AND 5),
  honger      INTEGER NOT NULL CHECK (honger BETWEEN 1 AND 5),
  slaap       INTEGER NOT NULL CHECK (slaap BETWEEN 1 AND 5),
  stress      INTEGER NOT NULL CHECK (stress BETWEEN 1 AND 5),
  naleving    INTEGER NOT NULL CHECK (naleving BETWEEN 1 AND 5),
  training    INTEGER,                        -- sessions completed this week
  opmerking   TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  UNIQUE (client_id, datum)
);
