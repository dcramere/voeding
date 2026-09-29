-- Coach ↔ client messages (incl. feedback on check-ins), web push subscriptions, notification queue, reminders

CREATE TABLE berichten (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  van         TEXT    NOT NULL CHECK (van IN ('client','coach')),
  tekst       TEXT    NOT NULL DEFAULT '',
  foto_key    TEXT,                          -- R2 key of an attached photo
  foto_type   TEXT,
  checkin_id  INTEGER,                       -- coach feedback on a specific check-in
  gelezen     INTEGER,                       -- unix time read by the other party
  created_at  INTEGER NOT NULL
);
CREATE INDEX berichten_client ON berichten(client_id, id);

CREATE TABLE push_subs (
  id          INTEGER PRIMARY KEY,
  role        TEXT    NOT NULL CHECK (role IN ('client','coach')),
  subject_id  INTEGER NOT NULL,
  endpoint    TEXT    NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);
CREATE INDEX push_subs_subject ON push_subs(role, subject_id);

-- push messages carry no payload; the service worker fetches these after a push
CREATE TABLE notificaties (
  id          INTEGER PRIMARY KEY,
  role        TEXT    NOT NULL,
  subject_id  INTEGER NOT NULL,
  titel       TEXT    NOT NULL,
  tekst       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  bezorgd     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX notificaties_subject ON notificaties(role, subject_id, bezorgd);

CREATE TABLE herinneringen (
  client_id   INTEGER NOT NULL,
  soort       TEXT    NOT NULL,
  laatst      INTEGER NOT NULL,
  PRIMARY KEY (client_id, soort)
);
