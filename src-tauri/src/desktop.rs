use crate::{audio, scanner};

use crate::commands::{self, LibraryState};
use crate::database::{LibraryDatabase, LibrarySnapshot};
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
    database: Arc<Mutex<LibraryDatabase>>,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    root_id: Option<i64>,
    processed_files: u64,
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

fn localized_menu(
    app: &tauri::AppHandle,
    english: bool,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let tr = |zh, en| if english { en } else { zh };

    let add_folder =
        MenuItemBuilder::with_id("add-library", tr("添加音乐文件夹…", "Add Music Folder…"))
            .build(app)?;
    let new_playlist =
        MenuItemBuilder::with_id("new-playlist", tr("新建歌单…", "New Playlist…")).build(app)?;
    let search = MenuItemBuilder::with_id("search", tr("全局搜索", "Search Library"))
        .accelerator("CmdOrCtrl+K")
        .build(app)?;
    let settings = MenuItemBuilder::with_id("settings", tr("设置…", "Settings…")).build(app)?;
    let play_pause = MenuItemBuilder::with_id("play-pause", tr("播放/暂停", "Play/Pause"))
        .accelerator("Space")
        .build(app)?;
    let lyrics = MenuItemBuilder::with_id("toggle-lyrics", tr("显示/隐藏歌词", "Show/Hide Lyrics"))
        .accelerator("CmdOrCtrl+L")
        .build(app)?;
    let queue = MenuItemBuilder::with_id("toggle-queue", tr("显示/隐藏队列", "Show/Hide Queue"))
        .build(app)?;
    let app_menu = SubmenuBuilder::new(app, "nanoPlayer")
        .about_with_text(tr("关于 nanoPlayer", "About nanoPlayer"), None)
        .separator()
        .item(&settings)
        .separator()
        .hide_with_text(tr("隐藏 nanoPlayer", "Hide nanoPlayer"))
        .hide_others_with_text(tr("隐藏其他", "Hide Others"))
        .show_all_with_text(tr("显示全部", "Show All"))
        .separator()
        .quit_with_text(tr("退出 nanoPlayer", "Quit nanoPlayer"))
        .build()?;
    let file_menu = SubmenuBuilder::new(app, tr("文件", "File"))
        .items(&[&add_folder, &new_playlist])
        .separator()
        .close_window_with_text(tr("关闭窗口", "Close Window"))
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, tr("编辑", "Edit"))
        .undo_with_text(tr("撤销", "Undo"))
        .redo_with_text(tr("重做", "Redo"))
        .separator()
        .cut_with_text(tr("剪切", "Cut"))
        .copy_with_text(tr("复制", "Copy"))
        .paste_with_text(tr("粘贴", "Paste"))
        .select_all_with_text(tr("全选", "Select All"))
        .separator()
        .item(&search)
        .build()?;
    let playback_menu = SubmenuBuilder::new(app, tr("播放", "Playback"))
        .items(&[&play_pause, &lyrics, &queue])
        .build()?;
    let view_menu = SubmenuBuilder::new(app, tr("显示", "View"))
        .fullscreen_with_text(tr("切换全屏", "Toggle Full Screen"))
        .build()?;
    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &playback_menu,
            &view_menu,
        ])
        .build()
}

#[tauri::command]
fn set_interface_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    app.set_menu(localized_menu(&app, language == "en").map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .menu(|app| localized_menu(app, false))
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
            let database = Arc::new(Mutex::new(database));
            app.manage(LibraryState {
                database: database.clone(),
                app_data_dir: data_dir.clone(),
            });
            app.manage(AppState {
                database,
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
            commands::health_check,
            set_interface_language,
            commands::library_snapshot,
            commands::artwork_data_url,
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
            reveal_track_file,
            commands::set_playlist_cover,
            commands::get_playlist_cover,
            commands::clear_playlist_cover
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
