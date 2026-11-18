-- Progress evaluations: monthly (automatic after a complete photo set) or final (coach, when a client stops)
CREATE TABLE evaluaties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  soort TEXT NOT NULL,                       -- maand | eind
  van TEXT NOT NULL,
  tot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'wachtrij',   -- wachtrij | klaar
  data TEXT,                                 -- JSON metrics of the period
  tekst TEXT,                                -- JSON {client: {taal, tekst, ai}, coach: {taal, tekst, ai}}
  gedeeld INTEGER NOT NULL DEFAULT 0,        -- visible to the client
  door TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX evaluaties_client ON evaluaties (client_id, tot);
ALTER TABLE coaches ADD COLUMN auto_evaluatie INTEGER NOT NULL DEFAULT 1;
