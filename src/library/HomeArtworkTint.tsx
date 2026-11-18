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
  const [palette, setPalette] = useState(() => palettes.get(key) ?? neutralPalette);
  useEffect(() => {
    let active = true;
    if (!track.hasArtwork) {
      setPalette(neutralPalette);
      return;
    }
    const cached = palettes.get(key);
    if (cached) {
      setPalette(cached);
      return;
    }
    void loadArtwork(track)
      .then((source) => {
        if (!active) return;
        if (!source) {
          setPalette(neutralPalette);
          return;
        }
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
            setPalette(palette);
          } catch {
            setPalette(neutralPalette);
          }
        };
        image.onerror = () => {
          if (active) setPalette(neutralPalette);
        };
        image.src = source;
      })
      .catch(() => {
        if (active) setPalette(neutralPalette);
      });
    return () => {
      active = false;
    };
  }, [key, track.hasArtwork, track]);
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
