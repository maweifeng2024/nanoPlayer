import { isAndroid, androidCommand } from "../platform/android";
import { isTauri } from "../tauriBridge";
import { useEffect, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNanoStore } from "../store";
import { loadArtwork } from "./Artwork";
import { extractPalette, neutralPalette } from "./artworkPalette";

export function AmbientBackground() {
  const { tracks, currentTrackId, lastPlayedAt } = useNanoStore(
    useShallow((state) => ({
      tracks: state.tracks,
      currentTrackId: state.currentTrackId,
      lastPlayedAt: state.lastPlayedAt,
    })),
  );
  const track =
    tracks.find((item) => item.id === currentTrackId) ??
    tracks
      .filter((item) => lastPlayedAt[item.id])
      .sort((a, b) => lastPlayedAt[b.id].localeCompare(lastPlayedAt[a.id]))[0];
  const [palette, setPalette] = useState(neutralPalette);
  const [placement, setPlacement] = useState(() => randomPlacement());
  useEffect(() => {
    let active = true;
    // Placeholder artwork must never recolor the application. Keep the last
    // real cover's palette (or the initial neutral background).
    if (!track?.hasArtwork) return;
    void loadArtwork(track).then((source) => {
      if (!active) return;
      if (!source) return;
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 32;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(image, 0, 0, 32, 32);
          setPalette(extractPalette(context.getImageData(0, 0, 32, 32).data));
          setPlacement(randomPlacement());
        } catch {
          // Decode/security failures keep the existing background.
        }
      };
      image.src = source;
    });
    return () => {
      active = false;
    };
  }, [track?.id, track?.artworkHash, track?.hasArtwork]);
  useEffect(() => {
    if (!isAndroid()) return;
    const root = document.documentElement;
    const sync = () => {
      const light = root.dataset.theme === "light";
      // All adjacent chrome and system bars share this exact base color.
      const color = light ? "#f8f7f5" : "#18181b";
      root.style.setProperty("--mobile-surface", color);
      if (isTauri()) void androidCommand("systemBars", { color, light }).catch(() => undefined);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return (
    <div
      className="ambient-background"
      aria-hidden="true"
      style={
        {
          "--ambient-primary": palette.primary,
          "--ambient-secondary": palette.secondary,
          "--ambient-primary-x": `${placement.primaryX}%`,
          "--ambient-primary-y": `${placement.primaryY}%`,
          "--ambient-secondary-x": `${placement.secondaryX}%`,
          "--ambient-secondary-y": `${placement.secondaryY}%`,
          "--ambient-spread": `${placement.spread}%`,
        } as CSSProperties
      }
    />
  );
}

function randomPlacement() {
  return {
    primaryX: 62 + Math.round(Math.random() * 16),
    primaryY: 18 + Math.round(Math.random() * 24),
    secondaryX: 76 + Math.round(Math.random() * 18),
    secondaryY: 58 + Math.round(Math.random() * 26),
    spread: 68 + Math.round(Math.random() * 12),
  };
}
