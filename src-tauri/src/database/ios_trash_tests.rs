use super::*;

#[test]
fn trash_tombstones_restore_stable_ids_and_user_data_after_missing_scan() {
    let mut connection = Connection::open_in_memory().unwrap();
    migrate_database(&mut connection).unwrap();
    let root = if cfg!(windows) { "C:/Music" } else { "/Music" };
    connection.execute("INSERT INTO library_roots(id,canonical_path,display_name,created_at) VALUES(1,?1,'Music','original')", [root]).unwrap();
    connection.execute_batch("INSERT INTO media_files(id,library_root_id,relative_path,size_bytes,modified_at,format) VALUES(1,1,'Inbox/a.wav',44,'1','wav');
      INSERT INTO albums(id,title,normalized_title,album_artist_key) VALUES(1,'Album','album','artist');
      INSERT INTO tracks(id,media_file_id,album_id,title,normalized_title,duration_ms) VALUES(41,1,1,'Song','song',2000);").unwrap();
    let mut database = LibraryDatabase {
        connection,
        path: std::path::PathBuf::new(),
    };
    database.save_user_state(r#"{"ratings":{"41":5},"playCounts":{"41":7},"playlists":[{"id":"fixture","name":"Test","trackIds":[41]}]}"#).unwrap();
    let to_trash = std::collections::HashMap::from([(
        format!("{root}/Inbox"),
        format!("{root}/.nanoplayer-trash/fixture"),
    )]);
    database.relocate_mobile_paths(&to_trash).unwrap();
    database.relocate_mobile_paths(&to_trash).unwrap();
    // A subsequent Music scan sees no trashed files, but keeps their persistent rows.
    database
        .connection
        .execute(
            "UPDATE media_files SET availability='missing' WHERE id=1",
            [],
        )
        .unwrap();
    assert!(database.snapshot().unwrap().tracks.is_empty());
    assert_eq!(
        database.snapshot().unwrap().playlists[0].track_ids,
        vec![41]
    );
    let restore = std::collections::HashMap::from([(
        format!("{root}/.nanoplayer-trash/fixture"),
        format!("{root}/Inbox（2）"),
    )]);
    database.relocate_mobile_paths(&restore).unwrap();
    database.relocate_mobile_paths(&restore).unwrap();
    database
        .connection
        .execute(
            "UPDATE media_files SET availability='available' WHERE id=1",
            [],
        )
        .unwrap();
    let snapshot = database.snapshot().unwrap();
    assert_eq!(snapshot.tracks[0].id, 41);
    assert_eq!(snapshot.tracks[0].path, format!("{root}/Inbox（2）/a.wav"));
    assert_eq!(snapshot.playlists[0].track_ids, vec![41]);
    let saved = snapshot.user_state.unwrap();
    assert_eq!(saved["ratings"]["41"], 5);
    assert_eq!(saved["playCounts"]["41"], 7);
}
