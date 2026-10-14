import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, Folder, FolderPlus, MoreHorizontal, Music2, RefreshCw } from "lucide-react";
import { useNanoStore } from "../store";
import { useModalBehavior } from "../useModalBehavior";
import { isTauri, removeLibraryRoot, rescanLibraryRoot } from "../tauriBridge";
import { formatBytes, formatDate } from "../domain";
import { IOSFolderPicker, IOSLibraryDialog } from "./IOSLibraryDialogs";
import { WifiTransfer } from "./WifiTransfer";
import {
  importIOSFiles, insidePath, iosLibraryCommand, parentPath, pickIOSSource,
  removeIOSPreviewSource, summarizeFiles, syncIOSLibrary,
  type IOSEntry, type IOSLibrary, type IOSSource, type FileResults,
} from "./iosLibrary";


type Dialog = { kind: "create" | "rename" | "edit" | "remove"; entry?: IOSEntry; source?: IOSSource } |
  { kind: "source"; source?: IOSSource } | { kind: "target"; operation: "import" | "move" | "copy" };

export function IOSLibraryPage() {
  const roots = useNanoStore((state) => state.roots);
  const scanning = useNanoStore((state) => state.scanning);
  const selectedRootIds = useNanoStore((state) => state.selectedRootIds);
  const [library, setLibrary] = useState<IOSLibrary>({ managedUri: "", sources: [] });
  const [activeId, setActiveId] = useState<string>();
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<IOSEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [search, setSearch] = useState("");
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
    void iosLibraryCommand<IOSLibrary>("librarySources").then(async (next) => {
      if (!active) return;
      setLibrary(next);
      if (isTauri() && !useNanoStore.getState().roots.some((item) => item.path === next.managedUri)) await syncIOSLibrary(next.managedUri);
    }).catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    let active = true;
    setSelected([]); setSelecting(false); setMenu(undefined); setEntries([]); setLimit(100);
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
    const back = (event: Event) => { event.preventDefault(); setMenu(undefined); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("android-back", back);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("android-back", back); };
  }, [menu]);
  useEffect(() => {
    const back = (event: Event) => {
      if (event.defaultPrevented || dialog || menu || !activeId) return;
      event.preventDefault();
      if (selecting) { setSelecting(false); setSelected([]); }
      else if (path) setPath(parentPath(path)); else setActiveId(undefined);
    };
    window.addEventListener("android-back", back);
    return () => window.removeEventListener("android-back", back);
  }, [activeId, path, dialog, menu, selecting]);
  const toggleRoot = (item: IOSSource, checked: boolean) => {
    const root = roots.find((candidate) => candidate.path === item.uri);
    if (!root) return;
    const state = useNanoStore.getState();
    const ids = state.selectedRootIds ?? roots.map((item) => item.id);
    const next = checked ? [...new Set([...ids, root.id])] : ids.filter((id) => id !== root.id);
    state.setSelectedRootIds(next.length === roots.length ? null : next);
  };
  const index = async (all: boolean) => {
    await iosLibraryCommand("libraryIndex", { sourceId: activeId, indexAll: all, paths: selected });
    await syncIOSLibrary(source!.uri);
    setResult(all ? "已索引整个来源" : "已将索引范围改为选中的文件和子文件夹");
  };
  const openEntry = (entry: IOSEntry) => {
    if (entry.directory) { setPath(entry.path); setSearch(""); return; }
    const state = useNanoStore.getState();
    const track = state.tracks.find((item) => item.path === `${source?.uri}/${entry.path}`);
    if (!track) { setResult("请先将这首歌曲加入索引；云端文件需先下载后重新扫描。"); return; }
    state.playTrack(track.id, state.tracks.filter((item) => item.rootId === root?.id).map((item) => item.id));
  };
  const closeDialog = () => { if (!busy) setDialog(undefined); };
  return <section className="library-page ios-library" aria-labelledby="ios-library-title" aria-busy={busy || scanning}>
    <header className="page-header"><div><p className="eyebrow">文件夹与音乐来源</p><h1 id="ios-library-title">本地资料库</h1></div>
      <button className="primary-button" disabled={busy || scanning} onClick={() => setDialog({ kind: "source" })}>添加来源</button>
    </header>
    {!isTauri() && <p className="safety-note">浏览器演示：文件操作仅影响示例，不读取设备文件。</p>}
    <div className="ios-library-toolbar">
      <label className="ios-library-search">搜索<input aria-label="搜索文件夹或文件" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="文件夹或文件名称" /></label>
      <button className="secondary-button" disabled={busy || scanning} onClick={() => setDialog({ kind: "target", operation: "import" })}>导入到 nanoPlayer</button>
      <WifiTransfer onImported={refresh} />
    </div>
    {error && <p role="alert">{error}</p>}
    {result && <p role="status" className="ios-operation-result">{result}</p>}
    <div className={`ios-library-columns ${source ? "ios-library-browsing" : ""}`}>
      <div className="ios-source-list">
        {(["managed", "files", "app"] as const).map((kind) => <section className="ios-source-group" key={kind} aria-label={{ managed: "nanoPlayer 资源", files: "Files 来源", app: "其他音乐 App 来源" }[kind]}>
          <h2>{{ managed: "nanoPlayer", files: "Files", app: "其他音乐 App" }[kind]} <small>{kind === "managed" ? "可管理" : "只读"}</small></h2>
          {library.sources.filter((item) => item.kind === kind && (source || item.name.toLowerCase().includes(search.toLowerCase()))).map((item) => {
            const indexed = roots.find((root) => root.path === item.uri);
            return <article className="ios-source-row" key={item.id}>
              <button className="ios-source-open" aria-label={`浏览 ${item.name}`} aria-current={activeId === item.id ? "true" : undefined} onClick={() => { setActiveId(item.id); setPath(""); setSearch(""); setError(""); }}>
                <Folder size={22} /><span><strong>{item.name}</strong><small>{kind === "managed" ? "应用管理区" : `${item.location || item.originalName} · 只读`}</small>
                  <small>{item.authorized === false ? "需重新授权" : !item.available ? "来源不可用" : indexed?.availability === "unavailable" ? "扫描失败，请重试" : indexed ? `${indexed.songCount} 首 · 已索引` : "尚未扫描"}</small></span>
              </button>
              {indexed && <label className="ios-source-index"><input type="checkbox" aria-label={`加入音乐库 ${item.name}`}
                checked={selectedRootIds === null || selectedRootIds.includes(indexed.id)} onChange={(event) => toggleRoot(item, event.target.checked)} />加入音乐库</label>}
              {kind !== "managed" && <button className="icon-button" aria-label={`更多操作 ${item.name}`} aria-expanded={menu === item.id}
                onClick={(event) => toggleMenu(item.id, event)}><MoreHorizontal size={18} /></button>}
              {menu === item.id && <div ref={(node) => { menuRef.current = node; }} className="context-menu menu-popover ios-source-menu" role="menu">
                <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "edit", source: item }); }}>编辑显示名称</button>
                <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "source", source: item }); }}>重新授权</button>
                <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "remove", source: item }); }}>移除索引</button>
              </div>}
            </article>;
          })}
          {!library.sources.some((item) => item.kind === kind) && <p>尚未添加来源</p>}
        </section>)}
      </div>
      {source && <section className="ios-file-browser" aria-label={`${source.name} 文件夹内容`}>
        <header><button className="text-button" onClick={() => path ? setPath(parentPath(path)) : setActiveId(undefined)}><ArrowLeft size={16} />{path ? "上一级" : "全部来源"}</button>
          <h2>{source.name}</h2><p className="ios-path">{source.kind === "managed" ? "nanoPlayer" : source.location || "Files"} / {source.originalName}{path ? ` / ${path}` : ""}</p>
          <p>{managed ? "可新建、重命名和移动。音频内容保持不变。" : "只读来源：索引或复制到 nanoPlayer，原文件不会改动。"}</p>
          <details><summary>来源信息</summary><p className="ios-path">{source.uri}</p>
            <p>添加时间：{root?.addedAt ? formatDate(root.addedAt, true) : "尚未索引"} · 上次扫描：{root?.lastScannedAt ? formatDate(root.lastScannedAt, true) : "尚未扫描"}</p>
          </details>
        </header>
        <div className="ios-library-toolbar">
          <button className="secondary-button" disabled={busy || scanning} onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? "取消选择" : "选择"}</button>
          {managed && <button className="secondary-button" disabled={busy} onClick={() => setDialog({ kind: "create" })}><FolderPlus size={16} />新建文件夹</button>}
          {!managed && <button className="secondary-button" disabled={busy} onClick={() => void work(() => index(true))}>索引全部</button>}
          <button className="icon-button" aria-label="重新扫描当前来源" disabled={busy || scanning} onClick={() => void work(async () => {
            if (isTauri() && root) { const data = await rescanLibraryRoot(root.id); useNanoStore.getState().replaceLibrary(data.roots, data.tracks, data.issues); }
            else await syncIOSLibrary(source.uri);
          })}><RefreshCw size={18} /></button>
        </div>
        <ul className="ios-file-list">
          {entries.filter((entry) => entry.name.toLowerCase().includes(search.toLowerCase())).slice(0, limit).map((entry) => <li key={entry.path}>
            {selecting && <input type="checkbox" aria-label={`选择 ${entry.name}`} checked={selected.includes(entry.path)} onChange={(event) => setSelected(event.target.checked ? [...selected, entry.path] : selected.filter((path) => path !== entry.path))} />}
            <button className="ios-file-open" onClick={() => openEntry(entry)}>{entry.directory ? <Folder size={22} /> : <Music2 size={22} />}<span><strong>{entry.name}</strong><small>{entry.needsDownload ? "需在 Files 下载后重试" : entry.directory ? "文件夹" : formatBytes(entry.sizeBytes)}{!managed && ` · ${entry.indexed ? "已加入索引范围" : entry.partial ? "部分索引" : "未索引"}`}</small></span></button>
            {managed && <button className="icon-button" aria-label={`更多操作 ${entry.name}`} aria-expanded={menu === entry.path} onClick={(event) => toggleMenu(entry.path, event)}><MoreHorizontal size={18} /></button>}
            {menu === entry.path && <div ref={(node) => { menuRef.current = node; }} className="context-menu menu-popover ios-source-menu" role="menu">
              <button role="menuitem" onClick={() => { setMenu(undefined); setDialog({ kind: "rename", entry }); }}>重命名</button>
              {entry.directory && <button role="menuitem" onClick={() => void work(async () => { await iosLibraryCommand("libraryDeleteEmpty", { relativePath: entry.path }); setResult("已删除空文件夹"); })}>删除空文件夹</button>}
            </div>}
          </li>)}
        </ul>
        {entries.filter((entry) => entry.name.toLowerCase().includes(search.toLowerCase())).length > limit && <button className="secondary-button" onClick={() => setLimit((value) => value + 100)}>显示更多</button>}
        {!entries.length && <p>此文件夹没有可显示的音乐或子文件夹。</p>}
        {selecting && <div className="ios-file-actions" role="group" aria-label="所选文件操作">
          <span>已选 {selected.length} 项</span>
          <button className="secondary-button" disabled={!selected.length || busy} onClick={() => setDialog({ kind: "target", operation: managed ? "move" : "copy" })}>{managed ? "移动到" : "复制到 nanoPlayer"}</button>
          {!managed && <button className="secondary-button" disabled={!selected.length || busy} onClick={() => void work(() => index(false))}>仅索引选中项</button>}
          {!managed && <small>仅索引选中项会替换此来源的索引范围；评分和歌单记录保留。</small>}
        </div>}
      </section>}
    </div>
    <p className="safety-note">外部来源始终只读；移除索引不会删除源文件。</p>
    <button className="text-button" onClick={() => useNanoStore.getState().setPage("issues")}>扫描问题</button>
    {dialog?.kind === "target" && <IOSFolderPicker initial={managed ? path : "收件箱"} exclude={dialog.operation === "move" ? selected : []} onClose={closeDialog} onChoose={(target, skip) => {
      const operation = dialog.operation; setDialog(undefined);
      void work(async () => {
        if (operation === "import") setResult(await importIOSFiles(target, skip));
        else {
          const response = await iosLibraryCommand<FileResults>(operation === "move" ? "libraryMove" : "libraryCopy", { sourceId: activeId, paths: selected, target, skip });
          setResult(summarizeFiles(response)); await syncIOSLibrary(library.managedUri);
        }
      });
    }} />}
    {dialog && dialog.kind !== "target" && <IOSLibraryForm dialog={dialog} error={error} sourceKind={dialog.source?.kind === "app" ? "app" : "files"} busy={busy} onClose={closeDialog} onSubmit={(fields) => void work(async () => {
      if (dialog.kind === "source") await pickIOSSource(fields.kind, fields.name, fields.location, dialog.source?.id);
      if (dialog.kind === "create") await iosLibraryCommand("libraryCreate", { relativePath: path, name: fields.name });
      if (dialog.kind === "rename") {
        const response = await iosLibraryCommand<FileResults>("libraryRename", { sourceId: activeId, relativePath: dialog.entry!.path, name: fields.name });
        setResult(summarizeFiles(response)); await syncIOSLibrary(library.managedUri);
      }
      if (dialog.kind === "edit") {
        await iosLibraryCommand("libraryEdit", { sourceId: dialog.source!.id, name: fields.name });
        await syncIOSLibrary(dialog.source!.uri);
      }
      if (dialog.kind === "remove") {
        const removing = dialog.source!;
        const indexed = roots.find((item) => item.path === removing.uri);
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

function IOSLibraryForm({ dialog, error, sourceKind, busy, onClose, onSubmit }: {
  dialog: Exclude<Dialog, { kind: "target" }>; error: string; sourceKind: "files" | "app"; busy: boolean;
  onClose: () => void; onSubmit: (fields: { kind: "files" | "app"; name: string; location: string }) => void;
}) {
  const [kind, setKind] = useState(sourceKind);
  const [name, setName] = useState(dialog.kind === "edit" ? dialog.source?.name ?? "" : dialog.kind === "rename" ? dialog.entry?.name ?? "" : dialog.source?.location ?? "");
  const [location, setLocation] = useState(dialog.source?.location ?? "");
  const title = { source: dialog.source ? "重新授权来源" : "添加只读来源", create: "新建文件夹", rename: "重命名", edit: "编辑显示名称", remove: "移除来源索引" }[dialog.kind];
  return <IOSLibraryDialog title={title} onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit({ kind, name: name.trim(), location }); }}>
      {dialog.kind === "source" && <>
        <label>来源类型<select value={kind} onChange={(event) => setKind(event.target.value as "files" | "app")}><option value="files">Files 文件夹</option><option value="app">其他音乐 App 文件夹</option></select></label>
        {kind === "files" && <label>位置名称（可选）<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如 iCloud Drive" /></label>}
        <p>通过系统 Files 选择文件夹，只读索引，不改动源文件。其他 App 需公开文件夹。</p>
      </>}
      {(dialog.kind !== "source" || kind === "app") && dialog.kind !== "remove" && <label>{dialog.kind === "source" ? "音乐 App 名称" : "名称"}<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {dialog.kind === "remove" && <p>仅移除“{dialog.source!.name}”的索引与授权，不删除或移动源文件。关联歌曲将从音乐库和播放队列移除。</p>}
      {error && <p role="alert">{error}</p>}
      <button className="primary-button" disabled={busy || (dialog.kind !== "remove" && !(dialog.kind === "source" && kind === "files") && !name.trim())}>
        {busy ? "处理中…" : dialog.kind === "source" ? "选择只读文件夹" : dialog.kind === "remove" ? "移除索引" : "保存"}
      </button>
    </form>
  </IOSLibraryDialog>;
}
