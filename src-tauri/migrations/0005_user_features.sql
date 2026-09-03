CREATE TABLE IF NOT EXISTS track_metadata_overrides (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  title TEXT,
  artist TEXT,
  album TEXT,
  year INTEGER,
  genre TEXT,
  composer TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_records (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  custom_cover_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_record_items (
  playlist_id TEXT NOT NULL REFERENCES playlist_records(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL,
  sort_key INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_record_items_order
  ON playlist_record_items(playlist_id, sort_key);
