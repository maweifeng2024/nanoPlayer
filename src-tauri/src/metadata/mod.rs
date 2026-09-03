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

pub fn read_metadata(path: &Path) -> Result<MetadataRead, String> {
    let tagged = read_from_path(path).map_err(|error| error.to_string())?;
    let properties = tagged.properties();
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let fallback_title = path
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("未知曲目")
        .to_owned();

    let artist = tag
        .and_then(|value| value.artist().map(|v| v.into_owned()))
        .unwrap_or_else(|| "未知艺术家".into());
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
        title: tag
            .and_then(|value| value.title().map(|v| v.into_owned()))
            .unwrap_or(fallback_title),
        album: tag
            .and_then(|value| value.album().map(|v| v.into_owned()))
            .unwrap_or_else(|| "未知专辑".into()),
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
    #[test]
    fn supported_extensions_match_the_product_plan() {
        for extension in [
            "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "aiff", "aif", "alac",
        ] {
            assert!(crate::scanner::is_supported_extension(extension));
        }
    }
}
