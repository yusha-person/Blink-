mod achievements;
mod commands;
mod crypto;
mod db;
mod streak;
mod xp;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let database = db::Database::connect(data_dir.join(db::DB_FILE_NAME))?;
            app.manage(database);
            app.manage(crypto::CryptoState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::schema_version,
            commands::achievements::get_achievements,
            commands::get_setting,
            commands::set_setting,
            commands::crypto::get_privacy_status,
            commands::crypto::setup_master_password,
            commands::crypto::unlock_private_notes,
            commands::crypto::lock_private_notes,
            commands::crypto::change_master_password,
            commands::crypto::set_folder_password,
            commands::crypto::remove_folder_password,
            commands::crypto::change_folder_password,
            commands::crypto::unlock_folder,
            commands::crypto::lock_folder,
            commands::crypto::reset_master_password,
            commands::data::backup_database,
            commands::data::export_data,
            commands::data::list_exports,
            commands::data::import_data,
            commands::data::reveal_path,
            commands::data::reset_statistics,
            commands::data::reset_xp,
            commands::calendar::get_calendar_month,
            commands::calendar::get_calendar_day,
            commands::habits::list_habits,
            commands::habits::complete_habit,
            commands::habits::uncomplete_habit,
            commands::habits::get_daily_totals,
            commands::habits::get_recent_activity,
            commands::habits::create_habit,
            commands::habits::update_habit,
            commands::habits::set_habit_archived,
            commands::habits::delete_habit,
            commands::journal::get_or_create_today_journal,
            commands::journal::get_journal,
            commands::journal::search_journal,
            commands::journal::update_journal,
            commands::statistics::get_xp_history,
            commands::statistics::get_habit_completion_stats,
            commands::statistics::get_habit_detail_stats,
            commands::streaks::get_streak,
            commands::xp::get_level_progress,
            commands::xp::get_xp_summary,
            commands::notes::list_folders,
            commands::notes::create_folder,
            commands::notes::rename_folder,
            commands::notes::move_folder,
            commands::notes::delete_folder,
            commands::notes::list_notes,
            commands::notes::search_notes,
            commands::notes::get_note,
            commands::notes::get_note_by_title,
            commands::notes::get_backlinks,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::move_note,
            commands::notes::set_favorite,
            commands::notes::set_note_private,
            commands::notes::trash_note,
            commands::notes::restore_note,
            commands::notes::delete_note_permanently,
            commands::notes::list_tags,
            commands::notes::set_note_tags,
            commands::tasks::list_tasks,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::set_task_completed,
            commands::tasks::delete_task,
            commands::custom_achievements::list_custom_achievements,
            commands::custom_achievements::create_custom_achievement,
            commands::custom_achievements::update_custom_achievement,
            commands::custom_achievements::delete_custom_achievement
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blink");
}
