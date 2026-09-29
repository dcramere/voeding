-- Coach control: manual targets per client, custom training programs, coach branding, demo clients

ALTER TABLE clients ADD COLUMN doelen TEXT;       -- JSON {kcal, prot, fat} set by the coach; NULL = formula
ALTER TABLE clients ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;

CREATE TABLE programmas (
  id          INTEGER PRIMARY KEY,
  coach_id    INTEGER NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  naam        TEXT    NOT NULL,
  data        TEXT    NOT NULL,                 -- JSON {weken, deload, dagen:[{key,naam,focus,type,ex:[{id,reps}]}], oefeningen:{c_x:{n,eq,m,s,rust,cue}}}
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX programmas_coach ON programmas(coach_id);

ALTER TABLE coaches ADD COLUMN merk TEXT;         -- JSON {naam, kleur, logo_key, logo_type}
