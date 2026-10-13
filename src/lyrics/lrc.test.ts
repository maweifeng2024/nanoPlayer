import { describe, expect, it } from "vitest";
import { activeLyricIndex, parseLyrics } from "./lrc";

describe("LRC parser", () => {
  it("supports offset, fractional seconds and repeated timestamps", () => {
    const result = parseLyrics(
      "[offset:-200]\n[00:01.50][00:03.250]同一句\n[ar:Artist]\n[00:02]第二句",
    );
    expect(result.synchronized).toBe(true);
    expect(result.lines).toEqual([
      { at: 1300, text: "同一句" },
      { at: 1800, text: "第二句" },
      { at: 3050, text: "同一句" },
    ]);
    expect(activeLyricIndex(result.lines, 2000)).toBe(1);
  });

  it("preserves plain text without making it seekable", () => {
    expect(parseLyrics("第一行\n第二行")).toEqual({
      synchronized: false,
      lines: [
        { at: null, text: "第一行" },
        { at: null, text: "第二行" },
      ],
    });
  });
});

it("keeps enhanced LRC word times with global offsets", () => {
  const result = parseLyrics("[offset:100]\n[00:01.00]<00:01.00>Hello <00:02.00>world<00:03.00>");
  expect(result.lines[0].text).toBe("Hello world");
  expect(result.lines[0].words).toEqual([
    { at: 1100, text: "Hello " },
    { at: 2100, text: "world" },
    { at: 3100, text: "" },
  ]);
  expect(activeLyricIndex(result.lines, 1099)).toBe(-1);
});
