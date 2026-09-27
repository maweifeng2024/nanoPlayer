import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useNanoStore, getNativeUserState, applyNativeUserState } from "../store";
import { demoRoot, demoTracks } from "../domain";
import { trackIsSelected, visiblePlaylists } from "./folderFilter";

const original = useNanoStore.getState();
const tracks = [1, 2, 3].map((id) => ({
  ...demoTracks[0],
  id,
  rootId: id === 2 ? 2 : 1,
  path: `content://provider/document/${id}`,
}));
beforeEach(() =>
  useNanoStore.setState({
    ...original,
    tracks,
    roots: [
      { ...demoRoot, id: 1 },
      { ...demoRoot, id: 2 },
    ],
    selectedRootIds: null,
    queue: [1, 2, 3],
    currentTrackId: 2,
    playing: true,
    repeatMode: "off",
    orderMode: "sequence",
    playlists: [
      { id: "mixed", name: "mixed", trackIds: [2, 1, 3] },
      { id: "other", name: "other", trackIds: [2] },
    ],
  }),
);
afterEach(() => useNanoStore.setState(original));
describe("shared library selection", () => {
  it("defaults to all and uses native root IDs for opaque Android URIs", () => {
    expect(tracks.every((track) => trackIsSelected(track, useNanoStore.getState()))).toBe(true);
    useNanoStore.getState().setSelectedRootIds([1]);
    expect(tracks.map((track) => trackIsSelected(track, useNanoStore.getState()))).toEqual([
      true,
      false,
      true,
    ]);
    expect(visiblePlaylists(useNanoStore.getState()).map((list) => list.id)).toEqual(["mixed"]);
    expect(useNanoStore.getState().playlists[0].trackIds).toEqual([2, 1, 3]);
  });
  it("skips an excluded current track, preserves the next position and prevents queue insertion", () => {
    useNanoStore.getState().setSelectedRootIds([1]);
    expect(useNanoStore.getState().currentTrackId).toBe(3);
    expect(useNanoStore.getState().queue).toEqual([1, 3]);
    useNanoStore.getState().enqueue(2);
    useNanoStore.getState().playNext(2);
    expect(useNanoStore.getState().queue).toEqual([1, 3]);
    useNanoStore.getState().playTrack(2, [2, 1, 3]);
    expect(useNanoStore.getState().currentTrackId).toBe(1);
    useNanoStore.getState().next();
    expect(useNanoStore.getState().currentTrackId).toBe(3);
    useNanoStore.getState().previous();
    expect(useNanoStore.getState().currentTrackId).toBe(1);
  });
  it("keeps the current playback position when its root stays selected", () => {
    useNanoStore.setState({
      currentTrackId: 1,
      progressMs: 42000,
      shuffleOrder: [1, 3, 2],
      orderMode: "shuffle",
    });
    useNanoStore.getState().setSelectedRootIds([1]);
    expect(useNanoStore.getState().progressMs).toBe(42000);
    expect(useNanoStore.getState().shuffleOrder).toEqual([1, 3]);
  });
  it("selecting none stops playback, survives rescan and persists to native state", () => {
    useNanoStore.getState().setSelectedRootIds([]);
    useNanoStore.getState().togglePlay();
    useNanoStore.getState().replaceLibrary(useNanoStore.getState().roots, tracks, []);
    expect(useNanoStore.getState().playing).toBe(false);
    expect(useNanoStore.getState().queue).toEqual([]);
    expect(visiblePlaylists(useNanoStore.getState())).toEqual([]);
    const saved = getNativeUserState();
    useNanoStore.getState().setSelectedRootIds(null);
    applyNativeUserState(saved);
    expect(useNanoStore.getState().selectedRootIds).toEqual([]);
  });
});
