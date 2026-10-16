import { mobileCommand } from "../platform/mobile";
import { addLibraryRoots, getLibrarySnapshot, isTauri } from "../tauriBridge";
import { useNanoStore } from "../store";

export type SourceKind = "managed" | "files" | "app";
export interface IOSSource {
  id: string;
  kind: SourceKind;
  name: string;
  originalName: string;
  location: string;
  uri: string;
  indexPaths: string[] | null;
  available: boolean;
  authorized?: boolean;
}
export interface IOSEntry {
  path: string;
  name: string;
  directory: boolean;
  sizeBytes: number;
  indexed: boolean;
  partial?: boolean;
  needsDownload?: boolean;
  audioCount?: number;
  directoryCount?: number;
}
export interface IOSDirectory { id: string; path: string; name: string; enabled: boolean | null; directOnly?: boolean }
export interface IOSLibrary {
  managedUri: string; sources: IOSSource[]; directories: IOSDirectory[];
  sourceEnabled: Record<string, boolean>; selectionInitialized?: boolean; revision?: number; trashPaths?: string[];
}
export interface FileResults {
  uri?: string;
  mappings?: Record<string, string>;
  results?: { name: string; success?: boolean; skipped?: boolean; error?: string }[];
}

export function summarizeFiles(result: FileResults) {
  const rows = result.results ?? [];
  return `完成 ${rows.filter((row) => row.success).length} 项，跳过 ${rows.filter((row) => row.skipped).length} 项` +
    rows.filter((row) => row.error).map((row) => `；${row.name}：${row.error}`).join("");
}
export function parentPath(path: string) { return path.split("/").slice(0, -1).join("/"); }
export function insidePath(parent: string, path: string) { return parent === "" || parent === path || path.startsWith(`${parent}/`); }

