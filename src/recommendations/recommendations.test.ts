import { describe, expect, it } from "vitest";
import type { Track } from "../domain";
import { buildRequest, eligibleTracks, intervalMs, LIMIT, validatedIds } from "./recommendations";

const tracks = Array.from({ length: 1000 }, (_, i) => ({
  id: i + 1,
  title: `歌曲 ${i}`,
  artist: `艺术家 ${i % 20}`,
  path: `/private/music/${i}`,
  album: "album",
  durationMs: 1000,
  format: "wav",
  addedAt: "2026-11-09",
})) as Track[];
describe("local discovery", () => {
  it("excludes recent and equally or more frequently played tracks", () => {
    const stats = { lastPlayedAt: { 1: "2026-11-09" }, playCounts: { 1: 5, 2: 5, 3: 6, 4: 4 } };
    const ids = eligibleTracks(tracks, stats).map((track) => track.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(3);
    expect(ids).toContain(4);
    expect(ids).toContain(5);
  });
  it("rotates candidates without repeats until the available pool is exhausted", () => {
    const stats = { lastPlayedAt: { 1: "2026-11-09" }, playCounts: { 1: 5 } };
    let sent: number[] = [];
    for (let i = 0; i < 20 && sent.length < tracks.length - 1; i++) {
      const request = buildRequest(tracks, stats, sent);
      expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThanOrEqual(12000);
      expect(request.candidates.length).toBeLessThanOrEqual(400);
      expect(JSON.stringify(request)).not.toContain("private/music");
      for (const item of request.candidates) expect(sent).not.toContain(item.id);
      sent.push(...request.candidates.map((track) => track.id));
    }
    expect(sent).toHaveLength(999);
    expect(buildRequest(tracks, stats, sent).candidates.length).toBeGreaterThan(0);
  });
  it("uses weekly random local discovery without history and validates model output", () => {
    const stats = { lastPlayedAt: {}, playCounts: {} };
    expect(eligibleTracks(tracks, stats)).toHaveLength(1000);
    expect(intervalMs(tracks, stats, Date.now())).toBe(7 * 86400000);
    expect(validatedIds([2, 2, 9999, "3", null, 3], new Set([2, 3]))).toEqual([2, 3]);
    expect(
      validatedIds(
        tracks.map((track) => track.id),
        new Set(tracks.map((track) => track.id)),
      ),
    ).toHaveLength(LIMIT);
  });
  it("schedules daily and three-day generation using native numeric or ISO dates", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    const recent = Object.fromEntries(
      tracks.slice(0, 30).map((track) => [track.id, String(now / 1000)]),
    );
    expect(intervalMs(tracks, { lastPlayedAt: recent, playCounts: {} }, now)).toBe(86400000);
    expect(
      intervalMs(
        tracks,
        { lastPlayedAt: Object.fromEntries(Object.entries(recent).slice(0, 10)), playCounts: {} },
        now,
      ),
    ).toBe(3 * 86400000);
  });
});
