mod audio;
mod database;
pub mod lyrics;
mod metadata;
mod scanner;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use database::{LibraryDatabase, LibrarySnapshot, TrackMetadataOverride};
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, WindowEvent};

struct AppState {
    database: Mutex<LibraryDatabase>,
    audio: Mutex<Option<audio::AudioEngine>>,
    watcher: Mutex<notify::RecommendedWatcher>,
    scan_cancel: Arc<AtomicBool>,
    app_data_dir: PathBuf,
    window_placement: Mutex<WindowPlacement>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowPlacement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl Default for WindowPlacement {
    fn default() -> Self {
        Self {
            x: 80,
            y: 80,
            width: 1200,
            height: 760,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupInfo {
    path: String,
    size_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    root_id: Option<i64>,
    processed_files: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrackMetadataUpdate {
    track_id: i64,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    year: Option<u32>,
    genre: Option<String>,
    composer: Option<String>,
}

#[tauri::command]
fn health_check() -> &'static str {
    "ok"
}

#[tauri::command]
fn library_snapshot(state: tauri::State<'_, AppState>) -> Result<LibrarySnapshot, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .snapshot()
}

#[tauri::command]
fn artwork_data_url(
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
async fn add_library_roots(
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<LibrarySnapshot, String> {
    state.scan_cancel.store(false, Ordering::Relaxed);
    for path in paths {
        let root = PathBuf::from(path);
        let cancel = state.scan_cancel.clone();
        let progress_app = app.clone();
        let scan = tauri::async_runtime::spawn_blocking({
            let root = root.clone();
            move || {
                scanner::scan_root_incremental(
                    &root,
                    &cancel,
                    &std::collections::HashMap::new(),
                    |processed_files| {
                        let _ = progress_app.emit(
                            "scan-progress",
                            ScanProgress {
                                root_id: None,
                                processed_files,
                            },
                        );
                    },
                )
            }
        })
        .await
        .map_err(|error| error.to_string())??;
        if scan.cancelled {
            break;
        }
        state
            .database
            .lock()
            .map_err(|_| "资料库锁已损坏".to_owned())?
            .upsert_scan(&root, scan)?;
        let canonical = root.canonicalize().map_err(|error| error.to_string())?;
        state
            .watcher
            .lock()
            .map_err(|_| "文件监听器锁已损坏".to_owned())?
            .watch(&canonical, RecursiveMode::Recursive)
            .map_err(|error| error.to_string())?;
    }
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .snapshot()
}

#[tauri::command]
async fn rescan_library_root(
    root_id: i64,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<LibrarySnapshot, String> {
    let path = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .root_path(root_id)?
        .ok_or_else(|| "资料库目录不存在".to_owned())?;
    let root = PathBuf::from(path);
    let known = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .root_fingerprints(root_id)?;
    state.scan_cancel.store(false, Ordering::Relaxed);
    let cancel = state.scan_cancel.clone();
    let progress_app = app.clone();
    let scan_result = tauri::async_runtime::spawn_blocking({
        let root = root.clone();
        move || {
            scanner::scan_root_incremental(&root, &cancel, &known, |processed_files| {
                let _ = progress_app.emit(
                    "scan-progress",
                    ScanProgress {
                        root_id: Some(root_id),
                        processed_files,
                    },
                );
            })
        }
    })
    .await
    .map_err(|error| error.to_string())?;
    let scan = match scan_result {
        Ok(scan) => scan,
        Err(error) => {
            let mut database = state
                .database
                .lock()
                .map_err(|_| "资料库锁已损坏".to_owned())?;
            database.mark_root_unavailable(root_id, &error)?;
            return database.snapshot();
        }
    };
    if scan.cancelled {
        return state
            .database
            .lock()
            .map_err(|_| "资料库锁已损坏".to_owned())?
            .snapshot();
    }
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.upsert_scan(&root, scan)?;
    database.snapshot()
}

#[tauri::command]
fn cancel_scan(state: tauri::State<'_, AppState>) {
    state.scan_cancel.store(true, Ordering::Relaxed);
}

#[tauri::command]
fn save_user_state(
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
fn create_database_backup(state: tauri::State<'_, AppState>) -> Result<BackupInfo, String> {
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
fn restore_latest_backup(state: tauri::State<'_, AppState>) -> Result<LibrarySnapshot, String> {
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
fn storage_info(state: tauri::State<'_, AppState>) -> Result<BackupInfo, String> {
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
fn export_diagnostics(state: tauri::State<'_, AppState>) -> Result<BackupInfo, String> {
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
async fn search_online_lyrics(
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
fn choose_online_lyrics(
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
fn clear_online_lyrics_cache(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .clear_online_lyrics_cache()
}

#[tauri::command]
fn clear_track_online_lyrics(
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
fn import_manual_lyrics(
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
fn clear_track_manual_lyrics(
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
fn search_library(query: String, state: tauri::State<'_, AppState>) -> Result<Vec<i64>, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .search_track_ids(&query)
}

#[tauri::command]
fn clear_artwork_cache(state: tauri::State<'_, AppState>) -> Result<u64, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .clear_artwork_cache()
}

#[tauri::command]
fn begin_playback_session(track_id: i64, state: tauri::State<'_, AppState>) -> Result<i64, String> {
    state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .begin_session(track_id)
}

#[tauri::command]
fn checkpoint_playback_session(
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
fn remove_library_root(
    root_id: i64,
    state: tauri::State<'_, AppState>,
) -> Result<LibrarySnapshot, String> {
    let root_path = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .root_path(root_id)?
        .map(PathBuf::from);
    let mut database = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?;
    database.remove_root(root_id)?;
    let snapshot = database.snapshot()?;
    drop(database);
    if let Some(path) = root_path {
        let _ = state
            .watcher
            .lock()
            .map_err(|_| "文件监听器锁已损坏".to_owned())?
            .unwatch(&path);
    }
    Ok(snapshot)
}

#[tauri::command]
fn playback_load(
    track_id: i64,
    start_ms: u64,
    volume: f32,
    autoplay: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .track_path(track_id)?
        .ok_or_else(|| "音频文件当前不可用".to_owned())?;
    let mut audio = state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?;
    if audio.is_none() {
        *audio = Some(audio::AudioEngine::new()?);
    }
    audio.as_ref().expect("audio initialized").load(
        std::path::Path::new(&path),
        start_ms,
        volume,
        autoplay,
    )
}

#[tauri::command]
fn playback_pause(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(audio) = state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?
        .as_ref()
    {
        audio.pause();
    }
    Ok(())
}

#[tauri::command]
fn playback_resume(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(audio) = state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?
        .as_ref()
    {
        audio.resume();
    }
    Ok(())
}

#[tauri::command]
fn playback_seek(position_ms: u64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(audio) = state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?
        .as_ref()
    {
        audio.seek(position_ms)?;
    }
    Ok(())
}

#[tauri::command]
fn playback_volume(volume: f32, state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(audio) = state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?
        .as_ref()
    {
        audio.set_volume(volume);
    }
    Ok(())
}

#[tauri::command]
fn playback_status(
    state: tauri::State<'_, AppState>,
) -> Result<Option<audio::PlaybackStatus>, String> {
    Ok(state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?
        .as_ref()
        .map(audio::AudioEngine::status))
}

#[tauri::command]
fn playback_output_devices() -> Result<Vec<audio::AudioOutput>, String> {
    audio::output_devices()
}

#[tauri::command]
fn playback_refresh_output(
    track_id: Option<i64>,
    start_ms: u64,
    volume: f32,
    playing: bool,
    output_name: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = match track_id {
        Some(track_id) => state
            .database
            .lock()
            .map_err(|_| "资料库锁已损坏".to_owned())?
            .track_path(track_id)?,
        None => None,
    };
    let mut audio = state
        .audio
        .lock()
        .map_err(|_| "播放器锁已损坏".to_owned())?;
    let engine = match output_name {
        Some(name) if !name.is_empty() => audio::AudioEngine::for_output(&name)?,
        _ => audio::AudioEngine::new()?,
    };
    if let Some(path) = path {
        engine.load(Path::new(&path), start_ms, volume, playing)?;
    }
    *audio = Some(engine);
    Ok(())
}

#[tauri::command]
fn update_track_metadata(
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
fn clear_track_metadata_override(
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
fn clear_track_metadata_field(
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

#[tauri::command]
fn reveal_track_file(track_id: i64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let path = state
        .database
        .lock()
        .map_err(|_| "资料库锁已损坏".to_owned())?
        .track_path(track_id)?
        .ok_or_else(|| "曲目文件不可用".to_owned())?;
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("曲目文件已移动或不可用".into());
    }
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .status();
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .status();
    #[cfg(target_os = "linux")]
    let status = std::process::Command::new("xdg-open")
        .arg(path.parent().ok_or_else(|| "无法定位文件目录".to_owned())?)
        .status();
    let status = status.map_err(|error| format!("无法打开文件管理器：{error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("文件管理器未能显示该曲目".into())
    }
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
fn set_playlist_cover(
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
fn get_playlist_cover(
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
fn clear_playlist_cover(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .menu(|app| {
            let add_folder = MenuItemBuilder::with_id("add-library", "添加音乐文件夹…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let new_playlist = MenuItemBuilder::with_id("new-playlist", "新建歌单…")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let search = MenuItemBuilder::with_id("search", "全局搜索")
                .accelerator("CmdOrCtrl+K")
                .build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "设置…")
                .accelerator("CmdOrCtrl+Comma")
                .build(app)?;
            let play_pause = MenuItemBuilder::with_id("play-pause", "播放/暂停")
                .accelerator("Space")
                .build(app)?;
            let lyrics = MenuItemBuilder::with_id("toggle-lyrics", "显示/隐藏歌词")
                .accelerator("CmdOrCtrl+L")
                .build(app)?;
            let queue = MenuItemBuilder::with_id("toggle-queue", "显示/隐藏队列")
                .accelerator("CmdOrCtrl+Shift+Q")
                .build(app)?;
            let app_menu = SubmenuBuilder::new(app, "nanoPlayer")
                .about(None)
                .separator()
                .item(&settings)
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let file_menu = SubmenuBuilder::new(app, "文件")
                .items(&[&add_folder, &new_playlist])
                .separator()
                .close_window()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "编辑")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .separator()
                .item(&search)
                .build()?;
            let playback_menu = SubmenuBuilder::new(app, "播放")
                .items(&[&play_pause, &lyrics, &queue])
                .build()?;
            let view_menu = SubmenuBuilder::new(app, "显示").fullscreen().build()?;
            MenuBuilder::new(app)
                .items(&[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &playback_menu,
                    &view_menu,
                ])
                .build()
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("native-menu", event.id().as_ref());
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::Moved(position) => update_window_position(window, *position),
                WindowEvent::Resized(size) => update_window_size(window, *size),
                WindowEvent::CloseRequested { api, .. } => {
                    persist_window_placement(window.app_handle());
                    #[cfg(target_os = "macos")]
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                    #[cfg(not(target_os = "macos"))]
                    let _ = api;
                }
                _ => {}
            }
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let window_placement = load_window_placement(&data_dir);
            let database = LibraryDatabase::open(&data_dir.join("library.sqlite3"))
                .map_err(std::io::Error::other)?;
            let app_handle = app.handle().clone();
            let mut watcher =
                notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                    if event.is_ok() {
                        let _ = app_handle.emit("library-changed", ());
                    }
                })?;
            for path in database.root_paths().map_err(std::io::Error::other)? {
                let _ = watcher.watch(&path, RecursiveMode::Recursive);
            }
            app.manage(AppState {
                database: Mutex::new(database),
                audio: Mutex::new(None),
                watcher: Mutex::new(watcher),
                scan_cancel: Arc::new(AtomicBool::new(false)),
                app_data_dir: data_dir,
                window_placement: Mutex::new(window_placement),
            });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_size(PhysicalSize::new(
                    window_placement.width.max(720),
                    window_placement.height.max(560),
                ));
                let _ = window.set_position(PhysicalPosition::new(
                    window_placement.x,
                    window_placement.y,
                ));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            health_check,
            library_snapshot,
            artwork_data_url,
            add_library_roots,
            rescan_library_root,
            remove_library_root,
            playback_load,
            playback_pause,
            playback_resume,
            playback_seek,
            playback_volume,
            playback_status,
            playback_refresh_output,
            playback_output_devices,
            cancel_scan,
            save_user_state,
            create_database_backup,
            restore_latest_backup,
            storage_info,
            export_diagnostics,
            search_online_lyrics,
            choose_online_lyrics,
            clear_online_lyrics_cache,
            clear_track_online_lyrics,
            import_manual_lyrics,
            clear_track_manual_lyrics,
            search_library,
            clear_artwork_cache,
            begin_playback_session,
            checkpoint_playback_session,
            update_track_metadata,
            clear_track_metadata_override,
            clear_track_metadata_field,
            reveal_track_file,
            set_playlist_cover,
            get_playlist_cover,
            clear_playlist_cover
        ])
        .build(tauri::generate_context!())
        .expect("failed to build nanoPlayer");
    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } => persist_window_placement(app_handle),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    });
}

fn window_placement_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("window-placement.json")
}

fn load_window_placement(app_data_dir: &Path) -> WindowPlacement {
    std::fs::read(window_placement_path(app_data_dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .filter(|placement: &WindowPlacement| placement.width >= 720 && placement.height >= 560)
        .unwrap_or_default()
}

fn update_window_position(window: &tauri::Window, position: PhysicalPosition<i32>) {
    if let Some(state) = window.app_handle().try_state::<AppState>() {
        if let Ok(mut placement) = state.window_placement.lock() {
            placement.x = position.x;
            placement.y = position.y;
        }
    }
}

fn update_window_size(window: &tauri::Window, size: PhysicalSize<u32>) {
    if let Some(state) = window.app_handle().try_state::<AppState>() {
        if let Ok(mut placement) = state.window_placement.lock() {
            placement.width = size.width.max(720);
            placement.height = size.height.max(560);
        }
    }
}

fn persist_window_placement(app_handle: &tauri::AppHandle) {
    let Some(state) = app_handle.try_state::<AppState>() else {
        return;
    };
    let Ok(mut placement) = state.window_placement.lock() else {
        return;
    };
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Ok(position) = window.outer_position() {
            placement.x = position.x;
            placement.y = position.y;
        }
        if let Ok(size) = window.outer_size() {
            placement.width = size.width.max(720);
            placement.height = size.height.max(560);
        }
    }
    let Ok(bytes) = serde_json::to_vec_pretty(&*placement) else {
        return;
    };
    let path = window_placement_path(&state.app_data_dir);
    let temporary = path.with_extension("json.tmp");
    if std::fs::write(&temporary, bytes).is_ok() {
        let _ = std::fs::rename(temporary, path);
    }
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
