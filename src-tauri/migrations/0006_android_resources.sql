-- URI identities are app-local; never infer filesystem paths from content URIs.
CREATE TABLE IF NOT EXISTS document_resources (
  media_file_id INTEGER PRIMARY KEY REFERENCES media_files(id) ON DELETE CASCADE,
  tree_uri TEXT NOT NULL,
  document_id TEXT NOT NULL,
  content_uri TEXT NOT NULL,
  UNIQUE(tree_uri, document_id)
);
CREATE TABLE IF NOT EXISTS native_playback_events (
  session_id TEXT PRIMARY KEY,
  track_id INTEGER NOT NULL,
  listened_ms INTEGER NOT NULL,
  counted INTEGER NOT NULL DEFAULT 0
);
-- Keep Android track IDs distinct from removed tracks still present in the native journal.
CREATE TABLE IF NOT EXISTS android_track_identities (id INTEGER PRIMARY KEY AUTOINCREMENT);
INSERT OR IGNORE INTO android_track_identities(id) SELECT id FROM tracks;
