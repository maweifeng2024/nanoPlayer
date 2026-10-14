import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Folder, X } from "lucide-react";
import { useModalBehavior } from "../useModalBehavior";
import { insidePath, iosLibraryCommand, parentPath, type IOSEntry } from "./iosLibrary";

export function IOSLibraryDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useModalBehavior(true, onClose);
  return <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="app-dialog compact-dialog ios-library-dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title}>
      <header><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export function IOSFolderPicker({ initial = "收件箱", exclude = [], onChoose, onClose }: {
  initial?: string; exclude?: string[]; onChoose: (target: string, skip: boolean) => void; onClose: () => void;
}) {
  const [path, setPath] = useState(initial);
  const [entries, setEntries] = useState<IOSEntry[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void iosLibraryCommand<{ entries: IOSEntry[] }>("libraryBrowse", { relativePath: path, kind: "folders" })
      .then((result) => { if (active) { setEntries(result.entries); setError(""); } })
      .catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [path, revision]);
  const invalid = exclude.some((item) => insidePath(item, path));
  return <IOSLibraryDialog title="选择 nanoPlayer 目标文件夹" onClose={onClose}>
    <p className="ios-path">nanoPlayer / {path || "根目录"}</p>
    {path && <button className="text-button" onClick={() => setPath(parentPath(path))}><ArrowLeft size={16} />上一级</button>}
    <div className="ios-destination-list">
      {entries.map((entry) => <button className="secondary-button" key={entry.path}
        disabled={exclude.some((item) => insidePath(item, entry.path))} onClick={() => setPath(entry.path)}>
        <Folder size={18} />{entry.name}
      </button>)}
      {!entries.length && <p>此文件夹下没有子文件夹</p>}
    </div>
    <form className="ios-inline-form" onSubmit={(event) => {
      event.preventDefault();
      void iosLibraryCommand("libraryCreate", { relativePath: path, name }).then(() => { setName(""); setRevision((value) => value + 1); }).catch((cause) => setError(String(cause)));
    }}>
      <label>新文件夹名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <button className="secondary-button" disabled={!name.trim()}>新建文件夹</button>
    </form>
    <label>遇到同名项目<select value={skip ? "skip" : "both"} onChange={(event) => setSkip(event.target.value === "skip")}>
      <option value="both">保留两份（自动添加序号）</option><option value="skip">跳过同名项目</option>
    </select></label>
    {error && <p role="alert">{error}</p>}
    <button className="primary-button" disabled={!!error || invalid} onClick={() => onChoose(path, skip)}>选择此文件夹</button>
  </IOSLibraryDialog>;
}

