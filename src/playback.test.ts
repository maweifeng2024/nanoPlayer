import { beforeEach, describe, expect, it } from "vitest";
import {
  applyNativeUserState,
  getNativeUserState,
  migratePlaybackStatistics,
  useNanoStore,
} from "./store";
import { demoTracks } from "./domain";
import { t } from "./i18n";
import { extractPalette, neutralPalette } from "./library/artworkPalette";
const initial = useNanoStore.getState();
beforeEach(() =>
  useNanoStore.setState({ ...initial, tracks: demoTracks, playCounts: {}, lastPlayedAt: {} }, true),
);
const state = () => useNanoStore.getState();

describe("complete-song statistics", () => {
  it("starts with no artificial plays or listening history", () => {
    expect(state().playCounts).toEqual({});
    expect(state().lastPlayedAt).toEqual({});
  });
  it("does not count halfway, on pause, or when skipped", () => {
    state().playTrack(-1, [-1, -2]);
    state().tickPlayback(126_000);
    state().setPlaying(false);
    state().tickPlayback(126_000);
    state().completePlayback();
    expect(state().playCounts).toEqual({});
    expect(state().listenedSessionMs).toBe(126_000);
    state().setPlaying(true);
    state().next();
    expect(state().playCounts).toEqual({});
  });
  it("counts after pause/resume and natural completion exactly once", () => {
    state().playTrack(-1);
    state().tickPlayback(126_000);
    state().setPlaying(false);
    state().tickPlayback(80_000);
    state().setPlaying(true);
    state().tickPlayback(126_000);
    expect(state().playCounts).toEqual({});
    state().completePlayback();
    state().completePlayback();
    expect(state().playCounts[-1]).toBe(1);
  });
  it("does not count a seek even after repeated listening accumulates duration", () => {
    state().playTrack(-1);
    state().seekPlayback(240_000);
    state().tickPlayback(252_000);
    state().completePlayback();
    expect(state().playCounts).toEqual({});
  });
  it("counts short tracks and each completed repeat separately", () => {
    useNanoStore.setState({ tracks: [{ ...demoTracks[0], durationMs: 1000 }], repeatMode: "one" });
    state().playTrack(-1, [-1]);
    state().tickPlayback(1000);
    state().completePlayback();
    state().next(true);
    state().tickPlayback(1000);
    state().completePlayback();
    expect(state().playCounts[-1]).toBe(2);
  });
  it("replaying the same track reloads audio and resets session eligibility", () => {
    state().playTrack(-1);
    state().seekPlayback(200_000);
    const revision = state().playbackRevision;
    state().playTrack(-1);
    expect(state()).toMatchObject({
      playbackRevision: revision + 1,
      listenedSessionMs: 0,
      sessionSeeked: false,
    });
  });
  it("migrates only seeded demo plays and never rewrites real history", () => {
    const migrated = migratePlaybackStatistics({ playCounts: { [-1]: 14, [-3]: 9, 12: 20 } });
    expect(migrated.playCounts).toEqual({ [-1]: 0, [-3]: 1, 12: 20 });
    expect(migratePlaybackStatistics(migrated)).toEqual(migrated);
  });
});

describe("language and artwork", () => {
  it("persists language to native state and translates notifications with parameters", () => {
    state().setLanguage("en");
    expect(getNativeUserState().language).toBe("en");
    expect(t("再听一次《{0}》？", "海平面以下")).toBe("Listen to “海平面以下” again?");
    expect(t("音频输出设备已不可用：USB DAC")).toBe("Audio output device is unavailable: USB DAC");
    applyNativeUserState({ ...getNativeUserState(), language: "zh-CN" });
    expect(t("Added 3 songs to playlist")).toBe("已将 3 首歌曲添加到歌单");
  });
  it("rejects unsupported persisted languages", () => {
    applyNativeUserState({ language: "invalid" });
    expect(state().language).toBe("zh-CN");
  });
  it("extracts cover colors and ignores transparent pixels and borders", () => {
    expect(extractPalette(new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 0, 255]))).toEqual(
      neutralPalette,
    );
    const result = extractPalette(
      new Uint8ClampedArray([190, 65, 45, 255, 190, 65, 45, 255, 30, 80, 190, 255]),
    );
    expect(result).toEqual({ primary: "rgb(190, 65, 45)", secondary: "rgb(30, 80, 190)" });
  });
});
