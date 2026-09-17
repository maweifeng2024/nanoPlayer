use crate::{
    database::{LibraryDatabase, LibrarySnapshot, TrackMetadataOverride},
    lyrics,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

pub(crate) struct LibraryState {
    pub database: Arc<Mutex<LibraryDatabase>>,
    pub app_data_dir: PathBuf,
}
use LibraryState as AppState;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupInfo {
    path: String,
    size_bytes: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackMetadataUpdate {
    track_id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    year: Option<u32>,
    genre: Option<String>,
    composer: Option<String>,
}
#[tauri::command]
pub(crate) fn health_check() -> &'static str {
    "ok"
}

#[tauri::command]
pub(crate) fn library_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .snapshot()
}

#[tauri::command]
pub(crate) fn artwork_data_url(
    track_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .artwork_data_url(track_id)
}

#[tauri::command]
pub(crate) fn save_user_state(
    value: serde_json::Value,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .save_user_state(&value.to_string())
}

#[tauri::command]
pub(crate) fn create_database_backup(
    state: tauri::State<'_, AppState>,
) -> Result<BackupInfo, String> {
    let directory = state.app_data_dir.join("backups");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("nanoplayer-{}.sqlite3", unix_now()));
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .create_backup(&path)?;
    Ok(BackupInfo {
        size_bytes: std::fs::metadata(&path)
            .map(|value| value.len())
            .unwrap_or(0),
        path: path.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub(crate) fn restore_latest_backup(
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let path =
        latest_backup(&state.app_data_dir)?.ok_or_else(|| "还没有可恢复的数据库备份".to_owned())?;
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.restore_backup(&path)?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn storage_info(state: tauri::State<'_, AppState>) -> Result<BackupInfo, String> {
    let database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    Ok(BackupInfo {
        path: state.app_data_dir.to_string_lossy().into_owned(),
        size_bytes: database.database_size(),
    })
}

#[tauri::command]
pub(crate) fn export_diagnostics(state: tauri::State<'_, AppState>) -> Result<BackupInfo, String> {
    let directory = state.app_data_dir.join("diagnostics");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("nanoplayer-diagnostics-{}.json", unix_now()));
    let database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    let report = serde_json::json!({
        "appVersion": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "architecture": std::env::consts::ARCH,
        "generatedAt": unix_now(),
        "privacy": "No music paths, filenames, titles, artists, or lyrics are included.",
        "library": database.diagnostic_summary()?,
    });
    let bytes = serde_json::to_vec_pretty(&report).map_err(|error| error.to_string())?;
    std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;
    Ok(BackupInfo {
        path: path.to_string_lossy().into_owned(),
        size_bytes: bytes.len() as u64,
    })
}

#[tauri::command]
pub(crate) async fn search_online_lyrics(
    track_id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<lyrics::LyricsCandidate>, String> {
    let (stored_title, stored_artist, stored_album, duration) = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .track_signature(track_id)?
        .ok_or_else(|| "曲目不存在".to_owned())?;
    lyrics::LrclibProvider::new()?
        .search(
            title.as_deref().unwrap_or(&stored_title),
            artist.as_deref().unwrap_or(&stored_artist),
            album.as_deref().unwrap_or(&stored_album),
            duration,
        )
        .await
}

#[tauri::command]
pub(crate) fn choose_online_lyrics(
    track_id: i64,
    candidate: lyrics::LyricsCandidate,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let (kind, content) = if let Some(content) = candidate.synced_lyrics {
        ("synchronized", content)
    } else if let Some(content) = candidate.plain_lyrics {
        ("plain", content)
    } else {
        ("plain", "[纯音乐]".into())
    };
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.cache_online_lyrics(track_id, kind, &content, candidate.confidence)?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn clear_online_lyrics_cache(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .clear_online_lyrics_cache()
}

#[tauri::command]
pub(crate) fn clear_track_online_lyrics(
    track_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.clear_track_online_lyrics(track_id)?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn import_manual_lyrics(
    track_id: i64,
    source_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let path = PathBuf::from(source_path);
    let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > 2 * 1024 * 1024 {
        return Err("歌词必须是小于 2 MB 的 LRC 或 TXT 文件".into());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["lrc", "txt"].contains(&extension.as_str()) {
        return Err("仅支持 LRC 或 TXT 歌词文件".into());
    }
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    let content =
        String::from_utf8(bytes).map_err(|_| "歌词文件不是 UTF-8 编码，请转换后重试".to_owned())?;
    let content = content.trim_start_matches('\u{feff}').trim();
    if content.is_empty() {
        return Err("歌词文件为空".into());
    }
    let kind = if content.lines().any(|line| {
        line.trim_start().starts_with('[')
            && line
                .split_once(']')
                .is_some_and(|(tag, _)| tag.contains(':'))
    }) {
        "synchronized"
    } else {
        "plain"
    };
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.cache_manual_lyrics(track_id, kind, content)?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn clear_track_manual_lyrics(
    track_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.clear_track_manual_lyrics(track_id)?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn search_library(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<i64>, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .search_track_ids(&query)
}

#[tauri::command]
pub(crate) fn clear_artwork_cache(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .clear_artwork_cache()
}

#[tauri::command]
pub(crate) fn begin_playback_session(
    track_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<i64, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .begin_session(track_id)
}

#[tauri::command]
pub(crate) fn checkpoint_playback_session(
    session_id: i64,
    listened_ms: u64,
    counted: bool,
    end_reason: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .checkpoint_session(session_id, listened_ms, counted, end_reason.as_deref())
}

#[tauri::command]
pub(crate) fn update_track_metadata(
    update: TrackMetadataUpdate,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let clean = |value: Option<String>| {
        value
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    };
    let title = clean(update.title);
    let artist = clean(update.artist);
    let album = clean(update.album);
    let genre = clean(update.genre);
    let composer = clean(update.composer);
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.update_track_metadata(
        update.track_id,
        &TrackMetadataOverride {
            title,
            artist,
            album,
            year: update.year,
            genre,
            composer,
        },
    )?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn clear_track_metadata_override(
    track_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.clear_track_metadata_override(track_id)?;
    database.snapshot()
}

#[tauri::command]
pub(crate) fn clear_track_metadata_field(
    track_id: i64,
    field: String,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.clear_track_metadata_field(track_id, &field)?;
    database.snapshot()
}
fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn latest_backup(app_data_dir: &Path) -> Result<Option<PathBuf>, String> {
    let directory = app_data_dir.join("backups");
    let mut backups = match std::fs::read_dir(directory) {
        Ok(value) => value
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("sqlite3"))
            .collect::<Vec<_>>(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    backups.sort();
    Ok(backups.pop())
}

fn playlist_cover_data_url(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let mime = match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    Ok(format!("data:{mime};base64,{}", BASE64.encode(bytes)))
}

#[tauri::command]
pub(crate) fn set_playlist_cover(
    playlist_id: String,
    source_path: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let source = PathBuf::from(source_path);
    let metadata = std::fs::metadata(&source).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > 8 * 1024 * 1024 {
        return Err("歌单图片必须是小于 8 MB 的图片文件".into());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["jpg", "jpeg", "png", "webp", "gif"].contains(&extension.as_str()) {
        return Err("仅支持 JPG、PNG、WebP 或 GIF 图片".into());
    }
    let safe_id = playlist_id
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || *value == '-' || *value == '_')
        .collect::<String>();
    if safe_id.is_empty() {
        return Err("歌单标识无效".into());
    }
    let directory = state.app_data_dir.join("playlist-covers");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let destination = directory.join(format!("{safe_id}.{extension}"));
    std::fs::copy(&source, &destination).map_err(|error| error.to_string())?;
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .set_playlist_cover_path(&playlist_id, &destination)?;
    playlist_cover_data_url(&destination)
}

#[tauri::command]
pub(crate) fn get_playlist_cover(
    playlist_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<String>, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .playlist_cover_path(&playlist_id)?
        .map(|path| playlist_cover_data_url(&path))
        .transpose()
}

#[tauri::command]
pub(crate) fn clear_playlist_cover(
    playlist_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if let Some(path) = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .clear_playlist_cover_path(&playlist_id)?
    {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
