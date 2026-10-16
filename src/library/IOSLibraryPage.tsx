import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, ChevronRight, Folder, FolderPlus, MoreHorizontal, Music2, RefreshCw } from "lucide-react";
import { useNanoStore } from "../store";
import { useModalBehavior } from "../useModalBehavior";
import { isTauri, removeLibraryRoot, rescanLibraryRoot } from "../tauriBridge";
import { formatBytes, formatDate } from "../domain";
import { trackIsSelected } from "./folderFilter";
import { IOSFolderPicker, IOSLibraryDialog } from "./IOSLibraryDialogs";
import { WifiTransfer } from "./WifiTransfer";
import {
  cancelIOSReference, commitIOSReference, importIOSFiles, iosLibraryCommand, loadIOSLibrary, parentPath, pickIOSSource,
  removeIOSPreviewSource, summarizeFiles, syncIOSLibrary,
  type IOSEntry, type IOSLibrary, type IOSSource, type FileResults, type IOSReferenceDraft,
} from "./iosLibrary";

type Dialog = { kind: "reference"; draft: IOSReferenceDraft } | { kind: "add" } | { kind: "create" } | { kind: "rename" | "delete"; entry: IOSEntry } |
  { kind: "edit" | "remove" | "scope"; source: IOSSource } |
  { kind: "target"; operation: "import" | "move" | "copy"; entry?: IOSEntry };
const empty: IOSLibrary = { managedUri: "", sources: [], directories: [], sourceEnabled: {} };

