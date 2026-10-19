export interface ArtworkPalette {
  primary: string;
  secondary: string;
}
export const neutralPalette: ArtworkPalette = { primary: "#66768c", secondary: "#7c6c87" };

/** Quantized dominant colors, weighted toward chroma, excluding black/white borders. */
export function extractPalette(pixels: Uint8ClampedArray): ArtworkPalette {
  const buckets = new Map<string, { rgb: number[]; score: number; count: number }>();
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;
    const rgb = [pixels[index], pixels[index + 1], pixels[index + 2]];
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (max < 28 || min > 232) continue;
    const key = rgb.map((v) => Math.floor(v / 32)).join(":");
    const bucket = buckets.get(key) ?? { rgb: [0, 0, 0], score: 0, count: 0 };
    bucket.score += 1 + Math.min(max - min, 96) / 192;
    bucket.count += 1;
    rgb.forEach((value, channel) => {
      bucket.rgb[channel] += value;
    });
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      rgb: bucket.rgb.map((value) => Math.round(value / bucket.count)),
    }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return neutralPalette;
  const first = ranked[0].rgb;
  const second =
    ranked.find(({ rgb }) => rgb.reduce((sum, v, i) => sum + (v - first[i]) ** 2, 0) > 6000)?.rgb ??
    first;
  const color = (rgb: number[]) => `rgb(${rgb.join(", ")})`;
  return { primary: color(first), secondary: color(second) };
}

/** Limit homepage chroma/brightness without inventing a complementary hue. */
export function softenPalette(palette: ArtworkPalette): ArtworkPalette {
  const soften = (color: string) => {
    const rgb = color.startsWith("#")
      ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
      : color.match(/\d+/g)!.map(Number);
    const gray = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const shift = Math.max(80, Math.min(160, gray)) - gray;
    return `rgb(${rgb.map((value) => Math.round(Math.max(0, Math.min(255, gray + (value - gray) * 0.48 + shift)))).join(", ")})`;
  };
  return { primary: soften(palette.primary), secondary: soften(palette.secondary) };
}
