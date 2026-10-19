import type { Playlist } from "../domain";

/** Return the original array in the common case to keep shallow selectors stable. */
export function uniquePlaylists(playlists: Playlist[]) {
  const ids = new Set<string>();
  const unique = playlists.filter((playlist) => {
    if (ids.has(playlist.id)) return false;
    ids.add(playlist.id);
    return true;
  });
  return unique.length === playlists.length ? playlists : unique;
}

/** Menu targets have stable identities; identical names need not be the same playlist. */
export function playlistTargets(playlists: Playlist[]) {
  const unique = uniquePlaylists(playlists);
  const names = new Map<string, number>();
  for (const playlist of unique) names.set(playlist.name, (names.get(playlist.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return unique.map((playlist) => {
    const index = (seen.get(playlist.name) ?? 0) + 1;
    seen.set(playlist.name, index);
    return {
      playlist,
      label: names.get(playlist.name)! > 1 ? `${playlist.name} (${index})` : playlist.name,
    };
  });
}