export function IOSLibraryPage() {
  const roots = useNanoStore((state) => state.roots);
  const tracks = useNanoStore((state) => state.tracks);
  const scopes = useNanoStore((state) => state.libraryScopes);
  const scanning = useNanoStore((state) => state.scanning);
  const [library, setLibrary] = useState<IOSLibrary>(empty);
  const [activeId, setActiveId] = useState<string>();
  const [path, setPath] = useState("");
  const [directOnly, setDirectOnly] = useState(false);
  const [entries, setEntries] = useState<IOSEntry[]>([]);
  const [dialog, setDialog] = useState<Dialog>();
  const [menu, setMenu] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [revision, setRevision] = useState(0);
  const [limit, setLimit] = useState(100);
  const menuRef = useModalBehavior(!!menu, () => setMenu(undefined), true);
  const menuAnchor = useRef({ x: 0, y: 0 });
  const toggleMenu = (id: string, event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    menuAnchor.current = { x: bounds.right, y: bounds.bottom };
    setMenu(menu === id ? undefined : id);
  };
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!menu || !element) return;
    element.style.left = `${Math.max(8, Math.min(menuAnchor.current.x - element.offsetWidth, innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menuAnchor.current.y, innerHeight - element.offsetHeight - 8))}px`;
  }, [menu]);
  const source = library.sources.find((item) => item.id === activeId);
  const managed = source?.kind === "managed";
  const root = roots.find((item) => item.path === source?.uri);
  const refresh = () => setRevision((value) => value + 1);
  const work = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setResult(""); setMenu(undefined);
    try { await operation(); refresh(); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let active = true;
    void loadIOSLibrary().then(async (next) => {
      if (!active) return;
      setLibrary(next);
      if (isTauri() && !useNanoStore.getState().roots.some((item) => item.path === next.managedUri)) await syncIOSLibrary(next.managedUri);
    }).catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    let active = true;
    setMenu(undefined); setEntries([]); setLimit(100);
    if (activeId) void iosLibraryCommand<{ entries: IOSEntry[] }>("libraryBrowse", { sourceId: activeId, relativePath: path })
      .then((next) => { if (active) setEntries(next.entries); }).catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [activeId, path, revision]);
  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !menuRef.current?.contains(target) && !target.closest('button[aria-expanded="true"]')) setMenu(undefined);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [menu]);
  const back = () => {
    if (path && !directOnly) setPath(parentPath(path));
    else { setActiveId(undefined); setPath(""); setDirectOnly(false); }
  };
  useEffect(() => {
    const handler = (event: Event) => {
      if (event.defaultPrevented || dialog || menu || !activeId) return;
      event.preventDefault(); back();
    };
    window.addEventListener("android-back", handler);
    return () => window.removeEventListener("android-back", handler);
  }, [activeId, path, directOnly, dialog, menu]);
  const browse = (id: string, nextPath = "", direct = false) => {
    setActiveId(id); setPath(nextPath); setDirectOnly(direct); setError("");
  };
  const setParticipation = async (id: string, enabled: boolean, confirmed = false) => {
    await iosLibraryCommand("librarySelect", { sourceId: id, enabled, confirmed });
    await loadIOSLibrary();
    setResult(enabled ? "已加入音乐库，包含所有子目录" : "已从音乐浏览和播放范围排除，原文件保留");
  };
  const openEntry = (entry: IOSEntry) => {
    if (entry.directory) { setPath(entry.path); return; }
    const state = useNanoStore.getState();
    const track = state.tracks.find((item) => item.path === `${source?.uri}/${entry.path}`);
    if (!track) { setResult("歌曲尚不可用；云端文件需先在 Files 下载后重新扫描。"); return; }
    if (!trackIsSelected(track, state)) { setResult("此一级目录未勾选，请在资源库首页勾选后播放。"); return; }
    state.playTrack(track.id, state.tracks.filter((item) => item.rootId === root?.id && trackIsSelected(item, state)).map((item) => item.id));
  };
  const draftRef = useRef<IOSReferenceDraft | undefined>(undefined);
  useEffect(() => () => { if (draftRef.current) void cancelIOSReference(draftRef.current); }, []);
  const closeDialog = () => {
    if (busy) return;
    if (draftRef.current) { void cancelIOSReference(draftRef.current); draftRef.current = undefined; }
    setDialog(undefined);
  };
  const addReference = () => { setDialog(undefined); void work(async () => {
    const draft = await pickIOSSource("files", "", "");
    if (draft) { draftRef.current = draft; setDialog({ kind: "reference", draft }); }
  }); };
  const requestDelete = (entry: IOSEntry) => void work(async () => {
    const data = await iosLibraryCommand<{ entries: IOSEntry[] }>("libraryBrowse", { sourceId: "managed", relativePath: parentPath(entry.path) });
    const current = data.entries.find((item) => item.path === entry.path);
    if (!current) throw new Error("目录已变化，请刷新后重试");
    setDialog({ kind: "delete", entry: current });
  });
  const sourceRow = (item: IOSSource, itemPath: string, id: string, label: string, direct = false) => {
    const uri = item.uri + (itemPath ? `/${itemPath}` : "");
    const count = tracks.filter((track) => track.path.startsWith(uri + "/") && (!direct || !track.path.slice(uri.length + 1).includes("/"))).length;
    const enabled = scopes.find((scope) => scope.id === id)?.selected ?? true;
    return <article className="ios-source-row" key={id}>
      <label className="ios-source-index"><input type="checkbox" aria-label={`加入音乐库 ${label}`} disabled={busy || scanning}
        checked={enabled} onChange={(event) => {
          const checked = event.target.checked;
          if (checked && item.kind !== "managed" && item.indexPaths !== null) setDialog({ kind: "scope", source: item });
          else void work(() => setParticipation(id, checked));
        }} /></label>
      <button className="ios-source-open" aria-label={`浏览 ${label}`} onClick={() => browse(item.id, itemPath, direct)}>
        <Folder size={22} /><span><strong>{label}</strong><small>{item.kind === "managed" ? `${count} 首 · ${direct ? "仅根层音频" : "含所有子目录"}` : `${item.location || "Files"} · 只读引用 · ${count} 首`}</small>
          {item.kind !== "managed" && <small>{item.authorized === false ? "需重新授权" : !item.available ? "来源不可用" : item.indexPaths !== null ? "旧部分范围保留，勾选时确认整个来源" : "存储于外部 · 无自有副本"}</small>}</span>
      </button>
      {(!direct && (item.kind !== "managed" || !!itemPath)) && <button className="icon-button" aria-label={`更多操作 ${label}`} aria-expanded={menu === id} onClick={(event) => toggleMenu(id, event)}><MoreHorizontal size={18} /></button>}
      {item.kind !== "managed" && item.indexPaths !== null && <button className="text-button" onClick={() => setDialog({ kind: "scope", source: item })}>确认一级范围</button>}
      <ChevronRight size={16} aria-hidden="true" />
      {menu === id && item.kind === "managed" && itemPath && <div ref={(node) => { menuRef.current = node; }} className="context-menu menu-popover ios-source-menu" role="menu">
        <button role="menuitem" disabled={itemPath === "收件箱"} onClick={() => { setMenu(undefined); setDialog({ kind: "rename", entry: { path: itemPath, name: label, directory: true, sizeBytes: 0, indexed: true } }); }}>重命名</button>
        <button role="menuitem" disabled={itemPath === "收件箱"} onClick={() => { setMenu(undefined); setDialog({ kind: "target", operation: "move", entry: { path: itemPath, name: label, directory: true, sizeBytes: 0, indexed: true } }); }}>移动到</button>
        <button role="menuitem" disabled={itemPath === "收件箱"} onClick={() => requestDelete({ path: itemPath, name: label, directory: true, sizeBytes: 0, indexed: true })}>删除目录</button>
      </div>}
      {menu === id && item.kind !== "managed" && <div ref={(node) => { menuRef.current = node; }} className="context-menu menu-popover ios-source-menu" role="menu">
        <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "edit", source: item }); }}>编辑显示名称</button>
        <button role="menuitem" onClick={() => { setMenu(undefined); void work(async () => { const draft = await pickIOSSource(item.kind === "app" ? "app" : "files", item.location, item.location, item.id); if (draft) { draftRef.current = draft; setDialog({ kind: "reference", draft }); } }); }}>重新授权</button>
        <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "remove", source: item }); }}>移除引用</button>
      </div>}
    </article>;
  };
  return <section className="library-page ios-library" aria-labelledby="ios-library-title" aria-busy={busy || scanning}>
    <header className="page-header"><div><p className="eyebrow">文件夹与音乐来源</p><h1 id="ios-library-title">资源库</h1></div>
      <button className="primary-button" disabled={busy || scanning} onClick={() => setDialog({ kind: "add" })}>添加 ＋</button>
    </header>
    {!isTauri() && <p className="safety-note">浏览器演示：文件操作仅影响示例，不读取设备文件。</p>}
    {error && <p role="alert">{error}</p>}
    {result && <p role="status" className="ios-operation-result">{result}</p>}
    <div className={`ios-library-columns ${source ? "ios-library-browsing" : ""}`}>
      <div className="ios-source-list">
        <section className="ios-source-group" aria-label="nanoPlayer 资源">
          <div className="ios-section-heading"><h2>nanoPlayer <small>可管理</small></h2><WifiTransfer onImported={refresh} /></div>
          {library.directories.map((d) => sourceRow(library.sources[0], d.path, d.id, d.name, d.directOnly))}
          <button className="text-button" onClick={() => browse("managed")}>浏览 nanoPlayer 根目录</button>
        </section>
        <section className="ios-source-group" aria-label="外部只读来源"><h2>外部来源 <small>只读</small></h2>
          {library.sources.filter((item) => item.kind !== "managed").map((item) => sourceRow(item, "", item.id, item.name))}
          {!library.sources.some((item) => item.kind !== "managed") && <p>引用 Files 文件夹后在此显示。</p>}
        </section>
        <p className="safety-note">勾选的一级目录及其所有子目录参与音乐库。取消勾选不会删除文件。</p>
      </div>
      {source && <section className="ios-file-browser" aria-label={`${source.name} 文件夹内容`}>
        <header><button className="text-button" onClick={back}><ArrowLeft size={16} />{path && !directOnly ? "上一级" : "全部来源"}</button>
          <h2>{managed ? path || "nanoPlayer 根目录" : source.name}</h2>
          <p className="ios-path">{managed ? "nanoPlayer" : source.location || "Files"} / {source.originalName}{path ? ` / ${path}` : ""}</p>
          <p>{managed ? "可管理自有文件夹。只在首页勾选一级目录。" : "只读引用 · 音频存储于外部，不创建 nanoPlayer 副本。"}</p>
          <details><summary>来源信息</summary><p className="ios-path">原始位置：{source.uri}</p><p>访问方式：{managed ? "应用自有目录" : "只读引用"}</p>
            <p>添加时间：{root?.addedAt ? formatDate(root.addedAt, true) : "尚未扫描"} · 上次扫描：{root?.lastScannedAt ? formatDate(root.lastScannedAt, true) : "尚未扫描"}</p>
          </details>
        </header>
        <div className="ios-library-toolbar">
          {managed && <><button className="secondary-button" disabled={busy} onClick={() => setDialog({ kind: "create" })}><FolderPlus size={16} />新建文件夹</button>
            <button className="secondary-button" disabled={busy} onClick={() => setDialog({ kind: "target", operation: "import" })}>复制文件到此目录</button></>}
          <button className="icon-button" aria-label="重新扫描当前来源" disabled={busy || scanning} onClick={() => void work(async () => {
            if (isTauri() && root) { const data = await rescanLibraryRoot(root.id); useNanoStore.getState().replaceLibrary(data.roots, data.tracks, data.issues); }
            else await syncIOSLibrary(source.uri);
          })}><RefreshCw size={18} /></button>
        </div>
        <ul className="ios-file-list">
          {entries.filter((entry) => (!directOnly || !entry.directory)).slice(0, limit).map((entry) => <li key={entry.path}>
            <button className="ios-file-open" onClick={() => openEntry(entry)}>{entry.directory ? <Folder size={22} /> : <Music2 size={22} />}<span><strong>{entry.name}</strong><small>{entry.needsDownload ? "需在 Files 下载后重试" : entry.directory ? "文件夹" : formatBytes(entry.sizeBytes)}{!managed && " · 只读"}</small></span></button>
            <button className="icon-button" aria-label={`更多操作 ${entry.name}`} aria-expanded={menu === entry.path} onClick={(event) => toggleMenu(entry.path, event)}><MoreHorizontal size={18} /></button>
            {menu === entry.path && <div ref={(node) => { menuRef.current = node; }} className="context-menu menu-popover ios-source-menu" role="menu">
              {managed ? <><button role="menuitem" disabled={entry.path === "收件箱"} onClick={() => { setMenu(undefined); setDialog({ kind: "rename", entry }); }}>重命名</button>
                <button role="menuitem" disabled={entry.path === "收件箱"} onClick={() => { setMenu(undefined); setDialog({ kind: "target", operation: "move", entry }); }}>移动到</button>
                {entry.directory && <button role="menuitem" disabled={entry.path === "收件箱"} onClick={() => requestDelete(entry)}>删除目录</button>}
              </> : <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "target", operation: "copy", entry }); }}>复制到 nanoPlayer</button>}
            </div>}
          </li>)}
        </ul>
        {entries.length > limit && <button className="secondary-button" onClick={() => setLimit((value) => value + 100)}>显示更多</button>}
        {!entries.length && <p>此文件夹没有可显示的音乐或子文件夹。</p>}
      </section>}
    </div>
    <p className="safety-note">外部来源始终只读；移除引用不会删除源文件。</p>
    <button className="text-button" onClick={() => useNanoStore.getState().setPage("issues")}>扫描问题</button>
    {dialog?.kind === "add" && <IOSLibraryDialog title="添加到资源库" onClose={closeDialog}>
      <button className="secondary-button" onClick={addReference}>引用 Files 文件夹（只读）</button><p>读取原位置，不创建音频副本；其他 App 必须公开可选择的文件夹。</p>
      <button className="secondary-button" onClick={() => setDialog({ kind: "target", operation: "import" })}>复制文件到 nanoPlayer</button><p>创建副本并占用设备空间，外部原件保持不变。</p>
      <button className="secondary-button" onClick={() => { browse("managed"); setDialog({ kind: "create" }); }}>新建 nanoPlayer 文件夹</button>
      <p className="safety-note">Apple Music 需要单独的官方授权与播放适配；网易云私有下载缓存不能直接读取。</p>
    </IOSLibraryDialog>}
    {dialog?.kind === "target" && <IOSFolderPicker initial={managed ? path : "收件箱"} exclude={dialog.operation === "move" && dialog.entry ? [dialog.entry.path] : []} onClose={closeDialog} onChoose={(target, skip) => {
      const operation = dialog.operation, entry = dialog.entry; setDialog(undefined);
      void work(async () => {
        if (operation === "import") setResult(await importIOSFiles(target, skip));
        else {
          const response = await iosLibraryCommand<FileResults>(operation === "move" ? "libraryMove" : "libraryCopy", { sourceId: operation === "move" ? "managed" : activeId, paths: [entry!.path], target, skip });
          setResult(summarizeFiles(response)); await syncIOSLibrary(library.managedUri);
        }
      });
    }} />}
    {dialog && !["add", "target"].includes(dialog.kind) && <IOSLibraryForm key={dialog.kind} dialog={dialog as Exclude<Dialog, { kind: "add" | "target" }>} error={error} busy={busy} onClose={closeDialog} onSubmit={(name) => void work(async () => {
      if (dialog.kind === "reference") { await commitIOSReference(dialog.draft, name); draftRef.current = undefined; setResult("已添加只读引用；未创建 nanoPlayer 音频副本。"); }
      if (dialog.kind === "create") await iosLibraryCommand("libraryCreate", { relativePath: managed ? path : "", name });
      if (dialog.kind === "rename") {
        const response = await iosLibraryCommand<FileResults>("libraryRename", { sourceId: "managed", relativePath: dialog.entry.path, name });
        setResult(summarizeFiles(response)); await syncIOSLibrary(library.managedUri);
      }
      if (dialog.kind === "delete") { await iosLibraryCommand("libraryTrash", { relativePath: dialog.entry.path }); await syncIOSLibrary(library.managedUri); setResult("已移入回收站，可通过 Wi-Fi 传输恢复。"); }
      if (dialog.kind === "scope") { await setParticipation(dialog.source.id, true, true); await syncIOSLibrary(dialog.source.uri); }
      if (dialog.kind === "edit") { await iosLibraryCommand("libraryEdit", { sourceId: dialog.source.id, name }); await syncIOSLibrary(dialog.source.uri); }
      if (dialog.kind === "remove") {
        const removing = dialog.source, indexed = roots.find((item) => item.path === removing.uri);
        if (isTauri()) {
          if (indexed) { const response = await removeLibraryRoot(indexed.id); useNanoStore.getState().replaceLibrary(response.roots, response.tracks, response.issues); }
          else await iosLibraryCommand("libraryForget", { sourceId: removing.id });
        } else await removeIOSPreviewSource(removing.id);
        if (activeId === removing.id) setActiveId(undefined);
      }
      setDialog(undefined);
    })} />}
  </section>;
}

