//! Playback engine boundary. The OS audio stream and decoder queue live here;
//! scans, database work, and network requests never run on the audio callback.

use rodio::{
    speakers::{available_outputs, SpeakersBuilder},
    DeviceSinkBuilder, MixerDeviceSink, Player, Source,
};
use serde::Serialize;
use std::{
    fs::File,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

pub struct AudioEngine {
    _device: MixerDeviceSink,
    player: Player,
    path: Option<PathBuf>,
    offset_ms: u64,
    output_name: Option<String>,
    follows_default: bool,
    recovery_pending: bool,
    last_probe: Instant,
    last_progress: Instant,
    last_position: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutput {
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStatus {
    pub position_ms: u64,
    pub paused: bool,
    pub empty: bool,
}

pub fn output_devices() -> Result<Vec<AudioOutput>, String> {
    available_outputs()
        .map_err(|error| error.to_string())
        .map(|outputs| {
            outputs
                .into_iter()
                .map(|output| AudioOutput {
                    name: output.to_string(),
                    is_default: output.is_default(),
                })
                .collect()
        })
}

impl AudioEngine {
    pub fn new() -> Result<Self, String> {
        let mut device =
            DeviceSinkBuilder::open_default_sink().map_err(|error| error.to_string())?;
        device.log_on_drop(false);
        let player = Player::connect_new(device.mixer());
        Ok(Self {
            _device: device,
            player,
            path: None,
            offset_ms: 0,
            output_name: output_devices().ok().and_then(|outputs| {
                outputs
                    .into_iter()
                    .find(|output| output.is_default)
                    .map(|output| output.name)
            }),
            follows_default: true,
            recovery_pending: false,
            last_probe: Instant::now(),
            last_progress: Instant::now(),
            last_position: 0,
        })
    }

    pub fn for_output(output_name: &str) -> Result<Self, String> {
        let output = available_outputs()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|output| output.to_string() == output_name)
            .ok_or_else(|| format!("音频输出设备已不可用：{output_name}"))?;
        let mut device = SpeakersBuilder::new()
            .device(output)
            .map_err(|error| error.to_string())?
            .default_config()
            .map_err(|error| error.to_string())?
            .open_mixer()
            .map_err(|error| error.to_string())?;
        device.log_on_drop(false);
        let player = Player::connect_new(device.mixer());
        Ok(Self {
            _device: device,
            player,
            path: None,
            offset_ms: 0,
            output_name: Some(output_name.to_owned()),
            follows_default: false,
            recovery_pending: false,
            last_probe: Instant::now(),
            last_progress: Instant::now(),
            last_position: 0,
        })
    }

    pub fn load(
        &mut self,
        path: &Path,
        start_ms: u64,
        volume: f32,
        autoplay: bool,
    ) -> Result<(), String> {
        let player = prepare_player(self._device.mixer(), path, start_ms, volume)?;
        self.player.stop();
        self.player = player;
        self.path = Some(path.to_owned());
        self.offset_ms = start_ms;
        self.last_position = start_ms;
        self.last_progress = Instant::now();
        if autoplay {
            self.player.play();
        }
        Ok(())
    }

    pub fn pause(&self) {
        self.player.pause();
    }
    pub fn resume(&self) {
        self.player.play();
    }
    pub fn seek(&mut self, position_ms: u64) -> Result<(), String> {
        if let Some(path) = self.path.clone() {
            self.load(
                &path,
                position_ms,
                self.player.volume(),
                !self.player.is_paused(),
            )?;
        }
        Ok(())
    }
    pub fn set_volume(&self, volume: f32) {
        self.player.set_volume(volume.clamp(0.0, 1.0));
    }
    pub fn status(&mut self) -> Result<PlaybackStatus, String> {
        let position_ms = self
            .offset_ms
            .saturating_add(self.player.get_pos().as_millis() as u64);
        if self.player.is_paused() || self.player.empty() || position_ms != self.last_position {
            self.last_progress = Instant::now();
            self.last_position = position_ms;
        }
        if self.last_probe.elapsed() >= Duration::from_secs(1) {
            self.last_probe = Instant::now();
            let outputs = output_devices()?;
            let stalled = self.last_progress.elapsed() >= Duration::from_secs(3);
            if route_requires_recovery(&outputs, self.output_name.as_deref(), self.follows_default)
                || stalled
                || self.recovery_pending
            {
                // Preserve position and pause on route loss, avoiding unexpected
                // speaker playback. A failed reopen remains paused and retryable.
                self.player.pause();
                self.recovery_pending = true;
                let mut replacement = Self::new()?;
                if let Some(path) = &self.path {
                    replacement.load(path, position_ms, self.player.volume(), false)?;
                }
                *self = replacement;
            }
        }
        Ok(PlaybackStatus {
            position_ms,
            paused: self.player.is_paused(),
            empty: self.player.empty(),
        })
    }
}

fn route_requires_recovery(
    outputs: &[AudioOutput],
    current: Option<&str>,
    follows_default: bool,
) -> bool {
    let missing = !outputs
        .iter()
        .any(|output| Some(output.name.as_str()) == current);
    let default = outputs
        .iter()
        .find(|output| output.is_default)
        .map(|output| output.name.as_str());
    missing || (follows_default && default != current)
}

// Preparing a queue must not depend on the output consuming samples.
fn prepare_player(
    mixer: &rodio::mixer::Mixer,
    path: &Path,
    start_ms: u64,
    volume: f32,
) -> Result<Player, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let byte_len = file.metadata().map_err(|error| error.to_string())?.len();
    let hint = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mut decoder = rodio::Decoder::builder()
        .with_data(file)
        .with_byte_len(byte_len)
        .with_hint(hint)
        .with_gapless(true)
        .build()
        .map_err(|error| error.to_string())?;
    // Seek the decoder directly: Player::try_seek/clear wait for an audio
    // callback that may never arrive after an output device disconnects.
    if start_ms > 0 {
        decoder
            .try_seek(Duration::from_millis(start_ms))
            .map_err(|error| error.to_string())?;
    }
    let player = Player::connect_new(mixer);
    player.pause();
    player.set_volume(volume.clamp(0.0, 1.0));
    player.append(decoder);
    Ok(player)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disconnect_and_default_switch_recover_but_explicit_available_output_stays() {
        let outputs = vec![
            AudioOutput {
                name: "Speakers".into(),
                is_default: true,
            },
            AudioOutput {
                name: "Headphones".into(),
                is_default: false,
            },
        ];
        assert!(route_requires_recovery(&outputs, Some("Headphones"), true));
        assert!(!route_requires_recovery(
            &outputs,
            Some("Headphones"),
            false
        ));
        assert!(!route_requires_recovery(&outputs, Some("Speakers"), true));
        assert!(route_requires_recovery(
            &outputs[..1],
            Some("Headphones"),
            false
        ));
        assert!(route_requires_recovery(&[], Some("Headphones"), true));
    }

    #[test]
    fn load_and_seek_finish_without_audio_callbacks_and_preserve_source() {
        // Synthetic mono PCM, generated in private temporary storage.
        let path =
            std::env::temp_dir().join(format!("nanoplayer-route-{}.wav", std::process::id()));
        let samples = 16000u32;
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + samples * 2).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&8000u32.to_le_bytes());
        bytes.extend_from_slice(&16000u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(samples * 2).to_le_bytes());
        bytes.resize(44 + samples as usize * 2, 0);
        std::fs::write(&path, &bytes).unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let worker_path = path.clone();
        let worker = std::thread::spawn(move || {
            let (mixer, _unconsumed_output) =
                rodio::mixer::mixer(1.try_into().unwrap(), 8000.try_into().unwrap());
            let mut previous = prepare_player(&mixer, &worker_path, 0, 0.6).unwrap();
            previous.play();
            for position in [500, 1000, 250, 0] {
                let next =
                    prepare_player(&mixer, &worker_path, position, previous.volume()).unwrap();
                previous.stop();
                previous = next;
                assert!(previous.is_paused());
                assert_eq!(previous.volume(), 0.6);
            }
            sender.send(()).unwrap();
        });
        receiver
            .recv_timeout(Duration::from_secs(3))
            .expect("queue replacement waited for a dead audio callback");
        worker.join().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        std::fs::remove_file(path).unwrap();
    }
}
