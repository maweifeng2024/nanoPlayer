import { describe, expect, it } from "vitest";
import type { Track } from "../domain";
import { recentAlbums } from "./recentAlbums";

const track = (id: number, album: string, addedAt: string): Track => ({
  id,
  album,
  addedAt,
  title: `Track ${id}`,
  artist: "Artist",
  path: `/synthetic/${id}.flac`,
  durationMs: 1000,
  format: "FLAC",
});
describe("recent album entry points", () => {
  it("orders albums by their latest visible addition and counts the whole visible album", () => {
    const input = [
      track(1, "A", "2026-01-01"),
      track(2, "B", "2026-02-01"),
      track(3, "A", "2026-03-01"),
    ];
    const copy = structuredClone(input);
    expect(recentAlbums(input, "Unknown")).toMatchObject([
      { name: "A", count: 2, track: { id: 3 } },
      { name: "B", count: 1 },
    ]);
    expect(input).toEqual(copy);
  });
  it("bounds output and matches existing unknown-album collection identity", () => {
    expect(
      recentAlbums([track(1, "", "2026-01-01"), track(2, "B", "2026-01-01")], "Unknown", 1),
    ).toMatchObject([{ name: "Unknown", count: 1 }]);
    expect(recentAlbums([], "Unknown")).toEqual([]);
  });
});
