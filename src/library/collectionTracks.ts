import type { Track } from "../domain";

export type CollectionKind = "recent" | "popular" | "rated";
type Statistics = {
  playCounts: Record<number, number>;
  ratings: Record<number, number>;
  lastPlayedAt: Record<number, string>;
};

export function collectionTracks(
  tracks: Track[],
  kind: CollectionKind,
  stats: Statistics,
): Track[] {
  return tracks
    .filter((track) =>
      kind === "popular"
        ? (stats.playCounts[track.id] ?? 0) > 0
        : kind === "rated"
          ? (stats.ratings[track.id] ?? 0) >= 4
          : true,
    )
    .sort((a, b) => {
      const order =
        kind === "recent"
          ? b.addedAt.localeCompare(a.addedAt)
          : kind === "popular"
            ? (stats.lastPlayedAt[b.id] ?? "").localeCompare(stats.lastPlayedAt[a.id] ?? "")
            : (stats.ratings[b.id] ?? 0) - (stats.ratings[a.id] ?? 0);
      return order || a.id - b.id;
    });
}
