//! Read-only audio metadata extraction and normalization.

use lofty::{
    file::{AudioFile, TaggedFileExt},
    read_from_path,
    tag::{Accessor, ItemKey},
};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct EmbeddedArtwork {
    pub mime_type: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct MetadataRead {
    pub metadata: TrackMetadata,
    pub artwork: Option<EmbeddedArtwork>,
    pub embedded_lyrics: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TrackMetadata {
    pub title: String,
    pub album: String,
    pub artist: String,
    pub artists: Vec<String>,
    pub album_artist: String,
    pub duration_ms: u64,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
    pub composer: Option<String>,
    pub musicbrainz_recording_id: Option<String>,
}

/// Normalize display values without changing the source audio or cached raw tags.
pub fn display_text(value: &str, fallback: &str) -> String {
    let text = value.trim();
    if text.is_empty() {
        fallback.to_owned()
    } else {
        text.to_owned()
    }
}

pub fn filename_title(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("未知曲目")
        .to_owned()
}

pub fn read_metadata(path: &Path) -> Result<MetadataRead, String> {
    let tagged = read_from_path(path).map_err(|error| error.to_string())?;
    let properties = tagged.properties();
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let fallback_title = filename_title(path);
    let artist = display_text(
        &tag.and_then(|value| value.artist().map(|v| v.into_owned()))
            .unwrap_or_default(),
        "未知艺术家",
    );
    let mut artists = tag
        .map(|value| {
            value
                .get_strings(ItemKey::TrackArtist)
                .chain(value.get_strings(ItemKey::TrackArtists))
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if artists.is_empty() {
        artists.push(artist.clone());
    }
    artists.dedup_by(|left, right| left.eq_ignore_ascii_case(right));

    let metadata = TrackMetadata {
        title: display_text(
            &tag.and_then(|value| value.title().map(|v| v.into_owned()))
                .unwrap_or_default(),
            &fallback_title,
        ),
        album: display_text(
            &tag.and_then(|value| value.album().map(|v| v.into_owned()))
                .unwrap_or_default(),
            "未知专辑",
        ),
        artist,
        artists,
        album_artist: tag
            .and_then(|value| {
                value
                    .get_string(lofty::tag::ItemKey::AlbumArtist)
                    .map(str::to_owned)
            })
            .unwrap_or_default(),
        duration_ms: properties.duration().as_millis() as u64,
        track_number: tag.and_then(|value| value.track()),
        track_total: tag.and_then(|value| value.track_total()),
        disc_number: tag.and_then(|value| value.disk()),
        disc_total: tag.and_then(|value| value.disk_total()),
        year: tag.and_then(|value| value.date().map(|date| u32::from(date.year))),
        genre: tag.and_then(|value| value.genre().map(|v| v.into_owned())),
        bitrate: properties.audio_bitrate(),
        sample_rate: properties.sample_rate(),
        channels: properties.channels(),
        composer: tag.and_then(|value| {
            value
                .get_string(lofty::tag::ItemKey::Composer)
                .map(str::to_owned)
        }),
        musicbrainz_recording_id: tag.and_then(|value| {
            value
                .get_string(lofty::tag::ItemKey::MusicBrainzRecordingId)
                .map(str::to_owned)
        }),
    };
    let artwork = tag
        .and_then(|value| value.pictures().first())
        .map(|picture| EmbeddedArtwork {
            mime_type: picture
                .mime_type()
                .map(|value| value.as_str().to_owned())
                .unwrap_or_else(|| "application/octet-stream".into()),
            data: picture.data().to_vec(),
        });
    let embedded_lyrics = tag.and_then(|value| {
        value
            .get_string(lofty::tag::ItemKey::Lyrics)
            .or_else(|| value.get_string(lofty::tag::ItemKey::UnsyncLyrics))
            .map(str::to_owned)
            .filter(|lyrics| !lyrics.trim().is_empty())
    });

    Ok(MetadataRead {
        metadata,
        artwork,
        embedded_lyrics,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_tags_use_filename_and_unknown_labels_without_writing_audio() {
        use lofty::{
            config::WriteOptions,
            tag::{Tag, TagExt, TagType},
        };
        let root = std::env::temp_dir().join(format!("nano-empty-tags-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("01 - 合成音频.wav");
        let mut wav = b"RIFF".to_vec();
        wav.extend(16036u32.to_le_bytes());
        wav.extend(b"WAVEfmt ");
        wav.extend(16u32.to_le_bytes());
        wav.extend(1u16.to_le_bytes());
        wav.extend(1u16.to_le_bytes());
        wav.extend(8000u32.to_le_bytes());
        wav.extend(16000u32.to_le_bytes());
        wav.extend(2u16.to_le_bytes());
        wav.extend(16u16.to_le_bytes());
        wav.extend(b"data");
        wav.extend(16000u32.to_le_bytes());
        wav.resize(16044, 0);
        std::fs::write(&path, wav).unwrap();
        let mut tag = Tag::new(TagType::RiffInfo);
        tag.set_title(" \t".into());
        tag.set_artist(" ".into());
        tag.set_album(" ".into());
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        let before = std::fs::read(&path).unwrap();
        let result = read_metadata(&path).unwrap().metadata;
        assert_eq!(result.title, "01 - 合成音频.wav");
        assert_eq!(result.artist, "未知艺术家");
        assert_eq!(result.album, "未知专辑");
        assert_eq!(result.artists, vec!["未知艺术家"]);
        assert_eq!(std::fs::read(&path).unwrap(), before);
        tag.set_title("正常标题".into());
        tag.save_to_path(&path, WriteOptions::default()).unwrap();
        let before = std::fs::read(&path).unwrap();
        assert_eq!(read_metadata(&path).unwrap().metadata.title, "正常标题");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn display_fallback_handles_unicode_whitespace_and_keeps_valid_tags() {
        assert_eq!(display_text("\u{3000}\t\n", "fallback"), "fallback");
        assert_eq!(display_text(" 标题 ", "file.wav"), "标题");
        assert_eq!(
            filename_title(Path::new("/音乐/专辑/原文件.flac")),
            "原文件.flac"
        );
    }

    #[test]
    fn supported_extensions_match_the_product_plan() {
        for extension in [
            "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "aiff", "aif", "alac",
        ] {
            assert!(crate::scanner::is_supported_extension(extension));
        }
    }
}
