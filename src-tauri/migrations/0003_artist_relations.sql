CREATE TABLE IF NOT EXISTS album_artists (
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id),
  position INTEGER NOT NULL,
  PRIMARY KEY(album_id, artist_id)
);
