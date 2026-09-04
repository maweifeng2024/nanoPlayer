//! Read-only directory scanning. Files are enumerated and opened for metadata
//! reads only; no write or delete operation is implemented in this module.

use crate::metadata::{read_metadata, EmbeddedArtwork, TrackMetadata};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::atomic::{AtomicBool, Ordering},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedTrack {
    pub path: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub modified_at: u64,
    pub format: String,
    pub file_identity: String,
    pub content_fingerprint: String,
    pub metadata: Option<TrackMetadata>,
    pub embedded_artwork: Option<EmbeddedArtwork>,
    pub embedded_lyrics: Option<String>,
    pub sidecar_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanIssue {
    pub path: String,
    pub category: String,
    pub detail: String,
}

#[derive(Debug, Default)]
pub struct ScanResult {
    pub tracks: Vec<ScannedTrack>,
    pub issues: Vec<ScanIssue>,
    pub cancelled: bool,
}

pub fn is_supported_extension(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "mp3" | "m4a" | "aac" | "flac" | "wav" | "ogg" | "opus" | "aiff" | "aif" | "alac"
    )
}

fn is_known_unsupported_audio(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "wma" | "ape" | "mpc" | "dsf" | "dff" | "dsd" | "cue"
    )
}

#[cfg(test)]
pub fn scan_root_with_cancel(root: &Path, cancel: &AtomicBool) -> Result<ScanResult, String> {
    scan_root_incremental(root, cancel, &HashMap::new(), |_| {})
}

pub fn scan_root_incremental<F>(
    root: &Path,
    cancel: &AtomicBool,
    known_fingerprints: &HashMap<String, String>,
    mut progress: F,
) -> Result<ScanResult, String>
where
    F: FnMut(u64),
{
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("无法访问目录：{error}"))?;
    if !canonical_root.is_dir() {
        return Err("选择的路径不是目录".into());
    }

    let mut result = ScanResult::default();
    let mut pending = vec![canonical_root.clone()];
    let mut processed = 0_u64;
    while let Some(directory) = pending.pop() {
        if cancel.load(Ordering::Relaxed) {
            result.cancelled = true;
            break;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) => {
                result
                    .issues
                    .push(issue(&directory, "permission", error.to_string()));
                continue;
            }
        };
        for entry in entries.flatten() {
            if cancel.load(Ordering::Relaxed) {
                result.cancelled = true;
                break;
            }
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(value) => value,
                Err(error) => {
                    result
                        .issues
                        .push(issue(&path, "metadata", error.to_string()));
                    continue;
                }
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                pending.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            processed += 1;
            if processed == 1 || processed % 25 == 0 {
                progress(processed);
            }
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !is_supported_extension(&extension) {
                if is_known_unsupported_audio(&extension) {
                    result.issues.push(issue(
                        &path,
                        "unsupported",
                        format!("第一版不支持 .{extension} 音频"),
                    ));
                }
                continue;
            }
            match scan_file(&canonical_root, &path, extension, known_fingerprints) {
                Ok(track) => result.tracks.push(track),
                Err(detail) => result.issues.push(issue(&path, "damaged", detail)),
            }
        }
    }
    result
        .tracks
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    progress(processed);
    Ok(result)
}

fn scan_file(
    root: &Path,
    path: &Path,
    format: String,
    known_fingerprints: &HashMap<String, String>,
) -> Result<ScannedTrack, String> {
    let file_metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified_at = file_metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let relative_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned();
    let content_fingerprint = format!(
        "{}:{}:{}",
        file_metadata.len(),
        modified_at,
        sidecar_fingerprint(path)
    );
    let unchanged = known_fingerprints.get(&relative_path) == Some(&content_fingerprint);
    let extracted = if unchanged {
        None
    } else {
        Some(read_metadata(path)?)
    };
    Ok(ScannedTrack {
        path: path.to_string_lossy().into_owned(),
        relative_path,
        size_bytes: file_metadata.len(),
        modified_at,
        format,
        file_identity: file_identity(&file_metadata, path),
        content_fingerprint,
        metadata: extracted.as_ref().map(|value| value.metadata.clone()),
        embedded_artwork: extracted.as_ref().and_then(|value| value.artwork.clone()),
        embedded_lyrics: extracted
            .as_ref()
            .and_then(|value| value.embedded_lyrics.clone()),
        sidecar_lyrics: if unchanged {
            None
        } else {
            read_sidecar_lyrics(path)
        },
    })
}

