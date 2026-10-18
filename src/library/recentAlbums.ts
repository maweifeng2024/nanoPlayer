import type { Track } from "../domain";

/** Match the existing album collection identity; input must be the visible library. */
export function recentAlbums(tracks: Track[], unknownAlbum: string, limit = 4) {
  const groups = new Map<string, { name: string; track: Track; count: number }>();
  for (const track of tracks) {
    const name = track.album || unknownAlbum;
    const group = groups.get(name);
    if (!group) groups.set(name, { name, track, count: 1 });
    else {
      group.count++;
      if (
        track.addedAt > group.track.addedAt ||
        (track.addedAt === group.track.addedAt && track.id < group.track.id)
      )
        group.track = track;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.track.addedAt.localeCompare(a.track.addedAt) || a.track.id - b.track.id)
    .slice(0, limit);
}
