PRAGMA foreign_keys = ON;

CREATE TABLE library_roots (
  id INTEGER PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  permission_ref TEXT,
  availability TEXT NOT NULL DEFAULT 'available',
  last_scanned_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE media_files (
  id INTEGER PRIMARY KEY,
  library_root_id INTEGER NOT NULL REFERENCES library_roots(id),
  relative_path TEXT NOT NULL,
  file_identity TEXT,
  content_fingerprint TEXT,
  size_bytes INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  format TEXT NOT NULL,
  availability TEXT NOT NULL DEFAULT 'available',
  UNIQUE(library_root_id, relative_path)
);

CREATE TABLE albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  album_artist_key TEXT NOT NULL DEFAULT '',
  release_date TEXT,
  UNIQUE(normalized_title, album_artist_key)
);

CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,
  media_file_id INTEGER NOT NULL UNIQUE REFERENCES media_files(id),
  album_id INTEGER REFERENCES albums(id),
  title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  disc_number INTEGER,
  track_number INTEGER,
  raw_tags_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE
);

CREATE TABLE track_artists (
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  role TEXT NOT NULL DEFAULT 'primary',
  position INTEGER NOT NULL,
  PRIMARY KEY(track_id, artist_id, role)
);

CREATE TABLE playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE playlist_items (
  id INTEGER PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  sort_key INTEGER NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE track_user_state (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id),
  rating INTEGER CHECK(rating BETWEEN 1 AND 5),
  play_count INTEGER NOT NULL DEFAULT 0,
  listened_ms INTEGER NOT NULL DEFAULT 0,
  last_played_at TEXT
);

CREATE TABLE playback_sessions (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  listened_ms INTEGER NOT NULL DEFAULT 0,
  end_reason TEXT,
  counted INTEGER NOT NULL DEFAULT 0 CHECK(counted IN (0, 1))
);

CREATE TABLE lyrics (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  language TEXT,
  content TEXT NOT NULL,
  confidence REAL,
  cached_at TEXT
);

CREATE TABLE scan_issues (
  id INTEGER PRIMARY KEY,
  library_root_id INTEGER REFERENCES library_roots(id),
  path TEXT NOT NULL,
  category TEXT NOT NULL,
  detail TEXT,
  observed_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE VIRTUAL TABLE track_search USING fts5(
  title,
  artist,
  album,
  filename,
  tokenize='trigram'
);

