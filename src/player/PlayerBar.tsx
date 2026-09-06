import { t } from "../i18n";
import {
  Heart,
  ListOrdered,
  ListMusic,
  Pause,
  Play,
  Repeat1,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { formatDuration } from "../domain";
import { useNanoStore } from "../store";
import {
  beginPlaybackSession,
  checkpointPlaybackSession,
  getPlaybackStatus,
  isTauri,
} from "../tauriBridge";
import { invoke } from "@tauri-apps/api/core";
import { Artwork } from "../library/Artwork";

export function PlayerBar() {
  const state = useNanoStore();
  const track = state.tracks.find((item) => item.id === state.currentTrackId);
  const loadedTrack = useRef<number | undefined>(undefined);
  const loadedRevision = useRef(-1);
  const session = useRef<{ id: number; trackId: number } | undefined>(undefined);
  const sessionProgress = useRef({ listenedMs: 0, counted: false });

  useEffect(() => {
    sessionProgress.current = {
      listenedMs: state.listenedSessionMs,
      counted: state.sessionCounted,
    };
  }, [state.listenedSessionMs, state.sessionCounted]);

  useEffect(() => {
    if (!isTauri() || !track || track.id < 0) return;
    let disposed = false;
    let starting = false;
    const begin = () => {
      if (starting || session.current || !useNanoStore.getState().playing) return;
      starting = true;
      beginPlaybackSession(track.id)
        .then((id) => {
          if (disposed)
            checkpointPlaybackSession(id, 0, false, "changed-before-start").catch(() => undefined);
          else session.current = { id, trackId: track.id };
        })
        .catch((error) => state.setNotice(t(String(error))))
        .finally(() => {
          starting = false;
        });
    };
    begin();
    const unsubscribe = useNanoStore.subscribe((next, previous) => {
      if (next.playing && !previous.playing) begin();
    });
    const checkpoint = window.setInterval(() => {
      if (session.current?.trackId === track.id)
        checkpointPlaybackSession(
          session.current.id,
          sessionProgress.current.listenedMs,
          sessionProgress.current.counted,
        ).catch(() => undefined);
    }, 10_000);
    return () => {
      disposed = true;
      unsubscribe();
      window.clearInterval(checkpoint);
      if (session.current?.trackId === track.id) {
        checkpointPlaybackSession(
          session.current.id,
          sessionProgress.current.listenedMs,
          sessionProgress.current.counted,
          "paused-or-changed",
        ).catch(() => undefined);
        session.current = undefined;
      }
    };
  }, [track?.id, state.playbackRevision]);

  useEffect(() => {
    if (!track || !state.playing) return;
    let polling = false;
    const finish = () => {
      const latest = useNanoStore.getState();
      latest.completePlayback();
      const completed = useNanoStore.getState();
      sessionProgress.current = {
        listenedMs: completed.listenedSessionMs,
        counted: completed.sessionCounted,
      };
      if (session.current) {
        void checkpointPlaybackSession(
          session.current.id,
          completed.listenedSessionMs,
          completed.sessionCounted,
          "completed",
        ).catch(() => undefined);
        session.current = undefined;
      }
      completed.next(true);
    };
    const tick = async () => {
      const snapshot = useNanoStore.getState();
      const current = snapshot.tracks.find((item) => item.id === snapshot.currentTrackId);
      if (!current || !snapshot.playing) return;
      if (!isTauri() || current.id < 0) {
        snapshot.tickPlayback(250);
        if (snapshot.progressMs + 250 >= current.durationMs) finish();
        else snapshot.setProgress(snapshot.progressMs + 250);
        return;
      }
      if (polling || loadedRevision.current !== snapshot.playbackRevision) return;
      polling = true;
      try {
        const status = await getPlaybackStatus();
        if (
          !status ||
          loadedTrack.current !== current.id ||
          useNanoStore.getState().currentTrackId !== current.id ||
          useNanoStore.getState().playbackRevision !== snapshot.playbackRevision ||
          !useNanoStore.getState().playing
        )
          return;
        if (status.empty) {
          // The sink may reset its position at EOF. Account for the final poll,
          // including tracks shorter than 250 ms, without counting a seek.
          snapshot.tickPlayback(
            Math.min(250, Math.max(0, current.durationMs - snapshot.progressMs)),
          );
          finish();
          return;
        }
        snapshot.setProgress(Math.min(status.positionMs, current.durationMs));
        if (!status.paused)
          snapshot.tickPlayback(Math.max(0, status.positionMs - snapshot.progressMs));
      } catch (error) {
        snapshot.setPlaying(false);
        snapshot.setNotice(t("读取播放状态失败：{0}", t(String(error))));
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [state.playing, track?.id]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !track || track.durationMs <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: track.durationMs / 1000,
        position: Math.min(state.progressMs, track.durationMs - 1) / 1000,
        playbackRate: 1,
      });
    } catch {
      /* metadata-only WebViews */
    }
  }, [state.progressMs, track?.id]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
    if (track)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
      });
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      [
        "play",
        () => {
          if (!useNanoStore.getState().playing) useNanoStore.getState().togglePlay();
        },
      ],
      [
        "pause",
        () => {
          if (useNanoStore.getState().playing) useNanoStore.getState().togglePlay();
        },
      ],
      ["previoustrack", () => useNanoStore.getState().previous()],
      ["nexttrack", () => useNanoStore.getState().next()],
      [
        "seekto",
        (details) => {
          if (details.seekTime !== undefined) seek(details.seekTime * 1000);
        },
      ],
    ];
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* unsupported WebView action */
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* unsupported WebView action */
        }
      }
    };
  }, [state.playing, track?.id]);

  useEffect(() => {
    if (!isTauri() || !track || track.id < 0) return;
    const needsLoad =
      loadedTrack.current !== track.id || loadedRevision.current !== state.playbackRevision;
    const command = !needsLoad
      ? state.playing
        ? "playback_resume"
        : "playback_pause"
      : "playback_load";
    const args =
      command === "playback_load"
        ? {
            trackId: track.id,
            startMs: state.progressMs,
            volume: state.muted ? 0 : state.volume,
            autoplay: state.playing,
          }
        : {};
    invoke(command, args)
      .then(() => {
        loadedTrack.current = track.id;
        loadedRevision.current = state.playbackRevision;
        if (state.playing) state.markPlaybackStarted(track.id);
      })
      .catch((error) => {
        state.setPlaying(false);
        state.setNotice(t("播放失败：{0}", t(String(error))));
      });
  }, [state.playbackRevision, state.playing, track?.id]);

  useEffect(() => {
    if (!isTauri() && track && state.playing) state.markPlaybackStarted(track.id);
  }, [state.playing, track?.id]);

  const seek = (value: number) => {
    state.seekPlayback(value);
    if (isTauri() && track && track.id > 0)
      invoke("playback_seek", { positionMs: value }).catch((error) =>
        state.setNotice(t(String(error))),
      );
  };
  const setVolume = (value: number) => {
    state.setVolume(value);
    if (isTauri()) invoke("playback_volume", { volume: value }).catch(() => undefined);
  };
  const toggleMute = () => {
    const nextMuted = !state.muted;
    state.toggleMute();
    if (isTauri())
      invoke("playback_volume", { volume: nextMuted ? 0 : state.volume }).catch((error) =>
        state.setNotice(t(String(error))),
      );
  };
  const repeatLabel =
    state.repeatMode === "one"
      ? t("单曲循环")
      : state.repeatMode === "all"
        ? t("全部循环")
        : t("不循环");

  return (
    <footer className="player-bar" aria-label={t("播放器")}>
      <div className="now-playing">
        <button
          className="artwork-button"
          disabled={!track}
          onClick={() => track && state.setPage("now-playing")}
          aria-label={t("打开正在播放页")}
          type="button"
        >
          <Artwork
            className="artwork-placeholder"
            track={track}
            fallback={<img src="/nanoplayer-app-icon.png" alt="" />}
          />
        </button>
        <div>
          <strong>{track?.title ?? t("尚未播放")}</strong>
          <span>{track ? `${track.artist} · ${track.album}` : t("从本地资料库选择歌曲")}</span>
        </div>
        <button
          className={`now-favorite ${track && state.ratings[track.id] ? "active" : ""}`}
          disabled={!track}
          onClick={() => track && state.rate(track.id, state.ratings[track.id] ? 0 : 5)}
          aria-label={track && state.ratings[track.id] ? t("取消收藏") : t("收藏")}
          type="button"
        >
          <Heart size={18} fill={track && state.ratings[track.id] ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="transport">
        <div className="transport-buttons">
          <button
            className={state.orderMode === "shuffle" ? "active" : ""}
            aria-label={t(
              "播放顺序：{0}",
              state.orderMode === "shuffle" ? t("随机播放") : t("顺序播放"),
            )}
            title={state.orderMode === "shuffle" ? t("随机播放") : t("顺序播放")}
            onClick={state.toggleOrderMode}
            type="button"
          >
            {state.orderMode === "shuffle" ? <Shuffle size={16} /> : <ListOrdered size={16} />}
          </button>
          <button
            className={state.repeatMode !== "off" ? "active" : ""}
            aria-label={t("循环方式：{0}", repeatLabel)}
            title={repeatLabel}
            onClick={state.cycleRepeatMode}
            type="button"
          >
            {state.repeatMode === "one" ? <Repeat1 size={16} /> : <Repeat2 size={16} />}
          </button>
          <button aria-label={t("上一首")} onClick={state.previous} type="button">
            <SkipBack size={18} />
          </button>
          <button
            className="play-button"
            aria-label={state.playing ? t("暂停") : t("播放")}
            onClick={state.togglePlay}
            type="button"
          >
            {state.playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button aria-label={t("下一首")} onClick={() => state.next()} type="button">
            <SkipForward size={18} />
          </button>
          <button
            className={`lyrics-text-icon ${state.drawer === "lyrics" ? "active" : ""}`}
            aria-label={t("歌词")}
            aria-pressed={state.drawer === "lyrics"}
            title={t("歌词 (⌘L)")}
            onClick={() => state.toggleDrawer("lyrics")}
            type="button"
          >
            <span aria-hidden="true">{t("词")}</span>
          </button>
        </div>
        <div className="progress-row">
          <span>{formatDuration(state.progressMs)}</span>
          <input
            className="range"
            style={
              {
                "--range-progress": `${track?.durationMs ? Math.min(100, (state.progressMs / track.durationMs) * 100) : 0}%`,
              } as CSSProperties
            }
            aria-label={t("播放进度")}
            disabled={!track}
            aria-valuetext={`${formatDuration(state.progressMs)} / ${formatDuration(track?.durationMs ?? 0)}`}
            type="range"
            min="0"
            max={track?.durationMs ?? 1}
            value={Math.min(state.progressMs, track?.durationMs ?? 1)}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>{formatDuration(track?.durationMs ?? 0)}</span>
        </div>
      </div>
      <div className="player-tools">
        <button
          className={state.drawer === "queue" ? "active" : ""}
          aria-label={t("播放队列")}
          title={t("播放队列 (⌘⇧Q)")}
          aria-pressed={state.drawer === "queue"}
          onClick={() => state.toggleDrawer("queue")}
          type="button"
        >
          <ListMusic size={17} />
        </button>
        <button
          aria-label={state.muted ? t("取消静音") : t("静音")}
          onClick={toggleMute}
          type="button"
        >
          {state.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <input
          className="range volume-range"
          style={
            {
              "--range-progress": `${(state.muted ? 0 : state.volume) * 100}%`,
            } as CSSProperties
          }
          aria-label={t("音量")}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={state.muted ? 0 : state.volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <span className="volume-value" aria-label={t("当前音量")}>
          {Math.round((state.muted ? 0 : state.volume) * 100)}%
        </span>
      </div>
    </footer>
  );
}
