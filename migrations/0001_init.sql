-- DCRAMERE Voeding — initial schema

CREATE TABLE coaches (
  id          INTEGER PRIMARY KEY,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  naam        TEXT    NOT NULL,
  pw_hash     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE clients (
  id              INTEGER PRIMARY KEY,
  coach_id        INTEGER NOT NULL REFERENCES coaches(id),
  naam            TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash         TEXT,                       -- NULL until the invite is accepted
  invite_hash     TEXT,                       -- sha256 of the one-time invite token
  invite_expires  INTEGER,
  profiel         TEXT,                       -- JSON, NULL until filled in
  menu            TEXT    NOT NULL DEFAULT '{"seed":0,"off":[]}',
  notities        TEXT    NOT NULL DEFAULT '',
  actief          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  last_seen       INTEGER
);
CREATE UNIQUE INDEX clients_invite ON clients(invite_hash) WHERE invite_hash IS NOT NULL;
CREATE INDEX clients_coach ON clients(coach_id);

CREATE TABLE metingen (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  datum       TEXT    NOT NULL,               -- YYYY-MM-DD
  gewicht     REAL    NOT NULL,
  taille      REAL,
  heup        REAL,
  p1 REAL, p2 REAL, p3 REAL, p4 REAL,         -- biceps, triceps, subscapulair, suprailiacaal (mm)
  door        TEXT    NOT NULL DEFAULT 'client',
  created_at  INTEGER NOT NULL,
  UNIQUE (client_id, datum)
);

CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,
  role        TEXT    NOT NULL CHECK (role IN ('client','coach')),
  subject_id  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX sessions_subject ON sessions(role, subject_id);

CREATE TABLE login_attempts (
  k   TEXT    NOT NULL,
  ts  INTEGER NOT NULL
);
CREATE INDEX login_attempts_k ON login_attempts(k, ts);
