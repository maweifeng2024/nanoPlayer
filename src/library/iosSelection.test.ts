import { afterEach, expect, test } from "vitest";
import { demoTracks } from "../domain";
import { useNanoStore } from "../store";
import { trackIsSelected, visiblePlaylists } from "./folderFilter";
const original = useNanoStore.getState();
afterEach(() => useNanoStore.setState(original));
test("iOS first-level participation filters descendants, playlist and queue without deleting data", () => {
  const tracks = ["/Music/A/a.wav", "/Music/A/deep/b.wav", "/Music/AB/c.wav", "/Music/root.wav"].map((path, i) => ({ ...demoTracks[0], id: i + 1, path }));
  useNanoStore.setState({ tracks, libraryScopes: [], selectedRootIds: null, queue: [1, 2, 3, 4], currentTrackId: 3, progressMs: 42000,
    playlists: [{ id: "mixed", name: "mix", trackIds: [1, 3] }, { id: "excluded", name: "out", trackIds: [1, 2] }] });
  useNanoStore.getState().setLibraryScopes([{ id: "A", path: "/Music/A", selected: false }, { id: "AB", path: "/Music/AB", selected: true }, { id: "root", path: "/Music", directOnly: true, selected: false }]);
  const state = useNanoStore.getState();
  expect(tracks.map((t) => trackIsSelected(t, state))).toEqual([false, false, true, false]);
  expect(state.queue).toEqual([3]);
  expect(state.progressMs).toBe(42000);
  expect(state.tracks).toHaveLength(4);
  expect(state.playlists[0].trackIds).toEqual([1, 3]);
  expect(visiblePlaylists(state).map((p) => p.id)).toEqual(["mixed"]);
  state.setLibraryScopes(state.libraryScopes.map((scope) => ({ ...scope, selected: false })));
  expect(useNanoStore.getState().queue).toEqual([]);
  expect(useNanoStore.getState().currentTrackId).toBeUndefined();
});
