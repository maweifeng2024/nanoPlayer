import { describe, expect, it } from "vitest";
import { playlistTargets, uniquePlaylists } from "./playlistTargets";

describe("playlist menu identities", () => {
  it("keeps unique arrays stable for shallow selectors", () => {
    const playlists = [{ id: "a", name: "Night", trackIds: [] }];
    expect(uniquePlaylists(playlists)).toBe(playlists);
    expect(uniquePlaylists([playlists[0], playlists[0]])).toEqual(playlists);
  });
  it("renders one target for duplicate IDs without modifying stored playlists", () => {
    const playlists = [
      { id: "a", name: "Night", trackIds: [1] },
      { id: "a", name: "Night", trackIds: [1, 2] },
      { id: "b", name: "Day", trackIds: [] },
    ];
    const before = structuredClone(playlists);
    expect(playlistTargets(playlists).map(({ playlist }) => playlist.id)).toEqual(["a", "b"]);
    expect(playlists).toEqual(before);
  });
  it("keeps same-name independent destinations identifiable, including empty playlists", () => {
    const targets = playlistTargets([
      { id: "a", name: "Night", trackIds: [] },
      { id: "b", name: "Night", trackIds: [2] },
    ]);
    expect(targets.map(({ label }) => label)).toEqual(["Night (1)", "Night (2)"]);
    expect(targets.map(({ playlist }) => playlist.id)).toEqual(["a", "b"]);
    expect(playlistTargets([])).toEqual([]);
  });
});