// Browser preview is deliberately in-memory and clearly labelled by the view.
let previewSources: IOSSource[] = [
  { id: "managed", kind: "managed", name: "nanoPlayer", originalName: "Music", location: "nanoPlayer", uri: "/preview/Music", indexPaths: null, available: true },
  { id: "files-demo", kind: "files", name: "Files · iCloud Drive · 无损", originalName: "无损", location: "iCloud Drive", uri: "/preview/Files/无损", indexPaths: null, available: true, authorized: true },
  { id: "app-demo", kind: "app", name: "foobar2000 · Music", originalName: "Music", location: "foobar2000", uri: "/preview/foobar2000/Music", indexPaths: null, available: true, authorized: true },
];
let previewEntries: Record<string, IOSEntry[]> = {
  managed: [{ path: "收件箱", name: "收件箱", directory: true, sizeBytes: 0, indexed: true }, { path: "演唱会", name: "演唱会", directory: true, sizeBytes: 0, indexed: true }, { path: "收件箱/示例.wav", name: "示例.wav", directory: false, sizeBytes: 128, indexed: true }],
  "files-demo": [{ path: "专辑", name: "专辑", directory: true, sizeBytes: 0, indexed: true }, { path: "示例.flac", name: "示例.flac", directory: false, sizeBytes: 1024, indexed: true }],
  "app-demo": [{ path: "试听.m4a", name: "试听.m4a", directory: false, sizeBytes: 256, indexed: true }],
};
const previewEnabled: Record<string, boolean> = {};
function uniqueName(base: string, names: string[]) {
  let candidate = base, n = 2;
  while (names.some((name) => name.normalize("NFC").toLowerCase() === candidate.normalize("NFC").toLowerCase())) candidate = `${base}（${n++}）`;
  return candidate;
}
export async function iosLibraryCommand<T = FileResults>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isTauri()) return mobileCommand<T>(action, args);
  const id = String(args.sourceId ?? "managed");
  const source = previewSources.find((item) => item.id === id);
  const relative = String(args.relativePath ?? "");
  const entries = previewEntries[id] ?? [];
  const paths = (args.paths ?? []) as string[];
  if (action === "librarySelect") { previewEnabled[String(args.sourceId)] = args.enabled === true; return {} as T; }
  if (action === "librarySources") return {
    sources: structuredClone(previewSources), managedUri: previewSources[0].uri,
    directories: previewEntries.managed.filter((e) => e.directory && !parentPath(e.path)).map((e) => ({ id: e.path, path: e.path, name: e.name, enabled: previewEnabled[e.path] ?? null })),
    sourceEnabled: { ...previewEnabled },
  } as T;
  if (action === "libraryOpened") return { count: 0, names: [] } as T;
  if (!source) throw new Error("来源不存在");
  if (["libraryCreate", "libraryMove", "libraryRename", "libraryDeleteEmpty"].includes(action) && id !== "managed") throw new Error("外部来源只读");
  if (action === "libraryBrowse") return { entries: entries.filter((item) => parentPath(item.path) === relative && (args.kind !== "folders" || item.directory)).map((item) => ({ ...item, indexed: source.indexPaths === null || source.indexPaths.some((path) => insidePath(path, item.path)) })) } as T;
  if (action === "libraryCreate") {
    const raw = String(args.name ?? "").trim();
    if (!raw || /[/\\]/.test(raw) || [".", ".."].includes(raw)) throw new Error("名称无效");
    const name = uniqueName(raw, entries.filter((item) => parentPath(item.path) === relative).map((item) => item.name));
    entries.push({ path: relative ? `${relative}/${name}` : name, name, directory: true, sizeBytes: 0, indexed: true });
  }
  if (action === "libraryEdit") source.name = uniqueName(String(args.name), previewSources.filter((item) => item.id !== id).map((item) => item.name));
  if (action === "libraryIndex") source.indexPaths = args.indexAll ? null : paths;
  if (action === "libraryTrash") {
    previewEntries[id] = entries.filter((item) => !insidePath(relative, item.path));
  }
  if (action === "libraryDeleteEmpty") {
    if (entries.some((item) => item.path !== relative && insidePath(relative, item.path))) throw new Error("仅能删除空文件夹");
    previewEntries[id] = entries.filter((item) => item.path !== relative);
  }
  if (action === "libraryMove" || action === "libraryRename" || action === "libraryCopy") {
    const selected = action === "libraryRename" ? [relative] : paths;
    const target = action === "libraryRename" ? parentPath(relative) : String(args.target ?? "");
    const results: NonNullable<FileResults["results"]> = [];
    for (const path of selected) {
      const item = entries.find((entry) => entry.path === path);
      if (!item) continue;
      if (id === "managed" && action === "libraryCopy") throw new Error("自有文件请使用移动操作");
      if (id === "managed" && (insidePath(path, target) || (parentPath(path) === target && action !== "libraryRename"))) throw new Error("不能移到当前位置、自己或子文件夹");
      const managed = previewEntries.managed;
      const name = uniqueName(String(args.name ?? item.name), managed.filter((entry) => parentPath(entry.path) === target).map((entry) => entry.name));
      const next = target ? `${target}/${name}` : name;
      const tree = entries.filter((entry) => insidePath(path, entry.path)).map((entry) => ({ ...entry, path: next + entry.path.slice(path.length), name: entry.path === path ? name : entry.name }));
      if (action !== "libraryCopy") previewEntries[id] = previewEntries[id].filter((entry) => !insidePath(path, entry.path));
      previewEntries.managed.push(...tree);
      results.push({ name, success: true });
    }
    return { results } as T;
  }
  return {} as T;
}

