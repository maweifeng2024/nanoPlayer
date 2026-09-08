import { describe, expect, it } from "vitest";
import { trackInRoots } from "./folderFilter";
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
