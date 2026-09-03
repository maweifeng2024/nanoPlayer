CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_cache (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  image_data BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_files_availability ON media_files(availability);
CREATE INDEX IF NOT EXISTS idx_playback_sessions_track ON playback_sessions(track_id, started_at);
CREATE INDEX IF NOT EXISTS idx_lyrics_track_source ON lyrics(track_id, source);
CREATE INDEX IF NOT EXISTS idx_artwork_content_hash ON artwork_cache(content_hash);
