use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, Manager, Runtime};

struct Mobile<R: Runtime>(PluginHandle<R>);

#[tauri::command]
async fn dispatch<R: Runtime>(app: tauri::AppHandle<R>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Mobile<R>>().0.run_mobile_plugin("dispatch", payload).map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nanoplayer-mobile")
        .invoke_handler(tauri::generate_handler![dispatch])
        .setup(|app, api| {
            let handle = api.register_android_plugin("app.nanoplayer.mobile", "NanoPlayerPlugin")?;
            app.manage(Mobile(handle));
            Ok(())
        }).build()
}

pub fn call<R: Runtime>(app: &tauri::AppHandle<R>, payload: serde_json::Value) -> Result<serde_json::Value, String> {
    app.state::<Mobile<R>>().0.run_mobile_plugin("dispatch", payload).map_err(|e| e.to_string())
}
