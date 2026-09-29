-- Client-owned products (from label, barcode or AI label scan) and the food diary

CREATE TABLE producten (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  naam        TEXT    NOT NULL,
  merk        TEXT    NOT NULL DEFAULT '',
  barcode     TEXT,
  kcal        REAL    NOT NULL,              -- all nutrients per 100 g
  eiwit       REAL    NOT NULL,
  koolh       REAL    NOT NULL,              -- carbohydrates excl. fibre
  vet         REAL    NOT NULL,
  vezels      REAL    NOT NULL DEFAULT 0,
  portie_naam TEXT,                          -- e.g. "reep", "schep"
  portie_g    REAL,
  in_menu     INTEGER NOT NULL DEFAULT 0,
  rol         TEXT,                          -- eiwit | koolh | vet | fruit (role in the generated menu)
  maaltijden  TEXT    NOT NULL DEFAULT '[]', -- JSON subset of ["ontbijt","hoofd","snack"]
  bron        TEXT    NOT NULL DEFAULT 'handmatig',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX producten_client ON producten(client_id);
CREATE UNIQUE INDEX producten_barcode ON producten(client_id, barcode) WHERE barcode IS NOT NULL;

CREATE TABLE dagboek (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  datum       TEXT    NOT NULL,
  maaltijd    TEXT    NOT NULL CHECK (maaltijd IN ('ontbijt','lunch','avond','snack')),
  naam        TEXT    NOT NULL,
  bron        TEXT    NOT NULL,              -- basis | eigen | menu
  ref         TEXT    NOT NULL DEFAULT '',   -- food key, product id, or "menu:<meal>:<food>"
  gram        REAL    NOT NULL,
  kcal        REAL    NOT NULL,              -- totals for this entry (snapshot)
  eiwit       REAL    NOT NULL,
  koolh       REAL    NOT NULL,
  vet         REAL    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX dagboek_client_datum ON dagboek(client_id, datum);
