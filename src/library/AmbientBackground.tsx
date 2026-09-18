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
  useEffect(() => {
    let active = true;
    const fallback = track?.color
      ? { primary: track.color, secondary: neutralPalette.secondary }
      : neutralPalette;
    if (!track) {
      setPalette(fallback);
      return;
    }
    void loadArtwork(track).then((source) => {
      if (!active) return;
      if (!source) {
        setPalette(fallback);
        return;
      }
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 32;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) {
            setPalette(fallback);
            return;
          }
          context.drawImage(image, 0, 0, 32, 32);
          setPalette(extractPalette(context.getImageData(0, 0, 32, 32).data));
        } catch {
          setPalette(fallback);
        }
      };
      image.onerror = () => {
        if (active) setPalette(fallback);
      };
      image.src = source;
    });
    return () => {
      active = false;
    };
  }, [track?.id, track?.artworkHash, track?.hasArtwork, track?.color]);
  useEffect(() => {
    if (!isAndroid()) return;
    const root = document.documentElement;
    const sync = () => {
      const light = root.dataset.theme === "light";
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = light ? "#f8f7f5" : "#18181b";
      context.fillRect(0, 0, 1, 1);
      context.globalAlpha = light ? 0.1 : 0.18;
      context.fillStyle = palette.primary;
      context.fillRect(0, 0, 1, 1);
      const rgb = context.getImageData(0, 0, 1, 1).data;
      const color =
        "#" + Array.from(rgb.slice(0, 3), (value) => value.toString(16).padStart(2, "0")).join("");
      root.style.setProperty("--mobile-surface", color);
      if (isTauri()) void androidCommand("systemBars", { color, light }).catch(() => undefined);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [palette.primary]);
  return (
    <div
      className="ambient-background"
      aria-hidden="true"
      style={
        {
          "--ambient-primary": palette.primary,
          "--ambient-secondary": palette.secondary,
        } as CSSProperties
      }
    />
  );
}
