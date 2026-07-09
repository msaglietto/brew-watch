CREATE TABLE IF NOT EXISTS packages (
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('formula', 'cask')),
  version TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  PRIMARY KEY (name, kind)
);

CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('formula', 'cask')),
  change_type TEXT NOT NULL CHECK (change_type IN ('new', 'updated')),
  old_version TEXT,
  new_version TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_changes_type_detected ON changes (change_type, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_kind ON changes (kind);
