//! Embedded, sidecar, cached, and opt-in network lyrics providers.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub trait LyricsProvider {
    fn provider_name(&self) -> &'static str;
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsCandidate {
    pub id: i64,
    pub track_name: String,
    pub artist_name: String,
    #[serde(default)]
    pub album_name: String,
    pub duration: f64,
    #[serde(default)]
    pub instrumental: bool,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
    #[serde(default)]
    pub confidence: f64,
    #[serde(default)]
    pub match_reason: String,
    #[serde(default)]
    pub duration_difference: f64,
}

pub struct LrclibProvider {
    client: reqwest::Client,
}

impl LyricsProvider for LrclibProvider {
    fn provider_name(&self) -> &'static str {
        "LRCLIB"
    }
}

impl LrclibProvider {
    pub fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .user_agent("nanoPlayer/0.1.0 (local-first desktop music player)")
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|error| error.to_string())?;
        Ok(Self { client })
    }

    pub async fn search(
        &self,
        title: &str,
        artist: &str,
        album: &str,
        duration_ms: u64,
    ) -> Result<Vec<LyricsCandidate>, String> {
        let request_error = |error: reqwest::Error| {
            if error.is_timeout() {
                "歌词服务响应超时，请稍后重试".to_owned()
            } else if error.is_connect() {
                "无法连接歌词服务，请检查网络后重试".to_owned()
            } else {
                format!("歌词请求失败：{error}")
            }
        };
        let mut candidates = Vec::new();
        let exact = self
            .client
            .get("https://lrclib.net/api/get")
            .query(&[
                ("track_name", title.to_owned()),
                ("artist_name", artist.to_owned()),
                ("album_name", album.to_owned()),
                ("duration", (duration_ms / 1000).to_string()),
            ])
            .send()
            .await
            .map_err(&request_error)?;
        if exact.status().is_success() {
            let candidate = exact
                .json::<LyricsCandidate>()
                .await
                .map_err(request_error)?;
            candidates.push(candidate);
        } else if exact.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(service_status_error(exact.status()));
        }

        let normalized_title = normalize_title(title);
        let normalized_artist = primary_artist(artist);
        let searches = [
            vec![
                ("track_name", title.to_owned()),
                ("artist_name", artist.to_owned()),
            ],
            vec![("q", format!("{normalized_title} {normalized_artist}"))],
            vec![("q", normalized_title.clone())],
        ];
        for query in searches {
            tokio::time::sleep(std::time::Duration::from_millis(220)).await;
            let response = self
                .client
                .get("https://lrclib.net/api/search")
                .query(&query)
                .send()
                .await
                .map_err(&request_error)?;
            if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                return Err(service_status_error(response.status()));
            }
            if !response.status().is_success() {
                continue;
            }
            let body = response.bytes().await.map_err(&request_error)?;
            candidates.extend(parse_candidates(&body)?);
            if candidates.len() >= 12 {
                break;
            }
        }
        let mut unique = HashMap::new();
        for candidate in candidates {
            unique.entry(candidate.id).or_insert(candidate);
        }
        let mut candidates = unique.into_values().collect::<Vec<_>>();
        for candidate in &mut candidates {
            candidate.confidence = confidence(candidate, title, artist, album, duration_ms);
            candidate.duration_difference =
                (candidate.duration - duration_ms as f64 / 1000.0).abs();
            candidate.match_reason = match_reason(candidate, title, artist, album, duration_ms);
        }
        candidates.retain(|candidate| {
            candidate.plain_lyrics.is_some()
                || candidate.synced_lyrics.is_some()
                || candidate.instrumental
        });
        candidates.sort_by(|left, right| right.confidence.total_cmp(&left.confidence));
        candidates.truncate(8);
        Ok(candidates)
    }
}

fn parse_candidates(body: &[u8]) -> Result<Vec<LyricsCandidate>, String> {
    let values = serde_json::from_slice::<Vec<serde_json::Value>>(body)
        .map_err(|error| format!("歌词服务返回了无法识别的数据：{error}"))?;
    let mut candidates = Vec::new();
    let mut first_error = None;
    for value in values {
        match serde_json::from_value::<LyricsCandidate>(value) {
            Ok(candidate) => candidates.push(candidate),
            Err(error) => {
                if first_error.is_none() {
                    first_error = Some(error.to_string());
                }
            }
        }
    }
    if candidates.is_empty() {
        if let Some(error) = first_error {
            return Err(format!("歌词候选字段不兼容：{error}"));
        }
    }
    Ok(candidates)
}

fn service_status_error(status: reqwest::StatusCode) -> String {
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        "歌词服务请求过于频繁，请稍后重试".into()
    } else if status.is_server_error() {
        format!("歌词服务暂时不可用（{}），请稍后重试", status.as_u16())
    } else {
        format!("歌词请求失败（{}）", status.as_u16())
    }
}

