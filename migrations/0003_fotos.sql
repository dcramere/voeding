-- Progress photos (binaries live in R2 under c/<client_id>/<foto_id>)

CREATE TABLE fotos (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  datum       TEXT    NOT NULL,                 -- YYYY-MM-DD
  pose        TEXT    NOT NULL CHECK (pose IN ('voor','achter','zijkant')),
  r2_key      TEXT    NOT NULL,
  type        TEXT    NOT NULL,                 -- image/jpeg | image/webp
  bytes       INTEGER NOT NULL,
  door        TEXT    NOT NULL DEFAULT 'client',
  created_at  INTEGER NOT NULL,
  UNIQUE (client_id, datum, pose)
);
CREATE INDEX fotos_client ON fotos(client_id, datum);