function IOSLibraryForm({ dialog, error, busy, onClose, onSubmit }: {
  dialog: Exclude<Dialog, { kind: "add" | "target" }>; error: string; busy: boolean;
  onClose: () => void; onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(dialog.kind === "reference" ? dialog.draft.name : dialog.kind === "edit" ? dialog.source.name : dialog.kind === "rename" ? dialog.entry.name : "");
  const title = { reference: "确认只读引用", create: "新建文件夹", rename: "重命名", edit: "编辑显示名称", remove: "移除只读引用", delete: "删除目录", scope: "确认一级目录范围" }[dialog.kind];
  const naming = ["reference", "create", "rename", "edit"].includes(dialog.kind);
  return <IOSLibraryDialog title={title} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(name.trim()); }}>
      {dialog.kind === "reference" && <p>原始位置：{dialog.draft.location} / {dialog.draft.name}。只读访问，音频仍存储在外部；不会复制到 nanoPlayer。</p>}
      {naming && <label>名称<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {dialog.kind === "remove" && <p>仅移除“{dialog.source.name}”的引用与授权，不删除源文件。关联歌曲将从音乐库和播放队列移除。</p>}
      {dialog.kind === "delete" && <p>“{dialog.entry.name}”（{dialog.entry.directoryCount ?? 0} 个子目录、{dialog.entry.audioCount ?? 0} 首音乐）将进入回收站并从音乐库移除，可在 Wi-Fi 传输恢复。正在使用的目录需先停止相关任务。</p>}
      {dialog.kind === "scope" && <p>旧来源“{dialog.source.name}”仅索引了部分内容。确认后将包含整个一级来源及所有子目录，原评分和歌单保留。</p>}
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={busy || (naming && !name.trim())}>{busy ? "处理中…" : naming ? "保存" : "确认"}</button>
    </form>
  </IOSLibraryDialog>;
}