fn confidence(
    candidate: &LyricsCandidate,
    title: &str,
    artist: &str,
    album: &str,
    duration_ms: u64,
) -> f64 {
    let normalized = normalize_for_match;
    let mut score: f64 = 0.0;
    let title_similarity = similarity(
        &normalized(&normalize_title(&candidate.track_name)),
        &normalized(&normalize_title(title)),
    );
    let artist_similarity = similarity(&normalized(&candidate.artist_name), &normalized(artist));
    if title_similarity >= 0.98 {
        score += 0.42;
    } else {
        score += 0.32 * title_similarity;
    }
    if artist_similarity >= 0.98 {
        score += 0.30;
    } else {
        score += 0.22 * artist_similarity;
    }
    if !album.is_empty() && normalized(&candidate.album_name) == normalized(album) {
        score += 0.13;
    }
    let difference = (candidate.duration * 1000.0 - duration_ms as f64).abs();
    if difference <= 2_000.0 {
        score += 0.15;
    } else if difference <= 5_000.0 {
        score += 0.07;
    }
    score.min(1.0)
}

fn normalize_for_match(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn normalize_title(value: &str) -> String {
    let mut title = value.trim().to_owned();
    for (open, close) in [('(', ')'), ('（', '）'), ('[', ']'), ('【', '】')] {
        while let Some(start) = title.rfind(open) {
            let Some(end) = title[start..].find(close).map(|offset| start + offset) else {
                break;
            };
            let qualifier = title[start + open.len_utf8()..end].to_lowercase();
            if [
                "live", "remaster", "伴奏", "dj", "现场", "重制", "版", "ver.",
            ]
            .iter()
            .any(|marker| qualifier.contains(marker))
            {
                title.replace_range(start..end + close.len_utf8(), "");
            } else {
                break;
            }
        }
    }
    title.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn primary_artist(value: &str) -> String {
    let lower = value.to_lowercase();
    let mut end = value.len();
    for marker in [
        " feat.", " feat ", " ft.", " ft ", " with ", "/", "、", ";", "；",
    ] {
        if let Some(index) = lower.find(marker) {
            end = end.min(index);
        }
    }
    value[..end].trim().to_owned()
}

fn similarity(left: &str, right: &str) -> f64 {
    if left == right {
        return 1.0;
    }
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    if left.contains(right) || right.contains(left) {
        return left.chars().count().min(right.chars().count()) as f64
            / left.chars().count().max(right.chars().count()) as f64;
    }
    let common = left
        .chars()
        .filter(|character| right.contains(*character))
        .count();
    2.0 * common as f64 / (left.chars().count() + right.chars().count()) as f64
}

fn match_reason(
    candidate: &LyricsCandidate,
    title: &str,
    artist: &str,
    album: &str,
    duration_ms: u64,
) -> String {
    let mut reasons = Vec::new();
    if normalize_for_match(&normalize_title(&candidate.track_name))
        == normalize_for_match(&normalize_title(title))
    {
        reasons.push("歌名一致");
    } else {
        reasons.push("歌名近似");
    }
    if normalize_for_match(&candidate.artist_name) == normalize_for_match(artist) {
        reasons.push("艺术家一致");
    }
    let difference = (candidate.duration * 1000.0 - duration_ms as f64).abs() / 1000.0;
    if difference <= 3.0 {
        reasons.push("时长接近");
    } else if difference > 8.0 {
        reasons.push("可能是其他版本");
    }
    if !album.is_empty() && normalize_for_match(&candidate.album_name) != normalize_for_match(album)
    {
        reasons.push("专辑不同");
    }
    reasons.join(" · ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_signature_has_high_confidence() {
        let candidate = LyricsCandidate {
            id: 1,
            track_name: "Song".into(),
            artist_name: "Artist".into(),
            album_name: "Album".into(),
            duration: 180.0,
            instrumental: false,
            plain_lyrics: Some("words".into()),
            synced_lyrics: None,
            confidence: 0.0,
            match_reason: String::new(),
            duration_difference: 0.0,
        };
        assert_eq!(
            confidence(&candidate, "song", "artist", "album", 181_000),
            1.0
        );
    }

    #[test]
    fn service_errors_are_actionable() {
        assert!(service_status_error(reqwest::StatusCode::TOO_MANY_REQUESTS).contains("频繁"));
        assert!(
            service_status_error(reqwest::StatusCode::SERVICE_UNAVAILABLE).contains("稍后重试")
        );
        assert!(service_status_error(reqwest::StatusCode::BAD_REQUEST).contains("400"));
    }

    #[test]
    fn normalizes_common_version_suffixes_and_artist_credits() {
        assert_eq!(normalize_title("一生何求（Live 2003）"), "一生何求");
        assert_eq!(normalize_title("后来 [Remastered]"), "后来");
        assert_eq!(primary_artist("歌手甲 feat. 歌手乙"), "歌手甲");
        assert_eq!(primary_artist("歌手甲、歌手乙"), "歌手甲");
    }

    #[test]
    #[ignore = "explicit live LRCLIB verification"]
    fn live_chinese_search_returns_candidates() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let candidates = runtime
            .block_on(LrclibProvider::new().unwrap().search(
                "一生何求",
                "陈百强",
                "华纳至尊无敌影视金曲",
                288_000,
            ))
            .unwrap();
        assert!(!candidates.is_empty());
    }
}
