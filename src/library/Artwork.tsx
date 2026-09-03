import { useEffect, useState } from "react";
import type { Track } from "../domain";
import { getArtworkDataUrl, isTauri } from "../tauriBridge";

const artworkCache = new Map<string, Promise<string | null>>();

function loadArtwork(track: Track) {
  if (!track.hasArtwork || track.id < 0 || !isTauri()) return Promise.resolve(null);
  const key = `${track.id}:${track.artworkHash ?? ""}`;
  let request = artworkCache.get(key);
  if (!request) {
    request = getArtworkDataUrl(track.id).catch(() => null);
    artworkCache.set(key, request);
  }
  return request;
}

export function Artwork({
  track,
  className,
  fallback,
}: {
  track?: Track;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSource(null);
    if (track)
      loadArtwork(track).then((value) => {
        if (active) setSource(value);
      });
    return () => {
      active = false;
    };
  }, [track?.id, track?.hasArtwork, track?.artworkHash]);

  return (
    <div className={className}>
      {source ? <img src={source} alt={`${track?.album ?? "专辑"}封面`} /> : fallback}
    </div>
  );
}
