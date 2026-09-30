-- Coach storefronts (public page /c/<slug>), requests from prospects, profile pictures

ALTER TABLE coaches ADD COLUMN slug TEXT;                 -- public storefront address
ALTER TABLE coaches ADD COLUMN winkel TEXT;               -- JSON storefront content (see cleanWinkel)
ALTER TABLE coaches ADD COLUMN avatar_key TEXT;           -- R2 key, public
ALTER TABLE coaches ADD COLUMN avatar_v INTEGER;
CREATE UNIQUE INDEX coaches_slug ON coaches(slug) WHERE slug IS NOT NULL;

ALTER TABLE clients ADD COLUMN avatar_key TEXT;           -- R2 key, only the client and their coach
ALTER TABLE clients ADD COLUMN avatar_v INTEGER;

CREATE TABLE aanvragen (
  id          INTEGER PRIMARY KEY,
  coach_id    INTEGER NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  naam        TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  telefoon    TEXT    NOT NULL DEFAULT '',
  pakket      TEXT    NOT NULL DEFAULT '',
  doel        TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw','uitgenodigd','afgewezen')),
  client_id   INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX aanvragen_coach ON aanvragen(coach_id, status);
