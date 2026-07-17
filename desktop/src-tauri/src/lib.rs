use tauri::Manager;

mod ai;
mod db;
mod logging;
mod pos_engine;
mod recipe_engine;
mod scenario_runner;
mod server;
mod settings;
mod sync;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = app.path().app_data_dir().expect("failed to resolve app data dir");

            tauri::async_runtime::spawn(async move {
                match db::Database::connect(&data_dir).await {
                    Ok(database) => {
                        if let Err(e) = database.run_migrations().await {
                            tracing::error!("database migration failed: {}", e);
                            return;
                        }

                        // Start the sync engine
                        let sync_handle = {
                            use sync::RemoteApi;
                            let mock: std::sync::Arc<dyn RemoteApi> = std::sync::Arc::new(sync::mock::MockRemoteApi::new());
                            let config = sync::SyncConfig {
                                cafe_id: "default".to_string(),
                                auto_sync: true,
                                sync_interval_ms: 30_000,
                                batch_size: 25,
                                ..Default::default()
                            };
                            let engine = sync::SyncEngine::new(database.clone(), mock, config);
                            match engine.start().await {
                                Ok(handle) => {
                                    tracing::info!("sync engine started");
                                    Some(handle)
                                }
                                Err(e) => {
                                    tracing::warn!("failed to start sync engine: {}", e);
                                    None
                                }
                            }
                        };

                        // Initialize AI engine
                        let ai_engine = Some(ai::AiEngine::new("http://localhost:5112"));

                        let router = server::build_router(database.clone(), sync_handle, ai_engine);
                        let listener = tokio::net::TcpListener::bind("127.0.0.1:5112").await;

                        match listener {
                            Ok(listener) => {
                                tracing::info!("local API server started on 127.0.0.1:5112");
                                if let Err(e) = axum::serve(listener, router).await {
                                    tracing::error!("server error: {}", e);
                                }
                            }
                            Err(e) => {
                                tracing::error!("failed to bind local server: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::error!("database connection failed: {}", e);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sonex Desktop");
}
