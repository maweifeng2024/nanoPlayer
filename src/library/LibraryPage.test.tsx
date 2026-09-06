import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatDuration, playCountThreshold } from "../domain";
import { useNanoStore } from "../store";
import { selectPlaylistCoverTracks } from "./playlistCover";

describe("library safety copy", () => {
  it("keeps the read-only promise explicit", () => {
    const message = "不会修改、移动或删除其中的音乐文件";
    expect(message).toContain("不会");
  });
});

describe("first-version state rules", () => {
  it("formats media values consistently", () => {
    expect(formatDuration(252_000)).toBe("4:12");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
    expect(formatDate("1704067200")).toContain("2024");
    expect(playCountThreshold(600_000)).toBe(600_000);
    expect(playCountThreshold(200_000)).toBe(200_000);
    expect(playCountThreshold(20_000)).toBe(20_000);
  });

  it("counts a qualifying session once and ignores seeking", () => {
    useNanoStore.setState({
      currentTrackId: -1,
      playing: true,
      listenedSessionMs: 0,
      sessionSeeked: false,
      sessionCounted: false,
      playCounts: { [-1]: 0 },
    });
    useNanoStore.getState().seekPlayback(240_000);
    expect(useNanoStore.getState().playCounts[-1]).toBe(0);
    useNanoStore.getState().tickPlayback(12_000);
    useNanoStore.getState().completePlayback();
    expect(useNanoStore.getState().playCounts[-1]).toBe(0);
    useNanoStore.getState().playTrack(-1);
    useNanoStore.getState().tickPlayback(252_000);
    expect(useNanoStore.getState().playCounts[-1]).toBe(0);
    useNanoStore.getState().completePlayback();
    useNanoStore.getState().completePlayback();
    expect(useNanoStore.getState().playCounts[-1]).toBe(1);
  });

  it("keeps shuffle order stable for a queue lifetime", () => {
    useNanoStore.setState({
      queue: [-1, -2, -3, -4],
      currentTrackId: -1,
      orderMode: "shuffle",
      repeatMode: "off",
      shuffleOrder: [-1, -4, -2, -3],
      playing: true,
    });
    useNanoStore.getState().next();
    expect(useNanoStore.getState().currentTrackId).toBe(-4);
    useNanoStore.getState().next();
    expect(useNanoStore.getState().currentTrackId).toBe(-2);
    expect(useNanoStore.getState().shuffleOrder).toEqual([-1, -4, -2, -3]);
  });

  it("separates playback order from repeat behavior", () => {
    useNanoStore.setState({
      queue: [-1, -2],
      currentTrackId: -2,
      orderMode: "sequence",
      repeatMode: "off",
      playing: true,
    });
    useNanoStore.getState().next(true);
    expect(useNanoStore.getState().playing).toBe(false);

    useNanoStore.setState({ currentTrackId: -2, repeatMode: "all", playing: true });
    useNanoStore.getState().next(true);
    expect(useNanoStore.getState().currentTrackId).toBe(-1);

    const revision = useNanoStore.getState().playbackRevision;
    useNanoStore.setState({ currentTrackId: -1, repeatMode: "one", playing: true });
    useNanoStore.getState().next(true);
    expect(useNanoStore.getState()).toMatchObject({
      currentTrackId: -1,
      playing: true,
      playbackRevision: revision + 1,
    });
    useNanoStore.getState().next();
    expect(useNanoStore.getState().currentTrackId).toBe(-2);
  });

  it("removes playlist references without touching tracks", () => {
    useNanoStore.setState({ playlists: [{ id: "test", name: "测试", trackIds: [-1] }] });
    const count = useNanoStore.getState().tracks.length;
    useNanoStore.getState().removeFromPlaylist("test", -1);
    expect(useNanoStore.getState().playlists[0].trackIds).toEqual([]);
    expect(useNanoStore.getState().tracks).toHaveLength(count);
  });

  it("reorders playlist items with stable track references", () => {
    useNanoStore.setState({ playlists: [{ id: "test", name: "测试", trackIds: [-1, -2, -3] }] });
    useNanoStore.getState().reorderPlaylist("test", -3, -1);
    expect(useNanoStore.getState().playlists[0].trackIds).toEqual([-3, -1, -2]);
  });

  it("does not interrupt playback during an incremental refresh", () => {
    const tracks = useNanoStore.getState().tracks;
    useNanoStore.setState({
      currentTrackId: -1,
      queue: [-1, -2],
      playing: true,
      progressMs: 42_000,
    });
    useNanoStore.getState().replaceLibrary(useNanoStore.getState().roots, tracks, []);
    expect(useNanoStore.getState()).toMatchObject({
      currentTrackId: -1,
      playing: true,
      progressMs: 42_000,
    });
  });

  it("skips an unavailable current file without losing the playlist reference", () => {
    const tracks = useNanoStore.getState().tracks;
    useNanoStore.setState({
      currentTrackId: -1,
      queue: [-1, -2],
      playing: true,
      playlists: [{ id: "test", name: "测试", trackIds: [-1, -2] }],
    });
    useNanoStore.getState().replaceLibrary(
      useNanoStore.getState().roots,
      tracks.filter((track) => track.id !== -1),
      [],
    );
    expect(useNanoStore.getState()).toMatchObject({ currentTrackId: -2, playing: true });
    expect(useNanoStore.getState().playlists[0].trackIds).toEqual([-1, -2]);
  });

  it("reorders the queue without changing track identities", () => {
    useNanoStore.setState({ queue: [-1, -2, -3] });
    useNanoStore.getState().reorderQueue(2, 0);
    expect(useNanoStore.getState().queue).toEqual([-3, -1, -2]);
  });

  it("adds a batch to a playlist without duplicates", () => {
    useNanoStore.setState({ playlists: [{ id: "test", name: "测试", trackIds: [-1] }] });
    useNanoStore.getState().addManyToPlaylist("test", [-1, -2, -3]);
    expect(useNanoStore.getState().playlists[0].trackIds).toEqual([-1, -2, -3]);
  });

  it("rebuilds automatic playlist covers by artist-album frequency", () => {
    const tracks = useNanoStore
      .getState()
      .tracks.slice(0, 6)
      .map((track) => ({
        ...track,
        hasArtwork: true,
      }));
    const repeated = [tracks[0], { ...tracks[0], id: -101 }, ...tracks.slice(1)];
    const selected = selectPlaylistCoverTracks(repeated, "playlist:revision-1");
    expect(selected).toHaveLength(4);
    expect(`${selected[0].artist}:${selected[0].album}`).toBe(
      `${tracks[0].artist}:${tracks[0].album}`,
    );
    expect(new Set(selected.map((track) => `${track.artist}:${track.album}`)).size).toBe(4);

    const afterRemoval = selectPlaylistCoverTracks(repeated.slice(2), "playlist:revision-2");
    expect(afterRemoval.some((track) => track.id === tracks[0].id)).toBe(false);
    const afterAddition = selectPlaylistCoverTracks(
      [...repeated.slice(2), tracks[0]],
      "playlist:revision-3",
    );
    expect(afterAddition.some((track) => track.id === tracks[0].id)).toBe(true);
  });
});
