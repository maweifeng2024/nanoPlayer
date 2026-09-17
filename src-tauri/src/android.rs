use crate::{
    commands::{self, LibraryState},
    database::{LibraryDatabase, LibrarySnapshot},
    metadata::{EmbeddedArtwork, TrackMetadata},
    scanner::{ScanIssue, ScanResult, ScannedTrack},
};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tauri::Manager;

async fn native(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri_plugin_nanoplayer_mobile::call(&app, payload)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn android_playback(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    let mut snapshot = native(app.clone(), payload).await?;
    let events = snapshot["events"].as_array().cloned().unwrap_or_default();
    let counts = app
        .state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .merge_native_events(&events)?;
    if !events.is_empty() {
        native(app.clone(),json!({"action":"acknowledge","events":serde_json::to_string(&events).map_err(|e|e.to_string())?})).await?;
    }
    snapshot["playCounts"] = counts;
    snapshot["lastPlayedAt"] = app
        .state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .native_last_played()?;
    snapshot
        .as_object_mut()
        .map(|object| object.remove("events"));
    Ok(snapshot)
}

async fn scan(app: tauri::AppHandle, uri: String) -> Result<(), String> {
    if !uri.starts_with("content://") {
        return Err("请选择 Android 授权文件夹".into());
    }
    let result = native(app.clone(), json!({"action":"scanTree", "uri":uri})).await?;
    if result["cancelled"].as_bool() == Some(true) {
        return Ok(());
    }
    let mut scan = ScanResult::default();
    for item in result["tracks"].as_array().ok_or("无效扫描结果")? {
        let text = |key: &str| item[key].as_str().unwrap_or_default().to_owned();
        let artist = text("artist");
        let metadata = TrackMetadata {
            title: text("title"),
            album: text("album"),
            artist: artist.clone(),
            artists: vec![artist],
            album_artist: text("albumArtist"),
            duration_ms: item["durationMs"].as_u64().unwrap_or(0),
            track_number: None,
            track_total: None,
            disc_number: None,
            disc_total: None,
            year: item["year"].as_u64().map(|n| n as u32),
            genre: None,
            bitrate: None,
            sample_rate: None,
            channels: None,
            composer: None,
            musicbrainz_recording_id: None,
        };
        scan.tracks.push(ScannedTrack {
            path: text("uri"),
            relative_path: text("documentId"),
            file_identity: text("documentId"),
            size_bytes: item["sizeBytes"].as_u64().unwrap_or(0),
            modified_at: item["modifiedAt"].as_u64().unwrap_or(0),
            format: text("format"),
            content_fingerprint: format!("{}:{}", item["sizeBytes"], item["modifiedAt"]),
            metadata: Some(metadata),
            embedded_artwork: item["artworkPath"].as_str().and_then(|path| {
                let path = std::path::Path::new(path);
                let cache = app.path().app_cache_dir().ok()?.join("scan-artwork");
                if !path.starts_with(cache) {
                    return None;
                }
                let data = std::fs::read(path).ok()?;
                let _ = std::fs::remove_file(path);
                (data.len() <= 8 * 1024 * 1024).then(|| EmbeddedArtwork {
                    mime_type: text("artworkMime"),
                    data,
                })
            }),
            embedded_lyrics: None,
            sidecar_lyrics: item["lyrics"].as_str().map(str::to_owned),
        });
    }
    if let Some(issues) = result["issues"].as_array() {
        for issue in issues {
            scan.issues.push(ScanIssue {
                path: issue["uri"].as_str().unwrap_or_default().into(),
                category: "metadata".into(),
                detail: issue["detail"].as_str().unwrap_or_default().into(),
            });
        }
    }
    app.state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .upsert_source_scan(&uri, result["name"].as_str().unwrap_or("音乐文件夹"), scan)
}

#[tauri::command]
async fn add_library_roots(
    paths: Vec<String>,
    app: tauri::AppHandle,
) -> Result<LibrarySnapshot, String> {
    for uri in paths {
        scan(app.clone(), uri).await?;
    }
    app.state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .snapshot()
}
#[tauri::command]
async fn rescan_library_root(
    root_id: i64,
    app: tauri::AppHandle,
) -> Result<LibrarySnapshot, String> {
    let uri = app
        .state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .root_path(root_id)?
        .ok_or("文件夹不存在")?;
    if let Err(error) = scan(app.clone(), uri).await {
        app.state::<LibraryState>()
            .database
            .lock()
            .map_err(|e| e.to_string())?
            .mark_root_unavailable(root_id, &error)?;
    }
    app.state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .snapshot()
}
#[tauri::command]
async fn remove_library_root(
    root_id: i64,
    app: tauri::AppHandle,
) -> Result<LibrarySnapshot, String> {
    let uri = app
        .state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .root_path(root_id)?
        .ok_or("文件夹不存在")?;
    native(app.clone(), json!({"action":"removeTree","uri":uri})).await?;
    let state = app.state::<LibraryState>();
    let mut db = state.database.lock().map_err(|e| e.to_string())?;
    db.remove_root(root_id)?;
    db.snapshot()
}
#[tauri::command]
async fn cancel_scan(app: tauri::AppHandle) -> Result<Value, String> {
    native(app, json!({"action":"cancelScan"})).await
}
#[tauri::command]
fn set_interface_language(language: String) {
    let _ = language;
}

#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_nanoplayer_mobile::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = LibraryDatabase::open(&dir.join("library.sqlite3"))
                .map_err(std::io::Error::other)?;
            app.manage(LibraryState {
                database: Arc::new(Mutex::new(db)),
                app_data_dir: dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_playlist_cover,
            commands::get_playlist_cover,
            commands::clear_playlist_cover,
            commands::health_check,
            commands::library_snapshot,
            commands::artwork_data_url,
            commands::save_user_state,
            commands::create_database_backup,
            commands::restore_latest_backup,
            commands::storage_info,
            commands::export_diagnostics,
            commands::search_online_lyrics,
            commands::choose_online_lyrics,
            commands::clear_online_lyrics_cache,
            commands::clear_track_online_lyrics,
            commands::import_manual_lyrics,
            commands::clear_track_manual_lyrics,
            commands::search_library,
            commands::clear_artwork_cache,
            commands::begin_playback_session,
            commands::checkpoint_playback_session,
            commands::update_track_metadata,
            commands::clear_track_metadata_override,
            commands::clear_track_metadata_field,
            android_playback,
            add_library_roots,
            rescan_library_root,
            remove_library_root,
            cancel_scan,
            set_interface_language
        ])
        .build(tauri::generate_context!())
        .expect("failed to build nanoPlayer Android")
        .run(|_, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
