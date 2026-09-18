import { t } from "../i18n";
import { useEffect, useState } from "react";
import type { Track } from "../domain";
import { getArtworkDataUrl, isTauri } from "../tauriBridge";

// Bound native decoding work when a large library first enters the viewport.
let activeArtworkRequests = 0;
const waitingArtwork: Array<() => void> = [];
async function requestArtwork(id: number) {
  if (activeArtworkRequests >= 4)
    await new Promise<void>((resolve) => waitingArtwork.push(resolve));
  else activeArtworkRequests++;
  try {
    return await getArtworkDataUrl(id);
  } finally {
    const next = waitingArtwork.shift();
    if (next) next();
    else activeArtworkRequests--;
  }
}

const artworkCache = new Map<string, Promise<string | null>>();

export function loadArtwork(track: Track) {
  if (!track.hasArtwork || track.id < 0 || !isTauri()) return Promise.resolve(null);
  const key = `${track.id}:${track.artworkHash ?? ""}`;
  let request = artworkCache.get(key);
  if (!request) {
    request = requestArtwork(track.id).catch(() => null);
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
      {source ? (
        <img src={source} alt={t("{0}封面", track?.album ?? t("专辑"))} />
      ) : track ? (
        <img src="/album-placeholder.svg" alt="" />
      ) : (
        fallback
      )}
    </div>
  );
}
