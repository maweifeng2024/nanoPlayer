//! SQLite ownership and serialized write operations.

use crate::scanner::{ScanIssue, ScanResult};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{backup::Backup, params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

pub const INITIAL_MIGRATION: &str = include_str!("../../migrations/0001_initial.sql");
pub const APP_STATE_MIGRATION: &str = include_str!("../../migrations/0002_app_state.sql");
pub const ARTIST_RELATIONS_MIGRATION: &str =
    include_str!("../../migrations/0003_artist_relations.sql");
pub const SCAN_RUNS_MIGRATION: &str = include_str!("../../migrations/0004_scan_runs.sql");
pub const USER_FEATURES_MIGRATION: &str = include_str!("../../migrations/0005_user_features.sql");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRootDto {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub availability: String,
    pub song_count: u64,
    pub size_bytes: u64,
    pub last_scanned_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: i64,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: u64,
    pub format: String,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_total: Option<u32>,
    pub album_artist: Option<String>,
    pub composer: Option<String>,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub musicbrainz_recording_id: Option<String>,
    pub added_at: String,
    pub lyrics: Option<String>,
    pub lyrics_source: Option<String>,
    pub lyrics_kind: Option<String>,
    pub has_artwork: bool,
    pub artwork_hash: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueDto {
    pub id: i64,
    pub root_id: Option<i64>,
    pub path: String,
    pub category: String,
    pub detail: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistDto {
    pub id: String,
    pub name: String,
    pub track_ids: Vec<i64>,
}

pub struct TrackMetadataOverride {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub composer: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub roots: Vec<LibraryRootDto>,
    pub tracks: Vec<TrackDto>,
    pub issues: Vec<IssueDto>,
    pub playlists: Vec<PlaylistDto>,
    pub user_state: Option<serde_json::Value>,
}

pub struct LibraryDatabase {
    connection: Connection,
    path: PathBuf,
}

impl LibraryDatabase {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(to_string)?;
        connection
            .execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(to_string)?;
        let has_schema: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='library_roots')",
            [],
            |row| row.get(0),
        ).map_err(to_string)?;
        if !has_schema {
            connection
                .execute_batch(INITIAL_MIGRATION)
                .map_err(to_string)?;
        }
        connection
            .execute_batch(APP_STATE_MIGRATION)
            .map_err(to_string)?;
        connection
            .execute_batch(ARTIST_RELATIONS_MIGRATION)
            .map_err(to_string)?;
        connection
            .execute_batch(SCAN_RUNS_MIGRATION)
            .map_err(to_string)?;
        connection
            .execute_batch(USER_FEATURES_MIGRATION)
            .map_err(to_string)?;
        Ok(Self {
            connection,
            path: path.to_owned(),
        })
    }

    pub fn upsert_scan(&mut self, root: &Path, scan: ScanResult) -> Result<(), String> {
        let canonical = root
            .canonicalize()
            .map_err(to_string)?
            .to_string_lossy()
            .into_owned();
        let name = root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(&canonical)
            .to_owned();
        let now = unix_now();
        let transaction = self.connection.transaction().map_err(to_string)?;
        transaction.execute(
            "INSERT INTO library_roots(canonical_path, display_name, availability, last_scanned_at, created_at) VALUES (?1, ?2, 'available', ?3, ?3) ON CONFLICT(canonical_path) DO UPDATE SET display_name=excluded.display_name, availability='available', last_scanned_at=excluded.last_scanned_at",
            params![canonical, name, now],
        ).map_err(to_string)?;
        let root_id: i64 = transaction
            .query_row(
                "SELECT id FROM library_roots WHERE canonical_path=?1",
                [&canonical],
                |row| row.get(0),
            )
            .map_err(to_string)?;
        transaction
            .execute(
                "UPDATE media_files SET availability='missing' WHERE library_root_id=?1",
                [root_id],
            )
            .map_err(to_string)?;
        transaction
            .execute(
                "DELETE FROM scan_issues WHERE library_root_id=?1",
                [root_id],
            )
            .map_err(to_string)?;

        let processed_files = scan.tracks.len() as i64;
        let issue_count = scan.issues.len() as i64;
        for scanned in scan.tracks {
            let Some(metadata) = scanned.metadata else {
                transaction.execute("UPDATE media_files SET availability='available', file_identity=?1, size_bytes=?2, modified_at=?3, format=?4 WHERE library_root_id=?5 AND relative_path=?6", params![scanned.file_identity, scanned.size_bytes, scanned.modified_at.to_string(), scanned.format, root_id, scanned.relative_path]).map_err(to_string)?;
                continue;
            };
            let album_key = normalize(&metadata.album);
            let album_artist = if metadata.album_artist.is_empty() {
                metadata.artist.clone()
            } else {
                metadata.album_artist.clone()
            };
            transaction.execute(
                "INSERT INTO albums(title, normalized_title, album_artist_key, release_date) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(normalized_title, album_artist_key) DO NOTHING",
                params![metadata.album, album_key, normalize(&album_artist), metadata.year.map(|v| v.to_string())],
            ).map_err(to_string)?;
            let album_id: i64 = transaction
                .query_row(
                    "SELECT id FROM albums WHERE normalized_title=?1 AND album_artist_key=?2",
                    params![album_key, normalize(&album_artist)],
                    |row| row.get(0),
                )
                .map_err(to_string)?;
            transaction.execute("UPDATE media_files SET relative_path=?1 WHERE library_root_id=?2 AND file_identity=?3 AND availability='missing' AND NOT EXISTS(SELECT 1 FROM media_files WHERE library_root_id=?2 AND relative_path=?1)", params![scanned.relative_path, root_id, scanned.file_identity]).map_err(to_string)?;
            transaction.execute(
                "INSERT INTO media_files(library_root_id, relative_path, file_identity, content_fingerprint, size_bytes, modified_at, format, availability) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'available') ON CONFLICT(library_root_id, relative_path) DO UPDATE SET file_identity=excluded.file_identity, content_fingerprint=excluded.content_fingerprint, size_bytes=excluded.size_bytes, modified_at=excluded.modified_at, format=excluded.format, availability='available'",
                params![root_id, scanned.relative_path, scanned.file_identity, scanned.content_fingerprint, scanned.size_bytes, scanned.modified_at.to_string(), scanned.format],
            ).map_err(to_string)?;
            let file_id: i64 = transaction
                .query_row(
                    "SELECT id FROM media_files WHERE library_root_id=?1 AND relative_path=?2",
                    params![root_id, scanned.relative_path],
                    |row| row.get(0),
                )
                .map_err(to_string)?;
            let raw_tags = serde_json::to_string(&metadata).map_err(to_string)?;
            transaction.execute(
                "INSERT INTO tracks(media_file_id, album_id, title, normalized_title, duration_ms, disc_number, track_number, raw_tags_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(media_file_id) DO UPDATE SET album_id=excluded.album_id, title=excluded.title, normalized_title=excluded.normalized_title, duration_ms=excluded.duration_ms, disc_number=excluded.disc_number, track_number=excluded.track_number, raw_tags_json=excluded.raw_tags_json",
                params![file_id, album_id, metadata.title, normalize(&metadata.title), metadata.duration_ms, metadata.disc_number, metadata.track_number, raw_tags],
            ).map_err(to_string)?;
            let track_id: i64 = transaction
                .query_row(
                    "SELECT id FROM tracks WHERE media_file_id=?1",
                    [file_id],
                    |row| row.get(0),
                )
                .map_err(to_string)?;
            if let Some(artwork) = scanned.embedded_artwork {
                let content_hash = format!("{:x}", Sha256::digest(&artwork.data));
                transaction.execute("INSERT INTO artwork_cache(track_id, content_hash, mime_type, image_data, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(track_id) DO UPDATE SET content_hash=excluded.content_hash, mime_type=excluded.mime_type, image_data=excluded.image_data, updated_at=excluded.updated_at", params![track_id, content_hash, artwork.mime_type, artwork.data, now]).map_err(to_string)?;
            } else {
                transaction
                    .execute("DELETE FROM artwork_cache WHERE track_id=?1", [track_id])
                    .map_err(to_string)?;
            }
            transaction
                .execute("DELETE FROM track_artists WHERE track_id=?1", [track_id])
                .map_err(to_string)?;
            for (position, artist) in metadata.artists.iter().enumerate() {
                transaction.execute("INSERT INTO artists(name, normalized_name) VALUES (?1, ?2) ON CONFLICT(normalized_name) DO NOTHING", params![artist, normalize(artist)]).map_err(to_string)?;
                let artist_id: i64 = transaction
                    .query_row(
                        "SELECT id FROM artists WHERE normalized_name=?1",
                        [normalize(artist)],
                        |row| row.get(0),
                    )
                    .map_err(to_string)?;
                transaction.execute(
                    "INSERT INTO track_artists(track_id, artist_id, position) VALUES (?1, ?2, ?3)",
                    params![track_id, artist_id, position as i64],
                ).map_err(to_string)?;
            }
            transaction.execute("INSERT INTO artists(name, normalized_name) VALUES (?1, ?2) ON CONFLICT(normalized_name) DO NOTHING", params![album_artist, normalize(&album_artist)]).map_err(to_string)?;
            let album_artist_id: i64 = transaction
                .query_row(
                    "SELECT id FROM artists WHERE normalized_name=?1",
                    [normalize(&album_artist)],
                    |row| row.get(0),
                )
                .map_err(to_string)?;
            transaction.execute(
                "INSERT INTO album_artists(album_id, artist_id, position) VALUES (?1, ?2, 0) ON CONFLICT(album_id, artist_id) DO UPDATE SET position=excluded.position",
                params![album_id, album_artist_id],
            ).map_err(to_string)?;
            transaction
                .execute("DELETE FROM track_search WHERE rowid=?1", [track_id])
                .map_err(to_string)?;
            transaction.execute("INSERT INTO track_search(rowid, title, artist, album, filename) VALUES (?1, ?2, ?3, ?4, ?5)", params![track_id, metadata.title, metadata.artist, metadata.album, scanned.relative_path]).map_err(to_string)?;
            transaction
                .execute(
                    "DELETE FROM lyrics WHERE track_id=?1 AND source='embedded'",
                    [track_id],
                )
                .map_err(to_string)?;
            if let Some(content) = scanned.embedded_lyrics {
                let kind = lyrics_kind(&content);
                transaction.execute("INSERT INTO lyrics(track_id, source, kind, content, confidence, cached_at) VALUES (?1, 'embedded', ?2, ?3, 1.0, ?4)", params![track_id, kind, content, now]).map_err(to_string)?;
            }
            transaction
                .execute(
                    "DELETE FROM lyrics WHERE track_id=?1 AND source='sidecar'",
                    [track_id],
                )
                .map_err(to_string)?;
            if let Some(content) = scanned.sidecar_lyrics {
                let kind = lyrics_kind(&content);
                transaction.execute("INSERT INTO lyrics(track_id, source, kind, content, confidence, cached_at) VALUES (?1, 'sidecar', ?2, ?3, 1.0, ?4)", params![track_id, kind, content, now]).map_err(to_string)?;
            }
        }
        for issue in scan.issues {
            insert_issue(&transaction, root_id, issue, &now)?;
        }
        transaction.execute(
            "INSERT INTO scan_runs(library_root_id, started_at, finished_at, status, processed_files, issue_count) VALUES (?1, ?2, ?2, 'completed', ?3, ?4)",
            params![root_id, now, processed_files, issue_count],
        ).map_err(to_string)?;
        transaction.commit().map_err(to_string)
    }

    pub fn remove_root(&mut self, root_id: i64) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(to_string)?;
        transaction.execute("DELETE FROM track_search WHERE rowid IN (SELECT t.id FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE m.library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction.execute("DELETE FROM lyrics WHERE track_id IN (SELECT t.id FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE m.library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction.execute("DELETE FROM playback_sessions WHERE track_id IN (SELECT t.id FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE m.library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction.execute("DELETE FROM track_user_state WHERE track_id IN (SELECT t.id FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE m.library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction.execute("DELETE FROM playlist_items WHERE track_id IN (SELECT t.id FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE m.library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction.execute("DELETE FROM track_artists WHERE track_id IN (SELECT t.id FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE m.library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction.execute("DELETE FROM tracks WHERE media_file_id IN (SELECT id FROM media_files WHERE library_root_id=?1)", [root_id]).map_err(to_string)?;
        transaction
            .execute(
                "DELETE FROM media_files WHERE library_root_id=?1",
                [root_id],
            )
            .map_err(to_string)?;
        transaction
            .execute(
                "DELETE FROM scan_issues WHERE library_root_id=?1",
                [root_id],
            )
            .map_err(to_string)?;
        transaction
            .execute("DELETE FROM library_roots WHERE id=?1", [root_id])
            .map_err(to_string)?;
        transaction.commit().map_err(to_string)
    }

    pub fn root_path(&self, root_id: i64) -> Result<Option<String>, String> {
        self.connection
            .query_row(
                "SELECT canonical_path FROM library_roots WHERE id=?1",
                [root_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_string)
    }

    pub fn mark_root_unavailable(&mut self, root_id: i64, detail: &str) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(to_string)?;
        let path: Option<String> = transaction
            .query_row(
                "SELECT canonical_path FROM library_roots WHERE id=?1",
                [root_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_string)?;
        transaction
            .execute(
                "UPDATE library_roots SET availability='unavailable' WHERE id=?1",
                [root_id],
            )
            .map_err(to_string)?;
        transaction
            .execute(
                "UPDATE media_files SET availability='unavailable' WHERE library_root_id=?1",
                [root_id],
            )
            .map_err(to_string)?;
        if let Some(path) = path {
            transaction.execute("INSERT INTO scan_issues(library_root_id, path, category, detail, observed_at) VALUES (?1, ?2, 'permission', ?3, ?4)", params![root_id, path, detail, unix_now()]).map_err(to_string)?;
        }
        transaction.commit().map_err(to_string)
    }

    pub fn track_path(&self, track_id: i64) -> Result<Option<String>, String> {
        self.connection.query_row(
            "SELECT r.canonical_path || '/' || m.relative_path FROM tracks t JOIN media_files m ON m.id=t.media_file_id JOIN library_roots r ON r.id=m.library_root_id WHERE t.id=?1 AND m.availability='available'",
            [track_id], |row| row.get(0),
        ).optional().map_err(to_string)
    }

    pub fn artwork_data_url(&self, track_id: i64) -> Result<Option<String>, String> {
        self.connection
            .query_row(
                "SELECT mime_type, image_data FROM artwork_cache WHERE track_id=?1",
                [track_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?)),
            )
            .optional()
            .map_err(to_string)
            .map(|value| {
                value.map(|(mime_type, data)| {
                    format!("data:{mime_type};base64,{}", BASE64.encode(data))
                })
            })
    }

    pub fn snapshot(&self) -> Result<LibrarySnapshot, String> {
        let roots = collect(&self.connection, "SELECT r.id, r.canonical_path, r.display_name, r.availability, COUNT(CASE WHEN m.availability='available' THEN 1 END), COALESCE(SUM(CASE WHEN m.availability='available' THEN m.size_bytes ELSE 0 END), 0), r.last_scanned_at FROM library_roots r LEFT JOIN media_files m ON m.library_root_id=r.id GROUP BY r.id ORDER BY r.created_at", |row| Ok(LibraryRootDto { id: row.get(0)?, path: row.get(1)?, name: row.get(2)?, availability: row.get(3)?, song_count: row.get(4)?, size_bytes: row.get(5)?, last_scanned_at: row.get(6)? }))?;
        let tracks = collect(&self.connection, "SELECT t.id, r.canonical_path || '/' || m.relative_path, COALESCE(o.title, t.title), COALESCE(o.artist, a.name, '未知艺术家'), COALESCE(o.album, al.title), t.duration_ms, m.format, COALESCE(o.year, json_extract(t.raw_tags_json, '$.year')), COALESCE(o.genre, json_extract(t.raw_tags_json, '$.genre')), t.track_number, t.disc_number, r.created_at, ly.content, ly.source, ly.kind, EXISTS(SELECT 1 FROM artwork_cache ac WHERE ac.track_id=t.id), (SELECT content_hash FROM artwork_cache ac WHERE ac.track_id=t.id), json_extract(t.raw_tags_json, '$.trackTotal'), json_extract(t.raw_tags_json, '$.discTotal'), json_extract(t.raw_tags_json, '$.albumArtist'), COALESCE(o.composer, json_extract(t.raw_tags_json, '$.composer')), json_extract(t.raw_tags_json, '$.bitrate'), json_extract(t.raw_tags_json, '$.sampleRate'), json_extract(t.raw_tags_json, '$.channels'), json_extract(t.raw_tags_json, '$.musicbrainzRecordingId') FROM tracks t JOIN media_files m ON m.id=t.media_file_id JOIN library_roots r ON r.id=m.library_root_id JOIN albums al ON al.id=t.album_id LEFT JOIN track_artists ta ON ta.track_id=t.id AND ta.position=0 LEFT JOIN artists a ON a.id=ta.artist_id LEFT JOIN track_metadata_overrides o ON o.track_id=t.id LEFT JOIN lyrics ly ON ly.id=(SELECT id FROM lyrics WHERE track_id=t.id ORDER BY CASE WHEN source='manual' THEN 0 WHEN source='embedded' AND kind='synchronized' THEN 1 WHEN source='sidecar' AND kind='synchronized' THEN 2 WHEN source='lrclib' AND kind='synchronized' THEN 3 WHEN source='embedded' THEN 4 WHEN source='sidecar' THEN 5 WHEN source='lrclib' THEN 6 ELSE 7 END, id DESC LIMIT 1) WHERE m.availability='available' ORDER BY COALESCE(o.title, t.title) COLLATE NOCASE", |row| Ok(TrackDto { id: row.get(0)?, path: row.get(1)?, title: row.get(2)?, artist: row.get(3)?, album: row.get(4)?, duration_ms: row.get(5)?, format: row.get(6)?, year: row.get(7)?, genre: row.get(8)?, track_number: row.get(9)?, disc_number: row.get(10)?, added_at: row.get(11)?, lyrics: row.get(12)?, lyrics_source: row.get(13)?, lyrics_kind: row.get(14)?, has_artwork: row.get(15)?, artwork_hash: row.get(16)?, track_total: row.get(17)?, disc_total: row.get(18)?, album_artist: row.get(19)?, composer: row.get(20)?, bitrate: row.get(21)?, sample_rate: row.get(22)?, channels: row.get(23)?, musicbrainz_recording_id: row.get(24)? }))?;
        let issues = collect(&self.connection, "SELECT id, library_root_id, path, category, COALESCE(detail, '') FROM scan_issues WHERE resolved_at IS NULL ORDER BY observed_at DESC", |row| Ok(IssueDto { id: row.get(0)?, root_id: row.get(1)?, path: row.get(2)?, category: row.get(3)?, detail: row.get(4)? }))?;
        let mut playlist_statement = self
            .connection
            .prepare("SELECT id, name FROM playlist_records ORDER BY created_at, id")
            .map_err(to_string)?;
        let playlist_rows = playlist_statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        drop(playlist_statement);
        let mut playlists = Vec::with_capacity(playlist_rows.len());
        for (id, name) in playlist_rows {
            let mut item_statement = self.connection.prepare("SELECT track_id FROM playlist_record_items WHERE playlist_id=?1 ORDER BY sort_key").map_err(to_string)?;
            let track_ids = item_statement
                .query_map([&id], |row| row.get(0))
                .map_err(to_string)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(to_string)?;
            playlists.push(PlaylistDto {
                id,
                name,
                track_ids,
            });
        }
        let user_state = self
            .connection
            .query_row(
                "SELECT value_json FROM app_state WHERE key='user_state'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(to_string)?
            .and_then(|value| serde_json::from_str(&value).ok());
        Ok(LibrarySnapshot {
            roots,
            tracks,
            issues,
            playlists,
            user_state,
        })
    }

    pub fn save_user_state(&mut self, value: &str) -> Result<(), String> {
        if value.len() > 5_000_000 {
            return Err("状态数据超过 5 MB 上限".into());
        }
        let parsed: serde_json::Value = serde_json::from_str(value).map_err(to_string)?;
        if !parsed.is_object() {
            return Err("状态数据必须是 JSON 对象".into());
        }
        self.connection.execute("INSERT INTO app_state(key, value_json, updated_at) VALUES ('user_state', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at", params![value, unix_now()]).map_err(to_string)?;
        self.sync_playlists_from_state(&parsed)?;
        Ok(())
    }

    fn sync_playlists_from_state(&mut self, state: &serde_json::Value) -> Result<(), String> {
        let Some(playlists) = state.get("playlists").and_then(|value| value.as_array()) else {
            return Ok(());
        };
        let transaction = self.connection.transaction().map_err(to_string)?;
        let now = unix_now();
        let incoming = playlists
            .iter()
            .filter_map(|playlist| playlist.get("id").and_then(|value| value.as_str()))
            .collect::<Vec<_>>();
        for playlist in playlists {
            let Some(id) = playlist.get("id").and_then(|value| value.as_str()) else {
                continue;
            };
            let Some(name) = playlist.get("name").and_then(|value| value.as_str()) else {
                continue;
            };
            transaction.execute("INSERT INTO playlist_records(id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at", params![id, name, now]).map_err(to_string)?;
            transaction
                .execute(
                    "DELETE FROM playlist_record_items WHERE playlist_id=?1",
                    [id],
                )
                .map_err(to_string)?;
            if let Some(track_ids) = playlist.get("trackIds").and_then(|value| value.as_array()) {
                for (index, track_id) in track_ids
                    .iter()
                    .filter_map(|value| value.as_i64())
                    .enumerate()
                {
                    transaction.execute("INSERT OR IGNORE INTO playlist_record_items(playlist_id, track_id, sort_key) VALUES (?1, ?2, ?3)", params![id, track_id, index as i64]).map_err(to_string)?;
                }
            }
        }
        let mut statement = transaction
            .prepare("SELECT id FROM playlist_records")
            .map_err(to_string)?;
        let existing = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        drop(statement);
        for id in existing {
            if !incoming.contains(&id.as_str()) {
                transaction
                    .execute("DELETE FROM playlist_records WHERE id=?1", [id])
                    .map_err(to_string)?;
            }
        }
        transaction.commit().map_err(to_string)
    }

    pub fn update_track_metadata(
        &mut self,
        track_id: i64,
        value: &TrackMetadataOverride,
    ) -> Result<(), String> {
        if !self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tracks WHERE id=?1)",
                [track_id],
                |row| row.get::<_, bool>(0),
            )
            .map_err(to_string)?
        {
            return Err("曲目不存在".into());
        }
        self.connection.execute("INSERT INTO track_metadata_overrides(track_id, title, artist, album, year, genre, composer, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(track_id) DO UPDATE SET title=excluded.title, artist=excluded.artist, album=excluded.album, year=excluded.year, genre=excluded.genre, composer=excluded.composer, updated_at=excluded.updated_at", params![track_id, value.title.as_deref(), value.artist.as_deref(), value.album.as_deref(), value.year, value.genre.as_deref(), value.composer.as_deref(), unix_now()]).map_err(to_string)?;
        let signature = self
            .track_signature(track_id)?
            .ok_or_else(|| "曲目不存在".to_owned())?;
        let filename: String = self.connection.query_row("SELECT m.relative_path FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE t.id=?1", [track_id], |row| row.get(0)).map_err(to_string)?;
        self.connection
            .execute("DELETE FROM track_search WHERE rowid=?1", [track_id])
            .map_err(to_string)?;
        self.connection.execute("INSERT INTO track_search(rowid, title, artist, album, filename) VALUES (?1, ?2, ?3, ?4, ?5)", params![track_id, signature.0, signature.1, signature.2, filename]).map_err(to_string)?;
        Ok(())
    }

    pub fn clear_track_metadata_override(&mut self, track_id: i64) -> Result<(), String> {
        self.connection
            .execute(
                "DELETE FROM track_metadata_overrides WHERE track_id=?1",
                [track_id],
            )
            .map_err(to_string)?;
        let signature = self
            .track_signature(track_id)?
            .ok_or_else(|| "曲目不存在".to_owned())?;
        let filename: String = self.connection.query_row("SELECT m.relative_path FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE t.id=?1", [track_id], |row| row.get(0)).map_err(to_string)?;
        self.connection
            .execute("DELETE FROM track_search WHERE rowid=?1", [track_id])
            .map_err(to_string)?;
        self.connection.execute("INSERT INTO track_search(rowid, title, artist, album, filename) VALUES (?1, ?2, ?3, ?4, ?5)", params![track_id, signature.0, signature.1, signature.2, filename]).map_err(to_string)?;
        Ok(())
    }

    pub fn clear_track_metadata_field(&mut self, track_id: i64, field: &str) -> Result<(), String> {
        let statement = match field {
            "title" => {
                "UPDATE track_metadata_overrides SET title=NULL, updated_at=?2 WHERE track_id=?1"
            }
            "artist" => {
                "UPDATE track_metadata_overrides SET artist=NULL, updated_at=?2 WHERE track_id=?1"
            }
            "album" => {
                "UPDATE track_metadata_overrides SET album=NULL, updated_at=?2 WHERE track_id=?1"
            }
            "year" => {
                "UPDATE track_metadata_overrides SET year=NULL, updated_at=?2 WHERE track_id=?1"
            }
            "genre" => {
                "UPDATE track_metadata_overrides SET genre=NULL, updated_at=?2 WHERE track_id=?1"
            }
            "composer" => {
                "UPDATE track_metadata_overrides SET composer=NULL, updated_at=?2 WHERE track_id=?1"
            }
            _ => return Err("不支持的元数据字段".into()),
        };
        self.connection
            .execute(statement, params![track_id, unix_now()])
            .map_err(to_string)?;
        self.connection.execute("DELETE FROM track_metadata_overrides WHERE track_id=?1 AND title IS NULL AND artist IS NULL AND album IS NULL AND year IS NULL AND genre IS NULL AND composer IS NULL", [track_id]).map_err(to_string)?;
        let signature = self
            .track_signature(track_id)?
            .ok_or_else(|| "曲目不存在".to_owned())?;
        let filename: String = self.connection.query_row("SELECT m.relative_path FROM tracks t JOIN media_files m ON m.id=t.media_file_id WHERE t.id=?1", [track_id], |row| row.get(0)).map_err(to_string)?;
        self.connection
            .execute("DELETE FROM track_search WHERE rowid=?1", [track_id])
            .map_err(to_string)?;
        self.connection.execute("INSERT INTO track_search(rowid, title, artist, album, filename) VALUES (?1, ?2, ?3, ?4, ?5)", params![track_id, signature.0, signature.1, signature.2, filename]).map_err(to_string)?;
        Ok(())
    }

    pub fn set_playlist_cover_path(
        &mut self,
        playlist_id: &str,
        path: &Path,
    ) -> Result<(), String> {
        let now = unix_now();
        self.connection.execute("INSERT INTO playlist_records(id, name, custom_cover_path, created_at, updated_at) VALUES (?1, '歌单', ?2, ?3, ?3) ON CONFLICT(id) DO UPDATE SET custom_cover_path=excluded.custom_cover_path, updated_at=excluded.updated_at", params![playlist_id, path.to_string_lossy(), now]).map_err(to_string)?;
        Ok(())
    }

    pub fn playlist_cover_path(&self, playlist_id: &str) -> Result<Option<PathBuf>, String> {
        self.connection
            .query_row(
                "SELECT custom_cover_path FROM playlist_records WHERE id=?1",
                [playlist_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(to_string)
            .map(|value| value.flatten().map(PathBuf::from))
    }

    pub fn clear_playlist_cover_path(
        &mut self,
        playlist_id: &str,
    ) -> Result<Option<PathBuf>, String> {
        let previous = self.playlist_cover_path(playlist_id)?;
        self.connection
            .execute(
                "UPDATE playlist_records SET custom_cover_path=NULL, updated_at=?2 WHERE id=?1",
                params![playlist_id, unix_now()],
            )
            .map_err(to_string)?;
        Ok(previous)
    }

    pub fn create_backup(&self, destination: &Path) -> Result<(), String> {
        let mut target = Connection::open(destination).map_err(to_string)?;
        let backup = Backup::new(&self.connection, &mut target).map_err(to_string)?;
        backup
            .run_to_completion(64, Duration::from_millis(20), None)
            .map_err(to_string)
    }

    pub fn restore_backup(&mut self, source: &Path) -> Result<(), String> {
        let source_connection = Connection::open(source).map_err(to_string)?;
        let integrity: String = source_connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(to_string)?;
        if integrity != "ok" {
            return Err(format!("备份完整性检查失败：{integrity}"));
        }
        let backup = Backup::new(&source_connection, &mut self.connection).map_err(to_string)?;
        backup
            .run_to_completion(64, Duration::from_millis(20), None)
            .map_err(to_string)
    }

    pub fn database_size(&self) -> u64 {
        let base = self.path.to_string_lossy();
        [
            base.to_string(),
            format!("{base}-wal"),
            format!("{base}-shm"),
        ]
        .iter()
        .filter_map(|path| std::fs::metadata(path).ok())
        .map(|metadata| metadata.len())
        .sum()
    }

    pub fn diagnostic_summary(&self) -> Result<serde_json::Value, String> {
        let root_count: u64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM library_roots", [], |row| row.get(0))
            .map_err(to_string)?;
        let track_count: u64 = self
            .connection
            .query_row("SELECT COUNT(*) FROM tracks", [], |row| row.get(0))
            .map_err(to_string)?;
        let unavailable_count: u64 = self
            .connection
            .query_row(
                "SELECT COUNT(*) FROM media_files WHERE availability!='available'",
                [],
                |row| row.get(0),
            )
            .map_err(to_string)?;
        let last_scan: Option<String> = self
            .connection
            .query_row(
                "SELECT MAX(last_scanned_at) FROM library_roots",
                [],
                |row| row.get(0),
            )
            .map_err(to_string)?;
        let integrity: String = self
            .connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(to_string)?;
        let mut statement = self.connection.prepare("SELECT category, COUNT(*) FROM scan_issues WHERE resolved_at IS NULL GROUP BY category ORDER BY category").map_err(to_string)?;
        let issues = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
            })
            .map_err(to_string)?
            .collect::<Result<std::collections::BTreeMap<_, _>, _>>()
            .map_err(to_string)?;
        Ok(json!({
            "schemaVersion": 1,
            "databaseIntegrity": integrity,
            "databaseSizeBytes": self.database_size(),
            "rootCount": root_count,
            "trackCount": track_count,
            "unavailableFileCount": unavailable_count,
            "openIssueCounts": issues,
            "lastScanAt": last_scan,
        }))
    }

    pub fn root_paths(&self) -> Result<Vec<PathBuf>, String> {
        collect(
            &self.connection,
            "SELECT canonical_path FROM library_roots WHERE availability='available'",
            |row| row.get::<_, String>(0),
        )
        .map(|paths| paths.into_iter().map(PathBuf::from).collect())
    }

    pub fn root_fingerprints(
        &self,
        root_id: i64,
    ) -> Result<std::collections::HashMap<String, String>, String> {
        let mut statement = self.connection.prepare("SELECT relative_path, content_fingerprint FROM media_files WHERE library_root_id=?1").map_err(to_string)?;
        let fingerprints = statement
            .query_map([root_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(to_string)?
            .collect::<Result<_, _>>()
            .map_err(to_string)?;
        Ok(fingerprints)
    }

    pub fn track_signature(
        &self,
        track_id: i64,
    ) -> Result<Option<(String, String, String, u64)>, String> {
        self.connection.query_row("SELECT COALESCE(o.title, t.title), COALESCE(o.artist, a.name, '未知艺术家'), COALESCE(o.album, al.title), t.duration_ms FROM tracks t JOIN albums al ON al.id=t.album_id LEFT JOIN track_artists ta ON ta.track_id=t.id AND ta.position=0 LEFT JOIN artists a ON a.id=ta.artist_id LEFT JOIN track_metadata_overrides o ON o.track_id=t.id WHERE t.id=?1", [track_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))).optional().map_err(to_string)
    }

    pub fn cache_online_lyrics(
        &mut self,
        track_id: i64,
        kind: &str,
        content: &str,
        confidence: f64,
    ) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(to_string)?;
        transaction
            .execute(
                "DELETE FROM lyrics WHERE track_id=?1 AND source='lrclib'",
                [track_id],
            )
            .map_err(to_string)?;
        transaction.execute("INSERT INTO lyrics(track_id, source, kind, content, confidence, cached_at) SELECT id, 'lrclib', ?2, ?3, ?4, ?5 FROM tracks WHERE id=?1", params![track_id, kind, content, confidence, unix_now()]).map_err(to_string)?;
        transaction.commit().map_err(to_string)
    }

    pub fn cache_manual_lyrics(
        &mut self,
        track_id: i64,
        kind: &str,
        content: &str,
    ) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(to_string)?;
        transaction
            .execute(
                "DELETE FROM lyrics WHERE track_id=?1 AND source='manual'",
                [track_id],
            )
            .map_err(to_string)?;
        let inserted = transaction.execute("INSERT INTO lyrics(track_id, source, kind, content, confidence, cached_at) SELECT id, 'manual', ?2, ?3, 1.0, ?4 FROM tracks WHERE id=?1", params![track_id, kind, content, unix_now()]).map_err(to_string)?;
        if inserted == 0 {
            return Err("曲目不存在".into());
        }
        transaction.commit().map_err(to_string)
    }

    pub fn clear_track_manual_lyrics(&mut self, track_id: i64) -> Result<u64, String> {
        self.connection
            .execute(
                "DELETE FROM lyrics WHERE source='manual' AND track_id=?1",
                [track_id],
            )
            .map(|count| count as u64)
            .map_err(to_string)
    }

    pub fn clear_online_lyrics_cache(&mut self) -> Result<u64, String> {
        self.connection
            .execute("DELETE FROM lyrics WHERE source='lrclib'", [])
            .map(|count| count as u64)
            .map_err(to_string)
    }

    pub fn clear_track_online_lyrics(&mut self, track_id: i64) -> Result<u64, String> {
        self.connection
            .execute(
                "DELETE FROM lyrics WHERE source='lrclib' AND track_id=?1",
                [track_id],
            )
            .map(|count| count as u64)
            .map_err(to_string)
    }

    pub fn search_track_ids(&self, query: &str) -> Result<Vec<i64>, String> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let phrase = format!("\"{}\"", query.replace('"', "\"\""));
        let mut statement = self
            .connection
            .prepare("SELECT rowid FROM track_search WHERE track_search MATCH ?1 ORDER BY rank LIMIT 10000")
            .map_err(to_string)?;
        let rows = statement
            .query_map([phrase], |row| row.get(0))
            .map_err(to_string)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(to_string)
    }

    pub fn clear_artwork_cache(&mut self) -> Result<u64, String> {
        self.connection
            .execute("DELETE FROM artwork_cache", [])
            .map(|count| count as u64)
            .map_err(to_string)
    }

    pub fn begin_session(&mut self, track_id: i64) -> Result<i64, String> {
        self.connection.execute("INSERT INTO playback_sessions(track_id, started_at) SELECT id, ?2 FROM tracks WHERE id=?1", params![track_id, unix_now()]).map_err(to_string)?;
        Ok(self.connection.last_insert_rowid())
    }

    pub fn checkpoint_session(
        &mut self,
        session_id: i64,
        listened_ms: u64,
        counted: bool,
        end_reason: Option<&str>,
    ) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(to_string)?;
        let track_id: Option<i64> = transaction
            .query_row(
                "SELECT track_id FROM playback_sessions WHERE id=?1",
                [session_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(to_string)?;
        if let Some(track_id) = track_id {
            transaction.execute("UPDATE playback_sessions SET listened_ms=MAX(listened_ms, ?2), counted=MAX(counted, ?3), ended_at=CASE WHEN ?4 IS NULL THEN ended_at ELSE ?5 END, end_reason=COALESCE(?4, end_reason) WHERE id=?1", params![session_id, listened_ms, counted, end_reason, unix_now()]).map_err(to_string)?;
            let (play_count, total_listened): (u64, u64) = transaction.query_row("SELECT COALESCE(SUM(counted), 0), COALESCE(SUM(listened_ms), 0) FROM playback_sessions WHERE track_id=?1", [track_id], |row| Ok((row.get(0)?, row.get(1)?))).map_err(to_string)?;
            transaction.execute("INSERT INTO track_user_state(track_id, play_count, listened_ms, last_played_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(track_id) DO UPDATE SET listened_ms=excluded.listened_ms, play_count=excluded.play_count, last_played_at=excluded.last_played_at", params![track_id, play_count, total_listened, unix_now()]).map_err(to_string)?;
        }
        transaction.commit().map_err(to_string)
    }
}

fn collect<T, F>(connection: &Connection, sql: &str, map: F) -> Result<Vec<T>, String>
where
    F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
{
    let mut statement = connection.prepare(sql).map_err(to_string)?;
    let rows = statement
        .query_map([], map)
        .map_err(to_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_string)?;
    Ok(rows)
}

fn insert_issue(
    transaction: &rusqlite::Transaction<'_>,
    root_id: i64,
    issue: ScanIssue,
    now: &str,
) -> Result<(), String> {
    transaction.execute("INSERT INTO scan_issues(library_root_id, path, category, detail, observed_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![root_id, issue.path, issue.category, issue.detail, now]).map_err(to_string)?;
    Ok(())
}

fn normalize(value: &str) -> String {
    value.trim().to_lowercase()
}
fn lyrics_kind(content: &str) -> &'static str {
    if content
        .lines()
        .any(|line| line.trim_start().starts_with('['))
    {
        "synchronized"
    } else {
        "plain"
    }
}
fn unix_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}
fn to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        LibraryDatabase, ARTIST_RELATIONS_MIGRATION, INITIAL_MIGRATION, SCAN_RUNS_MIGRATION,
        USER_FEATURES_MIGRATION,
    };

    #[test]
    fn initial_schema_contains_library_roots() {
        assert!(INITIAL_MIGRATION.contains("CREATE TABLE library_roots"));
        assert!(ARTIST_RELATIONS_MIGRATION.contains("CREATE TABLE IF NOT EXISTS album_artists"));
        assert!(SCAN_RUNS_MIGRATION.contains("CREATE TABLE IF NOT EXISTS scan_runs"));
        assert!(
            USER_FEATURES_MIGRATION.contains("CREATE TABLE IF NOT EXISTS track_metadata_overrides")
        );
    }

    #[test]
    fn fts_search_treats_user_input_as_a_phrase() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nanoplayer-search-{suffix}.sqlite3"));
        let database = LibraryDatabase::open(&path).expect("open database");
        database.connection.execute("INSERT INTO track_search(rowid, title, artist, album, filename) VALUES (1, '海平面以下', '林岚', '潮汐与回声', 'track.flac')", []).expect("insert search row");
        assert_eq!(database.search_track_ids("海平面").unwrap(), vec![1]);
        assert!(database
            .search_track_ids("\" OR title:")
            .unwrap()
            .is_empty());
        drop(database);
        std::fs::remove_file(path).expect("remove owned database");
    }

    #[test]
    fn user_state_round_trips_through_backup() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nanoplayer-db-{suffix}.sqlite3"));
        let backup_path = std::env::temp_dir().join(format!("nanoplayer-backup-{suffix}.sqlite3"));
        let mut database = LibraryDatabase::open(&path).expect("open database");
        database
            .save_user_state(r#"{"mode":"shuffle","volume":0.5}"#)
            .expect("save state");
        assert_eq!(
            database.snapshot().expect("snapshot").user_state.unwrap()["mode"],
            "shuffle"
        );
        database.create_backup(&backup_path).expect("create backup");
        database
            .save_user_state(r#"{"mode":"sequence"}"#)
            .expect("change state");
        database
            .restore_backup(&backup_path)
            .expect("restore backup");
        assert_eq!(
            database
                .snapshot()
                .expect("restored snapshot")
                .user_state
                .unwrap()["mode"],
            "shuffle"
        );
        drop(database);
        std::fs::remove_file(path).expect("remove owned database");
        std::fs::remove_file(backup_path).expect("remove owned backup");
    }

    #[test]
    fn artwork_is_returned_as_a_safe_data_url() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nanoplayer-artwork-{suffix}.sqlite3"));
        let database = LibraryDatabase::open(&path).expect("open database");
        database.connection.execute("INSERT INTO library_roots(id, canonical_path, display_name, created_at) VALUES (1, '/tmp/music', 'music', '0')", []).unwrap();
        database.connection.execute("INSERT INTO media_files(id, library_root_id, relative_path, size_bytes, modified_at, format) VALUES (1, 1, 'track.mp3', 1, '0', 'mp3')", []).unwrap();
        database.connection.execute("INSERT INTO tracks(id, media_file_id, title, normalized_title, duration_ms) VALUES (1, 1, 'track', 'track', 1000)", []).unwrap();
        database.connection.execute("INSERT INTO artwork_cache(track_id, content_hash, mime_type, image_data, updated_at) VALUES (1, 'hash', 'image/png', X'89504E47', '0')", []).unwrap();
        assert_eq!(
            database.artwork_data_url(1).unwrap().unwrap(),
            "data:image/png;base64,iVBORw=="
        );
        drop(database);
        std::fs::remove_file(path).expect("remove owned database");
    }

    #[test]
    fn diagnostics_exclude_personal_media_fields() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nanoplayer-diagnostics-{suffix}.sqlite3"));
        let database = LibraryDatabase::open(&path).expect("open database");
        let report = database
            .diagnostic_summary()
            .expect("diagnostics")
            .to_string();
        assert!(report.contains("databaseIntegrity"));
        for private_field in [
            "canonical_path",
            "relative_path",
            "title",
            "artist",
            "lyrics",
        ] {
            assert!(!report.contains(private_field));
        }
        drop(database);
        std::fs::remove_file(path).expect("remove owned database");
    }

    #[test]
    fn metadata_overrides_are_app_local_and_reversible() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nanoplayer-overrides-{suffix}.sqlite3"));
        let mut database = LibraryDatabase::open(&path).expect("open database");
        database.connection.execute("INSERT INTO library_roots(id, canonical_path, display_name, created_at) VALUES (1, '/tmp/music', 'music', '0')", []).unwrap();
        database.connection.execute("INSERT INTO media_files(id, library_root_id, relative_path, size_bytes, modified_at, format) VALUES (1, 1, 'track.flac', 1, '0', 'flac')", []).unwrap();
        database.connection.execute("INSERT INTO albums(id, title, normalized_title, album_artist_key) VALUES (1, 'Original Album', 'original album', 'artist')", []).unwrap();
        database.connection.execute("INSERT INTO artists(id, name, normalized_name) VALUES (1, 'Original Artist', 'original artist')", []).unwrap();
        database.connection.execute("INSERT INTO tracks(id, media_file_id, album_id, title, normalized_title, duration_ms, raw_tags_json) VALUES (1, 1, 1, 'Original Title', 'original title', 1000, '{\"genre\":\"Original Genre\"}')", []).unwrap();
        database
            .connection
            .execute(
                "INSERT INTO track_artists(track_id, artist_id, position) VALUES (1, 1, 0)",
                [],
            )
            .unwrap();
        database
            .cache_manual_lyrics(1, "synchronized", "[00:01.00]Manual line")
            .unwrap();
        let manual = database.snapshot().unwrap().tracks.remove(0);
        assert_eq!(manual.lyrics_source.as_deref(), Some("manual"));
        assert_eq!(manual.lyrics.as_deref(), Some("[00:01.00]Manual line"));
        database.clear_track_manual_lyrics(1).unwrap();
        database
            .update_track_metadata(
                1,
                &super::TrackMetadataOverride {
                    title: Some("Edited Title".into()),
                    artist: Some("Edited Artist".into()),
                    album: Some("Edited Album".into()),
                    year: Some(2026),
                    genre: Some("Edited Genre".into()),
                    composer: None,
                },
            )
            .unwrap();
        let edited = database.snapshot().unwrap().tracks.remove(0);
        assert_eq!(
            (
                edited.title.as_str(),
                edited.artist.as_str(),
                edited.album.as_str(),
                edited.genre.as_deref()
            ),
            (
                "Edited Title",
                "Edited Artist",
                "Edited Album",
                Some("Edited Genre")
            )
        );
        database.clear_track_metadata_field(1, "genre").unwrap();
        let partly_restored = database.snapshot().unwrap().tracks.remove(0);
        assert_eq!(partly_restored.title, "Edited Title");
        assert_eq!(partly_restored.genre.as_deref(), Some("Original Genre"));
        database.clear_track_metadata_override(1).unwrap();
        let original = database.snapshot().unwrap().tracks.remove(0);
        assert_eq!(
            (
                original.title.as_str(),
                original.artist.as_str(),
                original.album.as_str(),
                original.genre.as_deref()
            ),
            (
                "Original Title",
                "Original Artist",
                "Original Album",
                Some("Original Genre")
            )
        );
        drop(database);
        std::fs::remove_file(path).expect("remove owned database");
    }

    #[test]
    fn playlist_state_is_normalized_into_sqlite() {
        let suffix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nanoplayer-playlist-{suffix}.sqlite3"));
        let mut database = LibraryDatabase::open(&path).expect("open database");
        database.connection.execute("INSERT INTO library_roots(id, canonical_path, display_name, created_at) VALUES (1, '/tmp/music', 'music', '0')", []).unwrap();
        database.connection.execute("INSERT INTO media_files(id, library_root_id, relative_path, size_bytes, modified_at, format) VALUES (1, 1, 'track.flac', 1, '0', 'flac')", []).unwrap();
        database.connection.execute("INSERT INTO tracks(id, media_file_id, title, normalized_title, duration_ms) VALUES (1, 1, 'Track', 'track', 1000)", []).unwrap();
        database
            .save_user_state(r#"{"playlists":[{"id":"road","name":"Road","trackIds":[1]}]}"#)
            .unwrap();
        let name: String = database
            .connection
            .query_row(
                "SELECT name FROM playlist_records WHERE id='road'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let count: u64 = database
            .connection
            .query_row(
                "SELECT COUNT(*) FROM playlist_record_items WHERE playlist_id='road'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(name, "Road");
        assert_eq!(count, 1);
        drop(database);
        std::fs::remove_file(path).expect("remove owned database");
    }

    #[test]
    #[ignore = "explicit performance gate"]
    fn search_benchmark_10000_tracks() {
        let mut connection = rusqlite::Connection::open_in_memory().expect("memory database");
        connection
            .execute_batch(INITIAL_MIGRATION)
            .expect("create schema");
        let transaction = connection.transaction().expect("transaction");
        for index in 0..10_000 {
            transaction.execute("INSERT INTO track_search(rowid, title, artist, album, filename) VALUES (?1, ?2, 'artist', 'album', ?3)", rusqlite::params![index + 1, format!("needle track {index:05}"), format!("{index:05}.flac")]).expect("insert search row");
        }
        transaction.commit().expect("commit fixtures");
        let mut samples = Vec::new();
        for _ in 0..50 {
            let started = std::time::Instant::now();
            let count: u64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM track_search WHERE track_search MATCH 'needle'",
                    [],
                    |row| row.get(0),
                )
                .expect("search");
            assert_eq!(count, 10_000);
            samples.push(started.elapsed());
        }
        samples.sort();
        let p95 = samples[47];
        eprintln!("10,000-track FTS5 search P95: {p95:?}");
        assert!(p95 < std::time::Duration::from_millis(100));
    }
}
