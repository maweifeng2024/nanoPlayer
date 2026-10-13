import { describe, expect, it } from "vitest";
import type { Track, LibraryRoot } from "../domain";
import { trackInRoots, trackIsSelected } from "./folderFilter";
describe("folder filtering", () => {
  it("includes descendants and multiple roots without sibling prefix collisions", () => {
    const roots = [{ path: "/Music/Jazz/" }, { path: "/Music/Rock" }];
    expect(trackInRoots("/Music/Jazz/Album/a.flac", roots)).toBe(true);
    expect(trackInRoots("/Music/Rock/b.mp3", roots)).toBe(true);
    expect(trackInRoots("/Music/Jazz-old/a.flac", roots)).toBe(false);
    expect(trackInRoots("/Music/jazz/a.flac", roots)).toBe(false);
    expect(trackInRoots("/Music/Jazz/a.flac", [])).toBe(false);
    expect(trackInRoots("", roots)).toBe(false);
  });
  it("handles Windows drive and UNC paths", () => {
    expect(trackInRoots("C:\\Music\\Album\\a.flac", [{ path: "c:/music" }])).toBe(true);
    expect(trackInRoots("\\\\Server\\Music\\a.flac", [{ path: "//server/music/" }])).toBe(true);
  });
});

it("invalidates cached selection when roots or selected IDs change", () => {
  const track = { rootId: 2, path: "/Music/a.flac" } as Track;
  const roots = [{ id: 2, path: "/Music" }] as LibraryRoot[];
  expect(trackIsSelected(track, { roots, selectedRootIds: [2] })).toBe(true);
  expect(trackIsSelected(track, { roots, selectedRootIds: [] })).toBe(false);
  const selectedRootIds = [2];
  const legacy = { path: "/Music/a.flac" } as Track;
  expect(trackIsSelected(legacy, { roots, selectedRootIds })).toBe(true);
  expect(trackIsSelected(legacy, {
    roots: [{ id: 2, path: "/Other" }] as LibraryRoot[], selectedRootIds,
  })).toBe(false);
  expect(trackIsSelected(track, { roots: [], selectedRootIds: null })).toBe(true);
});
