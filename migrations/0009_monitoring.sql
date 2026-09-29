-- Server error log for the owner's "Systeem" view and push alerts
CREATE TABLE fouten (
  id          INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,
  pad         TEXT    NOT NULL,
  melding     TEXT    NOT NULL
);
CREATE INDEX fouten_ts ON fouten(ts);
