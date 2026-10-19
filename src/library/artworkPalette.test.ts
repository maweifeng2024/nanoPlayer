import { describe, expect, it } from "vitest";
import { extractPalette, neutralPalette, softenPalette } from "./artworkPalette";
const pixels = (colors: number[][]) =>
  new Uint8ClampedArray(colors.flatMap((rgb) => [...rgb, 255]));
describe("artwork palette", () => {
  it("ignores empty, transparent and black/white artwork", () => {
    expect(extractPalette(new Uint8ClampedArray())).toEqual(neutralPalette);
    expect(extractPalette(new Uint8ClampedArray([200, 80, 80, 0]))).toEqual(neutralPalette);
    expect(
      extractPalette(
        pixels([
          [0, 0, 0],
          [255, 255, 255],
        ]),
      ),
    ).toEqual(neutralPalette);
  });
  it("averages a bucket and never invents a second hue for a single-color cover", () => {
    const result = extractPalette(
      pixels([
        [80, 112, 144],
        [94, 126, 158],
      ]),
    );
    expect(result).toEqual({ primary: "rgb(87, 119, 151)", secondary: "rgb(87, 119, 151)" });
  });
  it("prefers large regions over a small vivid logo and softens high chroma", () => {
    const result = extractPalette(
      pixels([...Array.from({ length: 20 }, () => [80, 120, 150]), [240, 40, 40]]),
    );
    expect(result.primary).toBe("rgb(80, 120, 150)");
    const softened = softenPalette({ primary: "rgb(240, 40, 40)", secondary: "rgb(10, 30, 50)" });
    for (const color of Object.values(softened)) {
      const channels: number[] = color.match(/\d+/g)!.map(Number);
      expect(Math.max(...channels) - Math.min(...channels)).toBeLessThan(100);
      expect(channels.every((v) => v >= 0 && v <= 255)).toBe(true);
    }
  });
});
