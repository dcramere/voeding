-- Blood test reports: uploaded lab files (R2, private), extracted values and an automatic summary
CREATE TABLE bloedonderzoek (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  datum TEXT NOT NULL,                 -- date of the blood draw (from the report, else the upload date)
  lab TEXT,
  bestanden TEXT NOT NULL DEFAULT '[]', -- JSON [{key, type, bytes, naam}]
  waarden TEXT NOT NULL DEFAULT '[]',   -- JSON [{naam, waarde, tekst, eenheid, ref_min, ref_max, ref_tekst, vlag}]
  samenvatting TEXT,                   -- JSON {client: {taal, tekst}, coach: {taal, tekst}}
  door TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX bloed_client ON bloedonderzoek (client_id, datum);
ALTER TABLE clients ADD COLUMN bloed_akkoord INTEGER;
