import { useEffect, useState, type CSSProperties } from "react";
import type { Track } from "../domain";
import { loadArtwork } from "./Artwork";
import {
  extractPalette,
  neutralPalette,
  softenPalette,
  type ArtworkPalette,
} from "./artworkPalette";

// Small bounded cache: neither decoded images nor full-resolution canvas data survive a request.
const palettes = new Map<string, ArtworkPalette>();
export function HomeArtworkTint({ track }: { track: Track }) {
  const key = `${track.id}:${track.artworkHash ?? ""}`;
  const [result, setResult] = useState<{ key: string; palette: ArtworkPalette }>();
  useEffect(() => {
    let active = true;
    if (!track.hasArtwork) return;
    const cached = palettes.get(key);
    if (cached) {
      setResult({ key, palette: cached });
      return;
    }
    void loadArtwork(track)
      .then((source) => {
        if (!active || !source) return;
        const image = new Image();
        image.onload = () => {
          if (!active) return;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 40;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) return;
            context.drawImage(image, 0, 0, 40, 40);
            const palette = softenPalette(extractPalette(context.getImageData(0, 0, 40, 40).data));
            if (palettes.size >= 64) palettes.delete(palettes.keys().next().value!);
            palettes.set(key, palette);
            setResult({ key, palette });
          } catch {
            // Missing/undecodable artwork uses the neutral homepage, never another track's tint.
          }
        };
        image.src = source;
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key, track.hasArtwork, track]);
  const palette = track.hasArtwork && result?.key === key ? result.palette : neutralPalette;
  return (
    <div
      className="home-artwork-tint"
      aria-hidden="true"
      style={
        {
          "--home-tint-primary": palette.primary,
          "--home-tint-secondary": palette.secondary,
        } as CSSProperties
      }
    />
  );
}
