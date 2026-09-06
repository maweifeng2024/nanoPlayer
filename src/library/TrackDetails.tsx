import { t } from "../i18n";
import { FolderOpen, RotateCcw, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { TrackMetadataUpdate } from "../domain";
import { formatDuration } from "../domain";
import { useNanoStore } from "../store";
import {
  clearTrackMetadataField,
  clearTrackMetadataOverride,
  isTauri,
  revealTrackFile,
  updateTrackMetadata,
} from "../tauriBridge";
import { useModalBehavior } from "../useModalBehavior";
import { Artwork } from "./Artwork";

export function TrackDetails({ trackId }: { trackId: number }) {
  const state = useNanoStore(
    useShallow((store) => ({
      tracks: store.tracks,
      setSelectedTrack: store.setSelectedTrack,
      replaceLibrary: store.replaceLibrary,
      updateTrackLocal: store.updateTrackLocal,
      setNotice: store.setNotice,
    })),
  );
  const track = state.tracks.find((item) => item.id === trackId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TrackMetadataUpdate>({});
  const close = () => state.setSelectedTrack(undefined);
  useModalBehavior(true, close);

  useEffect(() => {
    if (!track) return;
    setDraft({
      title: track.title,
      artist: track.artist,
      album: track.album,
      year: track.year,
      genre: track.genre,
      composer: track.composer,
    });
  }, [
    track?.id,
    track?.title,
    track?.artist,
    track?.album,
    track?.year,
    track?.genre,
    track?.composer,
  ]);

  if (!track) return null;
  const save = async () => {
    setSaving(true);
    try {
      if (isTauri() && track.id > 0) {
        const result = await updateTrackMetadata(track.id, draft);
        state.replaceLibrary(result.roots, result.tracks, result.issues);
      } else state.updateTrackLocal(track.id, draft);
      setEditing(false);
      state.setNotice(t("元数据覆盖已保存；源音乐文件未修改。"));
    } catch (error) {
      state.setNotice(t("保存元数据失败：{0}", t(String(error))));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!isTauri() || track.id < 0)
      return state.setNotice(t("示例资料库重新加载后恢复原始元数据。"));
    try {
      const result = await clearTrackMetadataOverride(track.id);
      state.replaceLibrary(result.roots, result.tracks, result.issues);
      setEditing(false);
      state.setNotice(t("已恢复扫描到的原始元数据。"));
    } catch (error) {
      state.setNotice(t("恢复原值失败：{0}", t(String(error))));
    }
  };
  const set = <K extends keyof TrackMetadataUpdate>(key: K, value: TrackMetadataUpdate[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const resetField = async (field: keyof TrackMetadataUpdate) => {
    if (!isTauri() || track.id < 0) return state.setNotice(t("桌面版可逐字段恢复扫描原值。"));
    try {
      const result = await clearTrackMetadataField(track.id, field);
      state.replaceLibrary(result.roots, result.tracks, result.issues);
      state.setNotice(t("该字段已恢复为扫描原值。"));
    } catch (error) {
      state.setNotice(t("恢复字段失败：{0}", t(String(error))));
    }
  };
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="app-dialog track-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-details-title"
      >
        <header>
          <div>
            <p className="eyebrow">{t("歌曲详细信息")}</p>
            <h2 id="track-details-title">{track.title}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label={t("关闭")}>
            <X size={18} />
          </button>
        </header>
        <div className="track-details-body">
          <Artwork className="detail-art" track={track} fallback={track.title.slice(0, 1)} />
          <div className="metadata-grid">
            {editing ? (
              <>
                <EditField
                  label={t("标题")}
                  value={draft.title ?? ""}
                  onChange={(value) => set("title", value)}
                  onReset={() => resetField("title")}
                />
                <EditField
                  label={t("艺术家")}
                  value={draft.artist ?? ""}
                  onChange={(value) => set("artist", value)}
                  onReset={() => resetField("artist")}
                />
                <EditField
                  label={t("专辑")}
                  value={draft.album ?? ""}
                  onChange={(value) => set("album", value)}
                  onReset={() => resetField("album")}
                />
                <EditField
                  label={t("年份")}
                  type="number"
                  value={draft.year?.toString() ?? ""}
                  onChange={(value) => set("year", value ? Number(value) : undefined)}
                  onReset={() => resetField("year")}
                />
                <EditField
                  label={t("流派")}
                  value={draft.genre ?? ""}
                  onChange={(value) => set("genre", value)}
                  onReset={() => resetField("genre")}
                />
                <EditField
                  label={t("作曲者")}
                  value={draft.composer ?? ""}
                  onChange={(value) => set("composer", value)}
                  onReset={() => resetField("composer")}
                />
              </>
            ) : (
              <>
                <Value label={t("艺术家")} value={track.artist} />
                <Value label={t("专辑艺术家")} value={track.albumArtist} />
                <Value label={t("专辑")} value={track.album} />
                <Value label={t("年份")} value={track.year} />
                <Value label={t("流派")} value={track.genre} />
                <Value label={t("作曲者")} value={track.composer} />
                <Value
                  label={t("碟片")}
                  value={
                    track.discNumber
                      ? `${track.discNumber}${track.discTotal ? ` / ${track.discTotal}` : ""}`
                      : undefined
                  }
                />
                <Value
                  label={t("曲序")}
                  value={
                    track.trackNumber
                      ? `${track.trackNumber}${track.trackTotal ? ` / ${track.trackTotal}` : ""}`
                      : undefined
                  }
                />
                <Value label={t("时长")} value={formatDuration(track.durationMs)} />
                <Value label={t("格式")} value={track.format.toUpperCase()} />
                <Value
                  label={t("比特率")}
                  value={track.bitrate ? `${track.bitrate} kbps` : undefined}
                />
                <Value
                  label={t("采样率")}
                  value={track.sampleRate ? `${track.sampleRate} Hz` : undefined}
                />
                <Value label={t("声道")} value={track.channels} />
                <Value label="MusicBrainz ID" value={track.musicbrainzRecordingId} />
                <Value label={t("歌词来源")} value={track.lyricsSource} />
              </>
            )}
          </div>
        </div>
        <div className="file-path">
          <span>{t("文件位置")}</span>
          <code title={track.path}>{track.path || t("浏览器示例曲目")}</code>
          {track.path ? (
            <div className="file-path-actions">
              <button
                className="text-button"
                onClick={() =>
                  navigator.clipboard
                    .writeText(track.path)
                    .then(() => state.setNotice(t("文件路径已复制。")))
                }
              >
                {t("复制路径")}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (!isTauri() || track.id < 0)
                    return state.setNotice(t("在文件管理器中显示仅用于桌面版真实曲目。"));
                  revealTrackFile(track.id).catch((error) => state.setNotice(t(String(error))));
                }}
              >
                <FolderOpen size={14} />
                {t("在 Finder 中显示")}
              </button>
            </div>
          ) : null}
        </div>
        <footer>
          {editing ? (
            <>
              <button className="secondary-button" onClick={() => setEditing(false)}>
                {t("取消")}
              </button>
              <button
                className="primary-button"
                disabled={saving || !draft.title?.trim()}
                onClick={save}
              >
                <Save size={15} />
                {saving ? t("保存中…") : t("保存覆盖")}
              </button>
            </>
          ) : (
            <>
              <button className="secondary-button" onClick={reset}>
                <RotateCcw size={15} />
                {t("恢复原值")}
              </button>
              <button className="primary-button" onClick={() => setEditing(true)}>
                {t("编辑元数据")}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  onReset,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  type?: string;
}) {
  return (
    <label className="metadata-edit-field">
      <span>{label}</span>
      <div>
        <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
        <button
          className="icon-button"
          type="button"
          onClick={onReset}
          aria-label={t("恢复{0}原值", label)}
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </label>
  );
}
function Value({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
