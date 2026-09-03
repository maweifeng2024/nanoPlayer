import type { Track } from "../domain";

export function selectPlaylistCoverTracks(items: Track[], seed: string): Track[] {
  const score = (value: string) => {
    let hash = 2166136261;
    for (const character of `${seed}:${value}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const groups = new Map<string, { count: number; track?: Track }>();
  for (const track of items) {
    const key = `${track.artist}\u0000${track.album}`;
    const group = groups.get(key) ?? { count: 0 };
    group.count += 1;
    if (!group.track && track.hasArtwork) group.track = track;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter((entry): entry is [string, { count: number; track: Track }] => Boolean(entry[1].track))
    .sort(
      ([leftKey, left], [rightKey, right]) =>
        right.count - left.count || score(leftKey) - score(rightKey),
    )
    .slice(0, 4)
    .map(([, group]) => group.track);
}
