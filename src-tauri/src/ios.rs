use crate::{
    commands::{self, LibraryState},
    database::{LibraryDatabase, LibrarySnapshot},
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
async fn ios_native(app: tauri::AppHandle, payload: Value) -> Result<Value, String> {
    let action = payload["action"].as_str().unwrap_or_default().to_owned();
    if [
        "libraryRebase",
        "libraryPendingMoves",
        "libraryAckMoves",
        "restorePaths",
        "acknowledgePaths",
        "authorizePath",
        "removeTree",
        "stageOpen",
    ]
    .contains(&action.as_str())
    {
        return Err("Internal iOS action".into());
    }
    let mut snapshot = native(app.clone(), payload).await?;
    if action == "pickTree" {
        let mappings = native(app.clone(), json!({"action":"libraryPendingMoves"})).await?;
        apply_moves(
            &app,
            &serde_json::from_value(mappings).map_err(|e| e.to_string())?,
        )
        .await?;
        return Ok(snapshot);
    }
    if ["libraryMove", "libraryRename"].contains(&action.as_str()) {
        if let Some(value) = snapshot.get("mappings") {
            let mappings: std::collections::HashMap<String, String> =
                serde_json::from_value(value.clone()).map_err(|e| e.to_string())?;
            apply_moves(&app, &mappings).await?;
        }
        return Ok(snapshot);
    }
    if ![
        "snapshot",
        "sleepTimer",
        "setQueue",
        "updateQueue",
        "play",
        "pause",
        "seek",
        "next",
        "previous",
        "shuffle",
        "repeat",
        "volume",
    ]
    .contains(&action.as_str())
    {
        return Ok(snapshot);
    }
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

struct ScanState(std::sync::atomic::AtomicBool);

async fn apply_moves(
    app: &tauri::AppHandle,
    mappings: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    app.state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .relocate_mobile_paths(mappings)?;
    native(app.clone(), json!({"action":"libraryRebase", "events":serde_json::to_string(mappings).map_err(|e|e.to_string())?})).await?;
    native(app.clone(), json!({"action":"libraryAckMoves"})).await?;
    Ok(())
}

#[tauri::command]
async fn library_snapshot(app: tauri::AppHandle) -> Result<LibrarySnapshot, String> {
    let paths = native(app.clone(), json!({"action":"restorePaths"})).await?;
    if let Some(mappings) = paths.as_object() {
        let state = app.state::<LibraryState>();
        let mut db = state.database.lock().map_err(|e| e.to_string())?;
        for (previous, current) in mappings {
            if let Some(current) = current.as_str() {
                db.rebase_mobile_root(previous, current)?;
            }
        }
    }
    native(
        app.clone(),
        json!({"action":"libraryRebase", "events":paths.to_string()}),
    )
    .await?;
    native(app.clone(), json!({"action":"acknowledgePaths"})).await?;
    let moves = native(app.clone(), json!({"action":"libraryPendingMoves"})).await?;
    let mappings = serde_json::from_value(moves).map_err(|e| e.to_string())?;
    apply_moves(&app, &mappings).await?;
    app.state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .snapshot()
}

async fn scan(
    app: tauri::AppHandle,
    uri: String,
    known: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let authorization = native(app.clone(), json!({"action":"authorizePath", "uri":uri})).await?;
    let name = authorization["name"].as_str().unwrap_or("Music").to_owned();
    let index_paths: Option<Vec<String>> =
        serde_json::from_value(authorization["indexPaths"].clone()).map_err(|e| e.to_string())?;
    app.state::<ScanState>()
        .0
        .store(false, std::sync::atomic::Ordering::Relaxed);
    let scan_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Emitter;
        let mut scan = crate::scanner::scan_root_incremental(
            std::path::Path::new(&uri),
            &scan_app.state::<ScanState>().0,
            &known,
            |processed_files| {
                let _ = scan_app.emit("scan-progress", json!({"processedFiles":processed_files}));
            },
        )?;
        if let Some(paths) = index_paths {
            scan.tracks.retain(|track| {
                paths.iter().any(|path| {
                    path.is_empty()
                        || track.relative_path == *path
                        || track.relative_path.starts_with(&format!("{path}/"))
                })
            });
        }
        if !scan.cancelled {
            scan_app
                .state::<LibraryState>()
                .database
                .lock()
                .map_err(|e| e.to_string())?
                .upsert_source_scan(&uri, &name, scan)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn add_library_roots(
    paths: Vec<String>,
    app: tauri::AppHandle,
) -> Result<LibrarySnapshot, String> {
    for uri in paths {
        scan(app.clone(), uri, std::collections::HashMap::new()).await?;
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
    let known = app
        .state::<LibraryState>()
        .database
        .lock()
        .map_err(|e| e.to_string())?
        .root_fingerprints(root_id)?;
    if let Err(error) = scan(app.clone(), uri, known).await {
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
    app.state::<ScanState>()
        .0
        .store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(json!({}))
}
#[tauri::command]
fn set_interface_language(language: String) {
    let _ = language;
}

#[tauri::mobile_entry_point]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_nanoplayer_mobile::init())
        .setup(|app| {
            app.manage(ScanState(std::sync::atomic::AtomicBool::new(false)));
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
            library_snapshot,
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
            ios_native,
            add_library_roots,
            rescan_library_root,
            remove_library_root,
            cancel_scan,
            set_interface_language
        ])
        .build(tauri::generate_context!())
        .expect("failed to build nanoPlayer iOS")
        .run(|app, event| {
            if let tauri::RunEvent::Opened { urls } = event {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    use tauri::Emitter;
                    let paths: Vec<String> = urls
                        .into_iter()
                        .filter(|url| url.scheme() == "file")
                        .map(|url| url.to_string())
                        .collect();
                    if let Err(error) =
                        native(app.clone(), json!({"action":"stageOpen", "paths":paths})).await
                    {
                        let _ = app.emit("ios-open-error", error);
                    } else {
                        let _ = app.emit("ios-open-files", ());
                    }
                });
            }
        });
}
