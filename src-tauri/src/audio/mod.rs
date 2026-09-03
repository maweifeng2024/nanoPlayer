//! Playback engine boundary. The OS audio stream and decoder queue live here;
//! scans, database work, and network requests never run on the audio callback.

use rodio::{
    speakers::{available_outputs, SpeakersBuilder},
    DeviceSinkBuilder, MixerDeviceSink, Player,
};
use serde::Serialize;
use std::{fs::File, path::Path, time::Duration};

pub struct AudioEngine {
    _device: MixerDeviceSink,
    player: Player,
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
        })
    }

    pub fn load(
        &self,
        path: &Path,
        start_ms: u64,
        volume: f32,
        autoplay: bool,
    ) -> Result<(), String> {
        self.player.clear();
        self.player.pause();
        let file = File::open(path).map_err(|error| error.to_string())?;
        let byte_len = file.metadata().map_err(|error| error.to_string())?.len();
        let hint = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let decoder = rodio::Decoder::builder()
            .with_data(file)
            .with_byte_len(byte_len)
            .with_hint(hint)
            .with_gapless(true)
            .build()
            .map_err(|error| error.to_string())?;
        self.player.append(decoder);
        self.player.set_volume(volume.clamp(0.0, 1.0));
        if start_ms > 0 {
            self.player
                .try_seek(Duration::from_millis(start_ms))
                .map_err(|error| error.to_string())?;
        }
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
    pub fn seek(&self, position_ms: u64) -> Result<(), String> {
        self.player
            .try_seek(Duration::from_millis(position_ms))
            .map_err(|error| error.to_string())
    }
    pub fn set_volume(&self, volume: f32) {
        self.player.set_volume(volume.clamp(0.0, 1.0));
    }
    pub fn status(&self) -> PlaybackStatus {
        PlaybackStatus {
            position_ms: self.player.get_pos().as_millis() as u64,
            paused: self.player.is_paused(),
            empty: self.player.empty(),
        }
    }
}
