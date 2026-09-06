export interface ArtworkPalette {
  primary: string;
  secondary: string;
}
export const neutralPalette: ArtworkPalette = { primary: "#66768c", secondary: "#7c6c87" };

/** Quantized dominant colors, weighted toward chroma, excluding black/white borders. */
export function extractPalette(pixels: Uint8ClampedArray): ArtworkPalette {
  const buckets = new Map<string, { rgb: number[]; score: number }>();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (max < 28 || min > 232) continue;
    const key = rgb.map((v) => Math.floor(v / 32)).join(":");
    const bucket = buckets.get(key) ?? { rgb, score: 0 };
    bucket.score += 1 + (max - min) / 128;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.score - a.score);
  if (!ranked.length) return neutralPalette;
  const first = ranked[0].rgb;
  const second = ranked.find(
    ({ rgb }) => rgb.reduce((sum, v, i) => sum + (v - first[i]) ** 2, 0) > 6000,
  )?.rgb ?? [first[1], first[2], first[0]];
  const color = (rgb: number[]) => `rgb(${rgb.join(", ")})`;
  return { primary: color(first), secondary: color(second) };
}
