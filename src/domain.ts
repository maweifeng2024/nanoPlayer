export type Page =
  | "home"
  | "library"
  | "songs"
  | "albums"
  | "artists"
  | "recent"
  | "played"
  | "popular"
  | "rated"
  | "playlist"
  | "now-playing"
  | "settings"
  | "issues";
export type PlaybackOrder = "sequence" | "shuffle";
export type RepeatMode = "off" | "all" | "one";
export type ThemeMode = "system" | "light" | "dark";

export interface Track {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  format: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  discNumber?: number;
  trackTotal?: number;
  discTotal?: number;
  albumArtist?: string;
  composer?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  musicbrainzRecordingId?: string;
  addedAt: string;
  color?: string;
  lyrics?: string;
  lyricsSource?: string;
  lyricsKind?: string;
  hasArtwork?: boolean;
  artworkHash?: string;
}

export interface LibraryRoot {
  id: number;
  path: string;
  name: string;
  availability: string;
  songCount: number;
  sizeBytes: number;
  lastScannedAt?: string;
}

export interface ScanIssue {
  id: number;
  rootId?: number;
  path: string;
  category: string;
  detail: string;
}

export interface LibrarySnapshot {
  roots: LibraryRoot[];
  tracks: Track[];
  issues: ScanIssue[];
  playlists?: Playlist[];
  userState?: Record<string, unknown>;
}

export interface LyricsCandidate {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
  confidence: number;
  matchReason: string;
  durationDifference: number;
}

export interface LyricsSearchInput {
  title: string;
  artist: string;
  album: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: number[];
}

export interface TrackMetadataUpdate {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string;
  composer?: string;
}

export const demoTracks: Track[] = [
  {
    id: -1,
    path: "",
    title: "海平面以下",
    artist: "林岚",
    album: "潮汐与回声",
    durationMs: 252000,
    format: "FLAC",
    year: 2026,
    genre: "氛围",
    addedAt: "2026-09-01",
    color: "#31586b",
    lyrics:
      "[00:00]海面安静得像一封信\n[00:18]光沉入蓝色的森林\n[00:42]我听见远方的回声\n[01:12]在每一次呼吸里靠近",
  },
  {
    id: -2,
    path: "",
    title: "迟到的风",
    artist: "林岚",
    album: "潮汐与回声",
    durationMs: 218000,
    format: "ALAC",
    year: 2026,
    genre: "氛围",
    addedAt: "2026-09-01",
    color: "#6e564a",
  },
  {
    id: -3,
    path: "",
    title: "空城散步",
    artist: "Northbound",
    album: "零点电台",
    durationMs: 196000,
    format: "MP3",
    year: 2025,
    genre: "独立",
    addedAt: "2026-08-29",
    color: "#705d76",
  },
  {
    id: -4,
    path: "",
    title: "星轨留言",
    artist: "小川实验室",
    album: "慢速通信",
    durationMs: 284000,
    format: "AAC",
    year: 2024,
    genre: "电子",
    addedAt: "2026-08-27",
    color: "#3f566d",
  },
  {
    id: -5,
    path: "",
    title: "星轨留言 (Acoustic)",
    artist: "小川实验室",
    album: "慢速通信",
    durationMs: 241000,
    format: "M4A",
    year: 2024,
    genre: "民谣",
    addedAt: "2026-08-27",
    color: "#887458",
  },
  {
    id: -6,
    path: "",
    title: "雨后路灯",
    artist: "谢清",
    album: "城市侧写",
    durationMs: 233000,
    format: "OGG",
    year: 2023,
    genre: "爵士",
    addedAt: "2026-08-20",
    color: "#59684e",
  },
  {
    id: -7,
    path: "",
    title: "月台 04:17",
    artist: "Northbound",
    album: "零点电台",
    durationMs: 307000,
    format: "OPUS",
    year: 2025,
    genre: "独立",
    addedAt: "2026-08-18",
    color: "#544d69",
  },
  {
    id: -8,
    path: "",
    title: "无人接听",
    artist: "谢清",
    album: "城市侧写",
    durationMs: 189000,
    format: "WAV",
    year: 2023,
    genre: "爵士",
    addedAt: "2026-08-12",
    color: "#6a4d49",
  },
];

export const demoRoot: LibraryRoot = {
  id: -1,
  path: "/Users/demo/Music",
  name: "音乐",
  availability: "available",
  songCount: demoTracks.length,
  sizeBytes: 682_400_000,
  lastScannedAt: "2026-09-02",
};

export function formatDuration(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent > 1 ? 1 : 0)} ${units[exponent]}`;
}

export function formatDate(value: string) {
  if (/^\d{10,13}$/.test(value)) {
    const timestamp = Number(value) * (value.length === 10 ? 1000 : 1);
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(timestamp);
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

export function playCountThreshold(durationMs: number) {
  if (durationMs < 30_000) return Number.POSITIVE_INFINITY;
  return Math.min(240_000, durationMs * 0.5);
}
