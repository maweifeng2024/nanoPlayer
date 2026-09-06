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
