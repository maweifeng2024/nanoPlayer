import type { LibraryRoot, Track, Playlist } from "../domain";

// Match directory boundaries, including nested roots and Windows separators.
// POSIX paths remain case-sensitive; Windows drive/UNC paths are case-insensitive.
export function trackInRoots(path: string, roots: Pick<LibraryRoot, "path">[]) {
  const normalize = (value: string) => {
    const slash = value.replace(/\\/g, "/").replace(/\/+$/, "");
    return /^[a-z]:/i.test(slash) || slash.startsWith("//") ? slash.toLowerCase() : slash;
  };
  const candidate = normalize(path);
  return Boolean(path) && roots.some((root) => candidate.startsWith(`${normalize(root.path)}/`));
}

export interface LibraryScope { id: string; path: string; selected: boolean; directOnly?: boolean }
export type LibrarySelection = { libraryScopes?: LibraryScope[]; roots: LibraryRoot[]; selectedRootIds: number[] | null };
const selectionCache = new WeakMap<number[], WeakMap<LibraryRoot[], {
  ids: Set<number>;
  roots: LibraryRoot[];
}>>();
export function trackIsSelected(track: Track, state: LibrarySelection) {
  const scope = state.libraryScopes?.find((item) => track.path.startsWith(item.path + "/") &&
    (!item.directOnly || !track.path.slice(item.path.length + 1).includes("/")));
  if (scope) return scope.selected;
  if (state.selectedRootIds === null) return true;
  let byRoots = selectionCache.get(state.selectedRootIds);
  if (!byRoots) {
    byRoots = new WeakMap();
    selectionCache.set(state.selectedRootIds, byRoots);
  }
  let selection = byRoots.get(state.roots);
  if (!selection) {
    const ids = new Set(state.selectedRootIds);
    selection = { ids, roots: state.roots.filter((root) => ids.has(root.id)) };
    byRoots.set(state.roots, selection);
  }
  return track.rootId !== undefined
    ? selection.ids.has(track.rootId)
    : trackInRoots(track.path, selection.roots);
}
export function visiblePlaylists(
  state: LibrarySelection & { tracks: Track[]; playlists: Playlist[] },
) {
  if (state.selectedRootIds === null && !state.libraryScopes?.some((scope) => !scope.selected)) return state.playlists;
  const ids = new Set(
    state.tracks.filter((track) => trackIsSelected(track, state)).map((track) => track.id),
  );
  return state.playlists.filter((list) => list.trackIds.some((id) => ids.has(id)));
}
