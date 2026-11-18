import { useEffect, useState } from "react";
import { Heart, Music2 } from "lucide-react";
import type { Track } from "../domain";
import { t } from "../i18n";
import { getPlaylistCover, isTauri } from "../tauriBridge";
import { Artwork, loadArtwork } from "./Artwork";
import { selectPlaylistCoverTracks } from "./playlistCover";

export function AutoPlaylistCover({
  items,
  name,
  seed,
}: {
  items: Track[];
  name: string;
  seed: string;
}) {
  const covers = selectPlaylistCoverTracks(items, seed);
  return (
    <div className={`auto-playlist-cover cover-count-${covers.length}`}>
      {covers.length ? (
        covers.map((track) => (
          <Artwork
            track={track}
            key={`${track.artist}-${track.album}`}
            fallback={<Music2 size={20} />}
          />
        ))
      ) : (
        <span className="playlist-letter">{name.slice(0, 1)}</span>
      )}
    </div>
  );
}

export function DiscoveryArtwork({ items, name }: { items: Track[]; name: string }) {
  const [images, setImages] = useState<{ source: string; album: string }[]>([]);
  const [expanded, setExpanded] = useState<string>();
  useEffect(() => {
    let active = true;
    const covers = selectPlaylistCoverTracks(items, name);
    void Promise.all(covers.map(async (track) => {
      const source = await loadArtwork(track).catch(() => null);
      if (!source) return null;
      const image = new Image();
      image.src = source;
      return image.decode().then(() => ({ source, album: track.album }), () => null);
    })).then((sources) => {
      if (!active) return;
      const unique = new Map(sources.flatMap((image) => image ? [[image.source, image] as const] : []));
      setImages([...unique.values()]);
      setExpanded((current) => current && unique.has(current) ? current : undefined);
    });
    return () => { active = false; };
  }, [items, name]);

  return (
    <div className="hero-art">
      <div className={`auto-playlist-cover cover-count-${images.length}`} aria-hidden="true">
        {images.length ? images.map(({ source }) => <img key={source} src={source} alt="" />)
          : <span className="playlist-letter">{name.slice(0, 1)}</span>}
      </div>
      {images.length > 1 && (
        <div className="discovery-gallery" role="group" aria-label={t("专辑封面")}>
          {images.map(({ source, album }) => (
            <button
              type="button"
              key={source}
              aria-label={t("{0}封面", album)}
              aria-pressed={expanded === source}
              onTransitionEnd={(event) => {
                if (event.currentTarget.getAttribute("aria-pressed") === "true")
                  event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              onClick={(event) => {
                const tile = event.currentTarget;
                setExpanded(expanded === source ? undefined : source);
                requestAnimationFrame(() => tile.scrollIntoView({ block: "nearest", inline: "nearest" }));
              }}
            >
              <img src={source} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlaylistListArtwork({
  playlistId,
  items,
  name,
}: {
  playlistId: string;
  items: Track[];
  name: string;
}) {
  const [customCover, setCustomCover] = useState<string>();

  useEffect(() => {
    let active = true;
    setCustomCover(undefined);
    if (!isTauri()) return () => undefined;
    getPlaylistCover(playlistId)
      .then((value) => {
        if (active) setCustomCover(value ?? undefined);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [playlistId]);

  return (
    <div className="playlist-list-art">
      {customCover ? (
        <img src={customCover} alt={t("{0} 歌单封面", name)} />
      ) : items.length ? (
        <AutoPlaylistCover
          items={items}
          name={name}
          seed={`${playlistId}:${items.map((item) => item.id).join(",")}`}
        />
      ) : (
        <Heart aria-hidden="true" size={28} />
      )}
    </div>
  );
}
