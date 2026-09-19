import { useEffect, useState } from "react";
import { Heart, Music2 } from "lucide-react";
import type { Track } from "../domain";
import { t } from "../i18n";
import { getPlaylistCover, isTauri } from "../tauriBridge";
import { Artwork } from "./Artwork";
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
