mod commands;
mod helpers;
mod types;

use std::sync::{Arc, Mutex};

use tauri::Manager as _;

use commands::terminal::{PtyRegistry, PtySession};
use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(Mutex::new(std::collections::HashMap::<String, PtySession>::new())) as PtyRegistry)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let registry: tauri::State<PtyRegistry> = window.state();
                let mut map = registry.lock().unwrap();
                for (_, mut session) in map.drain() {
                    let _ = session.child.kill();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            get_rad_home,
            get_identity,
            list_repos,
            list_issues,
            get_issue,
            list_patches,
            create_issue,
            edit_issue,
            label_issue,
            set_issue_state,
            add_comment,
            reply_comment,
            react_comment,
            check_gsettings,
            find_local_repo,
            create_patch_worktree,
            list_worktrees,
            open_in_editor,
            get_worktree_diff,
            get_worktree_status,
            commit_and_create_patch,
            commit_and_update_patch,
            get_head_commit_message,
            get_patch_diff,
            get_patch_detail,
            add_patch_comment,
            reply_patch_comment,
            react_patch_comment,
            review_patch,
            add_patch_line_comment,
            archive_patch,
            merge_patch,
            remove_worktree,
            create_worktree_from_patch,
            update_worktree,
            list_notifications,
            notification_count,
            mark_notifications_read,
            clear_notifications,
            resolve_ref,
            list_tree,
            read_blob,
            file_log,
            get_blame,
            count_commits,
            list_commits,
            discard_worktree_file,
            push_create_patch,
            get_patch_commits,
            get_commit_diff,
            commit_staged_files,
            uncommit_head,
            rewrite_commit_message,
            squash_commits,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
