-- Training programs: assignment per client + one row per logged session

ALTER TABLE clients ADD COLUMN programma TEXT;   -- JSON {"id":"ppl12","start":"YYYY-MM-DD"}, NULL = none

CREATE TABLE workouts (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  programma   TEXT    NOT NULL,
  week        INTEGER NOT NULL,
  dag         TEXT    NOT NULL,
  datum       TEXT    NOT NULL,                  -- YYYY-MM-DD of the session
  sets        TEXT    NOT NULL DEFAULT '{}',     -- JSON {exerciseId: [{kg, reps, ok}]}
  notitie     TEXT    NOT NULL DEFAULT '',
  afgerond    INTEGER,                           -- unix time finished, NULL = in progress
  updated_at  INTEGER NOT NULL,
  UNIQUE (client_id, programma, week, dag)
);
CREATE INDEX workouts_client ON workouts(client_id, programma);
