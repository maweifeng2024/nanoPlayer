import { invoke } from "@tauri-apps/api/core";
import type {
  LibrarySnapshot,
  LyricsCandidate,
  LyricsSearchInput,
  TrackMetadataUpdate,
} from "./domain";

export const isTauri = () => "__TAURI_INTERNALS__" in window;
export const getLibrarySnapshot = () => invoke<LibrarySnapshot>("library_snapshot");
export const getArtworkDataUrl = (trackId: number) =>
  invoke<string | null>("artwork_data_url", { trackId });
export const addLibraryRoots = (paths: string[]) =>
  invoke<LibrarySnapshot>("add_library_roots", { paths });
export const rescanLibraryRoot = (rootId: number) =>
  invoke<LibrarySnapshot>("rescan_library_root", { rootId });
export const removeLibraryRoot = (rootId: number) =>
  invoke<LibrarySnapshot>("remove_library_root", { rootId });
export const cancelScan = () => invoke<void>("cancel_scan");
export const saveUserState = (value: Record<string, unknown>) =>
  invoke<void>("save_user_state", { value });
export const createDatabaseBackup = () =>
  invoke<{ path: string; sizeBytes: number }>("create_database_backup");
export const restoreLatestBackup = () => invoke<LibrarySnapshot>("restore_latest_backup");
export const getStorageInfo = () => invoke<{ path: string; sizeBytes: number }>("storage_info");
export const exportDiagnostics = () =>
  invoke<{ path: string; sizeBytes: number }>("export_diagnostics");
export const searchOnlineLyrics = (trackId: number, input?: LyricsSearchInput) =>
  invoke<LyricsCandidate[]>("search_online_lyrics", { trackId, ...input });
export const chooseOnlineLyrics = (trackId: number, candidate: LyricsCandidate) =>
  invoke<LibrarySnapshot>("choose_online_lyrics", { trackId, candidate });
export const clearOnlineLyricsCache = () => invoke<number>("clear_online_lyrics_cache");
export const clearTrackOnlineLyrics = (trackId: number) =>
  invoke<LibrarySnapshot>("clear_track_online_lyrics", { trackId });
export const importManualLyrics = (trackId: number, sourcePath: string) =>
  invoke<LibrarySnapshot>("import_manual_lyrics", { trackId, sourcePath });
export const clearTrackManualLyrics = (trackId: number) =>
  invoke<LibrarySnapshot>("clear_track_manual_lyrics", { trackId });
export const searchLibrary = (query: string) => invoke<number[]>("search_library", { query });
export const clearArtworkCache = () => invoke<number>("clear_artwork_cache");
export const beginPlaybackSession = (trackId: number) =>
  invoke<number>("begin_playback_session", { trackId });
export const checkpointPlaybackSession = (
  sessionId: number,
  listenedMs: number,
  counted: boolean,
  endReason?: string,
) => invoke<void>("checkpoint_playback_session", { sessionId, listenedMs, counted, endReason });
export const getAudioOutputs = () =>
  invoke<{ name: string; isDefault: boolean }[]>("playback_output_devices");
export const refreshAudioOutput = (
  trackId: number | undefined,
  startMs: number,
  volume: number,
  playing: boolean,
  outputName?: string,
) => invoke<void>("playback_refresh_output", { trackId, startMs, volume, playing, outputName });
export const getPlaybackStatus = () =>
  invoke<{ positionMs: number; paused: boolean; empty: boolean } | null>("playback_status");
export const updateTrackMetadata = (trackId: number, value: TrackMetadataUpdate) =>
  invoke<LibrarySnapshot>("update_track_metadata", { update: { trackId, ...value } });
export const clearTrackMetadataOverride = (trackId: number) =>
  invoke<LibrarySnapshot>("clear_track_metadata_override", { trackId });
export const clearTrackMetadataField = (trackId: number, field: keyof TrackMetadataUpdate) =>
  invoke<LibrarySnapshot>("clear_track_metadata_field", { trackId, field });
export const revealTrackFile = (trackId: number) => invoke<void>("reveal_track_file", { trackId });
export const setPlaylistCover = (playlistId: string, sourcePath: string) =>
  invoke<string>("set_playlist_cover", { playlistId, sourcePath });
export const getPlaylistCover = (playlistId: string) =>
  invoke<string | null>("get_playlist_cover", { playlistId });
export const clearPlaylistCover = (playlistId: string) =>
  invoke<void>("clear_playlist_cover", { playlistId });