fn file_identity(_metadata: &fs::Metadata, _path: &Path) -> String {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        format!("{}:{}", _metadata.dev(), _metadata.ino())
    }
    #[cfg(not(unix))]
    {
        _path
            .canonicalize()
            .unwrap_or_else(|_| _path.to_owned())
            .to_string_lossy()
            .into_owned()
    }
}

fn read_sidecar_lyrics(audio_path: &Path) -> Option<String> {
    for extension in ["lrc", "txt"] {
        let candidate = audio_path.with_extension(extension);
        if let Ok(content) = fs::read_to_string(candidate) {
            if !content.trim().is_empty() {
                return Some(content);
            }
        }
    }
    None
}

fn sidecar_fingerprint(audio_path: &Path) -> String {
    ["lrc", "txt"]
        .iter()
        .filter_map(|extension| fs::metadata(audio_path.with_extension(extension)).ok())
        .map(|metadata| {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|value| value.as_secs())
                .unwrap_or(0);
            format!("{}:{modified}", metadata.len())
        })
        .collect::<Vec<_>>()
        .join("|")
}

fn issue(path: &Path, category: &str, detail: String) -> ScanIssue {
    ScanIssue {
        path: path.to_string_lossy().into_owned(),
        category: category.into(),
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn rejects_non_audio_extensions() {
        assert!(!is_supported_extension("exe"));
        assert!(!is_supported_extension("m3u8"));
        assert!(is_known_unsupported_audio("wma"));
    }

    #[test]
    fn damaged_audio_scan_keeps_source_bytes_unchanged() {
        let root = std::env::temp_dir().join(format!("nanoplayer-readonly-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("create fixture directory");
        let path = root.join("damaged.mp3");
        let bytes = b"not an audio file";
        std::fs::File::create(&path)
            .expect("create fixture")
            .write_all(bytes)
            .expect("write fixture");
        let result =
            scan_root_with_cancel(&root, &AtomicBool::new(false)).expect("scan should continue");
        assert!(result.tracks.is_empty());
        assert_eq!(result.issues.len(), 1);
        assert_eq!(std::fs::read(&path).expect("read after scan"), bytes);
        std::fs::remove_dir_all(root).expect("remove owned fixture directory");
    }

    #[test]
    fn cancelled_scan_stops_before_enumeration() {
        let cancel = AtomicBool::new(true);
        let result =
            scan_root_with_cancel(std::path::Path::new("."), &cancel).expect("root exists");
        assert!(result.cancelled);
        assert!(result.tracks.is_empty());
    }

    #[test]
    fn incremental_scan_skips_unchanged_metadata_reads() {
        let root =
            std::env::temp_dir().join(format!("nanoplayer-incremental-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("create fixture directory");
        let path = root.join("unchanged.mp3");
        std::fs::write(&path, b"not audio but unchanged").expect("write fixture");
        let metadata = std::fs::metadata(&path).unwrap();
        let modified = metadata
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let known = HashMap::from([(
            "unchanged.mp3".into(),
            format!("{}:{}:", metadata.len(), modified),
        )]);
        let result = scan_root_incremental(&root, &AtomicBool::new(false), &known, |_| {})
            .expect("incremental scan");
        assert!(result.issues.is_empty());
        assert_eq!(result.tracks.len(), 1);
        assert!(result.tracks[0].metadata.is_none());
        std::fs::remove_dir_all(root).expect("remove owned fixture directory");
    }
}