export async function syncIOSLibrary(uri?: string) {
  if (!isTauri()) return;
  const state = useNanoStore.getState();
  state.setScanning(true);
  try {
    const result = uri ? await addLibraryRoots([uri]) : await getLibrarySnapshot();
    state.replaceLibrary(result.roots, result.tracks, result.issues);
    await loadIOSLibrary();
  } finally { state.setScanning(false); }
}
export interface IOSReferenceDraft { referenceToken: string; name: string; location: string }
let previewDraft: { kind: "files" | "app"; name: string; location: string; sourceId?: string } | undefined;
export async function pickIOSSource(kind: "files" | "app", name: string, location: string, sourceId?: string): Promise<IOSReferenceDraft | undefined> {
  if (!isTauri()) {
    previewDraft = { kind, name, location, sourceId };
    return { referenceToken: "preview-reference", name: "Music", location: location || "Files" };
  }
  const draft = await mobileCommand<IOSReferenceDraft>("pickTree", { mode: "reference", kind, name, location, sourceId });
  return draft.referenceToken ? draft : undefined;
}
export async function commitIOSReference(draft: IOSReferenceDraft, name: string) {
  if (!isTauri()) {
    if (!previewDraft) throw new Error("请重新选择文件夹");
    const previous = previewSources.find((s) => s.id === previewDraft?.sourceId);
    if (previous) previous.name = name;
    else {
      const id = `preview-${Date.now()}`;
      previewSources.push({ id, kind: previewDraft.kind, name: uniqueName(name, previewSources.map((s) => s.name)), originalName: draft.name, location: draft.location, uri: `/preview/${id}`, indexPaths: null, available: true, authorized: true });
      previewEntries[id] = [];
    }
    previewDraft = undefined; return;
  }
  const result = await mobileCommand<{ uri: string }>("libraryCommitReference", { sourceId: draft.referenceToken, name });
  await syncIOSLibrary(result.uri);
}
export async function cancelIOSReference(draft: IOSReferenceDraft) {
  if (!isTauri()) { previewDraft = undefined; return; }
  await mobileCommand("libraryCancelReference", { sourceId: draft.referenceToken });
}

export async function importIOSFiles(target: string, skip = false) {
  if (!isTauri()) return "浏览器演示不会读取或保存设备文件。";
  const result = await mobileCommand<FileResults>("pickTree", { mode: "copy", target, skip });
  if (result.uri) await syncIOSLibrary(result.uri);
  return result.results ? summarizeFiles(result) : "";
}
export async function removeIOSPreviewSource(id: string) {
  previewSources = previewSources.filter((source) => source.id !== id);
  delete previewEntries[id];
}

export async function loadIOSLibrary() {
  const library = await iosLibraryCommand<IOSLibrary>("librarySources");
  const state = useNanoStore.getState();
  const legacySelected = (uri: string) => {
    const root = state.roots.find((item) => item.path === uri);
    return library.selectionInitialized || state.selectedRootIds === null || !root || state.selectedRootIds.includes(root.id);
  };
  if (isTauri() && !library.selectionInitialized) {
    const legacy = Object.fromEntries([
      ...library.directories.map((item) => [item.id, item.enabled ?? legacySelected(library.managedUri)]),
      ...library.sources.filter((source) => source.kind !== "managed").map((source) => [source.id, library.sourceEnabled[source.id] ?? legacySelected(source.uri)]),
    ]);
    await iosLibraryCommand("libraryInitializeSelection", { events: JSON.stringify(legacy) });
    return loadIOSLibrary();
  }
  const scopes = [{ id: "trash", path: library.managedUri + "/.nanoplayer-trash", selected: false, directOnly: false }, ...library.directories.map((item) => ({ id: item.id,
    path: library.managedUri + (item.path ? "/" + item.path : ""), directOnly: item.directOnly,
    selected: item.enabled ?? legacySelected(library.managedUri),
  }))];
  for (const source of library.sources.filter((source) => source.kind !== "managed")) scopes.push({
    id: source.id, path: source.uri, directOnly: false,
    selected: library.sourceEnabled[source.id] ?? legacySelected(source.uri),
  });
  if (JSON.stringify(scopes) !== JSON.stringify(state.libraryScopes)) state.setLibraryScopes(scopes);
  return library;
}
