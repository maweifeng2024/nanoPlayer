import { changedStorage } from "./state/changedStorage";
import { trackIsSelected } from "./library/folderFilter";
import { t, setActiveLanguage } from "./i18n";
import { create } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";
import type {
  LibraryRoot,
  Page,
  PlaybackOrder,
  Playlist,
  RepeatMode,
  ScanIssue,
  ThemeMode,
  Track,
  TrackMetadataUpdate,
} from "./domain";
import { demoRoot, demoTracks } from "./domain";

type Drawer = "queue" | "lyrics" | null;

interface NanoState {
  sleepTimer?: { remainingMs: number; waiting: boolean; finishTrack: boolean };
  lyricOffsets: Record<number, number>;
  lyricFontSize: number;
  setLyricOffset: (id: number, value: number) => void;
  setLyricFontSize: (value: number) => void;
  visualDesignVersion: number;
  statisticsVersion: number;
  page: Page;
  playerReturn?: { page: Page; playlistId?: string; query: string };
  collapsePlayer: () => void;
  selectedPlaylistId?: string;
  selectedCollection?: { kind: "album" | "artist"; value: string };
  selectedRootIds: number[] | null;
  setSelectedRootIds: (ids: number[] | null) => void;
  roots: LibraryRoot[];
  tracks: Track[];
  issues: ScanIssue[];
  query: string;
  currentTrackId?: number;
  selectedTrackId?: number;
  queue: number[];
  playing: boolean;
  queueEnded: boolean;
  progressMs: number;
  listenedSessionMs: number;
  sessionCounted: boolean;
  sessionSeeked: boolean;
  completePlayback: () => void;
  seekPlayback: (value: number) => void;
  volume: number;
  muted: boolean;
  orderMode: PlaybackOrder;
  repeatMode: RepeatMode;
  shuffleOrder: number[];
  playbackRevision: number;
  drawer: Drawer;
  ratings: Record<number, number>;
  playCounts: Record<number, number>;
  lastPlayedAt: Record<number, string>;
  playlists: Playlist[];
  onlineLyrics: boolean;
  theme: ThemeMode;
  language: "zh-CN" | "en";
  setLanguage: (language: "zh-CN" | "en") => void;
  outputDevice?: string;
  scanning: boolean;
  pendingRootPaths: string[];
  scanProcessed: number;
  onboardingDismissed: boolean;
  notice?: string;
  setPage: (page: Page, playlistId?: string) => void;
  openCollection: (kind: "album" | "artist", value: string) => void;
  clearSelectedCollection: () => void;
  setQuery: (query: string) => void;
  replaceLibrary: (roots: LibraryRoot[], tracks: Track[], issues: ScanIssue[]) => void;
  replacePlaylists: (playlists: Playlist[]) => void;
  setScanning: (value: boolean) => void;
  setScanProcessed: (value: number) => void;
  setNotice: (notice?: string) => void;
  setSelectedTrack: (id?: number) => void;
  setPlaying: (value: boolean) => void;
  markPlaybackStarted: (id: number) => void;
  updateTrackLocal: (id: number, value: TrackMetadataUpdate) => void;
  playTrack: (id: number, context?: number[]) => void;
  togglePlay: () => void;
  next: (automatic?: boolean) => void;
  previous: () => void;
  setProgress: (value: number) => void;
  tickPlayback: (elapsedMs: number) => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  toggleOrderMode: () => void;
  cycleRepeatMode: () => void;
  toggleDrawer: (drawer: Exclude<Drawer, null>) => void;
  enqueue: (id: number) => void;
  playNext: (id: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  rate: (id: number, rating: number) => void;
  createPlaylist: (name: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, trackId: number) => void;
  addManyToPlaylist: (playlistId: string, trackIds: number[]) => void;
  removeFromPlaylist: (playlistId: string, trackId: number) => void;
  reorderPlaylist: (playlistId: string, fromTrackId: number, toTrackId: number) => void;
  setOnlineLyrics: (value: boolean) => void;
  setTheme: (value: ThemeMode) => void;
  setOutputDevice: (value?: string) => void;
  dismissOnboarding: () => void;
}

const currentVisualDesignVersion = 2;
export function migratePlaybackStatistics(source: Record<string, unknown>) {
  if (source.statisticsVersion === 1) return source;
  const playCounts = { ...(source.playCounts as Record<number, number>) };
  for (const [id, seed] of [
    [-1, 14],
    [-3, 8],
    [-6, 21],
  ]) {
    if (id in playCounts) playCounts[id] = Math.max(0, playCounts[id] - seed);
  }
  const lastPlayedAt = { ...(source.lastPlayedAt as Record<number, string>) };
  for (const [id, date] of Object.entries({
    [-1]: "2026-09-02T12:00:00Z",
    [-3]: "2026-09-01T09:00:00Z",
    [-6]: "2026-08-31T18:00:00Z",
  })) {
    if (lastPlayedAt[Number(id)] === date) delete lastPlayedAt[Number(id)];
  }
  return { ...source, playCounts, lastPlayedAt, statisticsVersion: 1 };
}
export function migrateUserState(value: unknown): Record<string, unknown> {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  if (typeof input.stateSchemaVersion === "number" && input.stateSchemaVersion > 4) {
    throw new Error("Saved settings require a newer nanoPlayer version.");
  }
  const source: Record<string, unknown> = { ...migratePlaybackStatistics(input) };
  const ids = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id))
      : [];
  for (const key of ["queue", "shuffleOrder"] as const) {
    if (key in source) source[key] = ids(source[key]);
  }
  if ("selectedRootIds" in source && source.selectedRootIds !== null)
    source.selectedRootIds = ids(source.selectedRootIds);
  for (const [key, lower, upper] of [
    ["volume", 0, 1],
    ["progressMs", 0, Number.MAX_SAFE_INTEGER],
  ] as const) {
    if (key in source) {
      const value = source[key];
      if (typeof value === "number" && Number.isFinite(value))
        source[key] = Math.max(lower, Math.min(upper, value));
      else delete source[key];
    }
  }
  for (const key of ["muted", "onlineLyrics", "onboardingDismissed"] as const) {
    if (key in source && typeof source[key] !== "boolean") delete source[key];
  }
  for (const [key, valid] of [
    ["theme", ["system", "light", "dark"]],
    ["language", ["en", "zh-CN"]],
    ["orderMode", ["sequence", "shuffle"]],
    ["repeatMode", ["off", "one", "all"]],
  ] as const) {
    if (key in source && !(valid as readonly unknown[]).includes(source[key])) delete source[key];
  }
  for (const key of ["ratings", "playCounts"] as const) {
    if (!(key in source)) continue;
    const map = source[key];
    source[key] =
      map && typeof map === "object" && !Array.isArray(map)
        ? Object.fromEntries(
            Object.entries(map).filter(
              ([id, number]) =>
                Number.isSafeInteger(Number(id)) &&
                typeof number === "number" &&
                Number.isFinite(number) &&
                number >= 0,
            ),
          )
        : {};
  }
  if ("currentTrackId" in source && !Number.isSafeInteger(source.currentTrackId))
    delete source.currentTrackId;
  // Runtime-only fields must never be restored from older saved snapshots.
  delete source.sleepTimer;
  delete source.playing;

  const offsets =
    source.lyricOffsets &&
    typeof source.lyricOffsets === "object" &&
    !Array.isArray(source.lyricOffsets)
      ? Object.fromEntries(
          Object.entries(source.lyricOffsets)
            .filter(
              ([id, offset]) =>
                Number.isFinite(Number(id)) &&
                typeof offset === "number" &&
                Number.isFinite(offset),
            )
            .map(([id, offset]) => [id, Math.max(-10000, Math.min(10000, offset as number))]),
        )
      : {};
  return {
    ...source,
    stateSchemaVersion: 4,
    lyricOffsets: offsets,
    lyricFontSize:
      typeof source.lyricFontSize === "number" && Number.isFinite(source.lyricFontSize)
        ? Math.max(16, Math.min(40, source.lyricFontSize))
        : 24,
  };
}

const nativeStateKeys = [
  "lyricOffsets",
  "lyricFontSize",
  "visualDesignVersion",
  "statisticsVersion",
  "selectedRootIds",
  "playlists",
  "ratings",
  "playCounts",
  "lastPlayedAt",
  "volume",
  "muted",
  "orderMode",
  "repeatMode",
  "shuffleOrder",
  "onlineLyrics",
  "theme",
  "language",
  "outputDevice",
  "queue",
  "currentTrackId",
  "progressMs",
  "onboardingDismissed",
] as const;

export function applyNativeUserState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const source = migrateUserState(value);
  const allowed: Partial<NanoState> = {};
  for (const key of nativeStateKeys) {
    if (key in source) Object.assign(allowed, { [key]: source[key] });
  }
  if (!("orderMode" in source) && typeof source.mode === "string") {
    allowed.orderMode = source.mode === "shuffle" ? "shuffle" : "sequence";
  }
  if (!("repeatMode" in source) && typeof source.mode === "string") {
    allowed.repeatMode =
      source.mode === "repeat-one" ? "one" : source.mode === "repeat-all" ? "all" : "off";
  }
  if (source.visualDesignVersion !== currentVisualDesignVersion) {
    allowed.visualDesignVersion = currentVisualDesignVersion;
    allowed.theme = "dark";
  }
  if (allowed.language !== "en" && allowed.language !== "zh-CN") allowed.language = "zh-CN";
  allowed.playing = false;
  allowed.listenedSessionMs = 0;
  allowed.sessionCounted = false;
  allowed.sessionSeeked = false;
  useNanoStore.setState(allowed);
}

export function getNativeUserState(): Record<string, unknown> {
  const state = useNanoStore.getState();
  return {
    stateSchemaVersion: 4,
    ...Object.fromEntries(nativeStateKeys.map((key) => [key, state[key]])),
  };
}

const shuffleTracks = (ids: number[], currentId?: number) => {
  const currentIndex = currentId === undefined ? -1 : ids.indexOf(currentId);
  const result = ids.filter((_, index) => index !== currentIndex);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return currentIndex < 0 ? result : [ids[currentIndex], ...result];
};
const repeatCycle: RepeatMode[] = ["off", "all", "one"];
const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useNanoStore = create<NanoState>()(
  persist(
    (set, get) => ({
      lyricOffsets: {},
      lyricFontSize: 24,
      setLyricOffset: (id, value) =>
        set((state) => ({
          lyricOffsets: { ...state.lyricOffsets, [id]: Math.max(-10000, Math.min(10000, value)) },
        })),
      setLyricFontSize: (value) => set({ lyricFontSize: Math.max(16, Math.min(40, value)) }),
      visualDesignVersion: currentVisualDesignVersion,
      statisticsVersion: 1,
      page: "home",
      selectedRootIds: null,
      setSelectedRootIds: (selectedRootIds) =>
        set((state) => {
          const selection = { ...state, selectedRootIds };
          const ids = new Set(
            state.tracks
              .filter((track) => trackIsSelected(track, selection))
              .map((track) => track.id),
          );
          const queue = state.queue.filter((id) => ids.has(id));
          const keepCurrent = state.currentTrackId !== undefined && ids.has(state.currentTrackId);
          const oldIndex = state.queue.indexOf(state.currentTrackId!);
          const currentTrackId = keepCurrent
            ? state.currentTrackId
            : (state.queue.slice(oldIndex + 1).find((id) => ids.has(id)) ?? queue[0]);
          return {
            selectedRootIds,
            queue,
            shuffleOrder: state.shuffleOrder.filter((id) => ids.has(id)),
            currentTrackId,
            playing: state.playing && currentTrackId !== undefined,
            queueEnded: false,
            progressMs: keepCurrent ? state.progressMs : 0,
            listenedSessionMs: keepCurrent ? state.listenedSessionMs : 0,
            sessionCounted: keepCurrent ? state.sessionCounted : false,
            sessionSeeked: keepCurrent ? state.sessionSeeked : false,
            playbackRevision: state.playbackRevision + (keepCurrent ? 0 : 1),
          };
        }),
      roots: [demoRoot],
      tracks: demoTracks,
      issues: [],
      query: "",
      queue: demoTracks.map((track) => track.id),
      playing: false,
      queueEnded: false,
      progressMs: 0,
      listenedSessionMs: 0,
      sessionCounted: false,
      sessionSeeked: false,
      volume: 0.72,
      muted: false,
      orderMode: "sequence",
      repeatMode: "off",
      shuffleOrder: [],
      playbackRevision: 0,
      drawer: null,
      ratings: { [-1]: 5, [-4]: 4, [-6]: 5 },
      playCounts: {},
      lastPlayedAt: {},
      playlists: [{ id: "quiet-night", name: "安静的晚上", trackIds: [-1, -4, -6] }],
      onlineLyrics: false,
      theme: "dark",
      language: "zh-CN",
      setLanguage: (language) => set({ language }),
      outputDevice: undefined,
      scanning: false,
      pendingRootPaths: [],
      scanProcessed: 0,
      onboardingDismissed: false,
      setPage: (page, selectedPlaylistId) =>
        set((state) => ({
          page,
          selectedPlaylistId,
          selectedCollection: undefined,
          query: "",
          playerReturn:
            page === "now-playing" && state.page !== "now-playing"
              ? { page: state.page, playlistId: state.selectedPlaylistId, query: state.query }
              : state.playerReturn,
        })),
      openCollection: (kind, value) =>
        set({
          page: kind === "album" ? "albums" : "artists",
          selectedPlaylistId: undefined,
          selectedCollection: { kind, value },
          query: "",
        }),
      clearSelectedCollection: () => set({ selectedCollection: undefined }),
      collapsePlayer: () =>
        set((state) => ({
          page: state.playerReturn?.page ?? "home",
          selectedPlaylistId: state.playerReturn?.playlistId,
          query: state.playerReturn?.query ?? "",
          drawer: null,
        })),
      setQuery: (query) => set({ query }),
      replaceLibrary: (roots, tracks, issues) =>
        set((state) => {
          const ids = new Set(
            tracks
              .filter((track) => trackIsSelected(track, { ...state, roots }))
              .map((track) => track.id),
          );
          const keepPlayback = state.currentTrackId !== undefined && ids.has(state.currentTrackId);
          const preservedQueue = state.queue.filter((id) => ids.has(id));
          const fallbackTrackId = preservedQueue[0];
          return {
            roots,
            tracks,
            issues,
            queue: preservedQueue.length ? preservedQueue : [...ids],
            currentTrackId: keepPlayback ? state.currentTrackId : fallbackTrackId,
            playing: keepPlayback ? state.playing : Boolean(fallbackTrackId && state.playing),
            progressMs: keepPlayback ? state.progressMs : 0,
            listenedSessionMs: keepPlayback ? state.listenedSessionMs : 0,
            sessionCounted: keepPlayback ? state.sessionCounted : false,
            sessionSeeked: keepPlayback ? state.sessionSeeked : false,
            notice:
              state.currentTrackId !== undefined && !keepPlayback
                ? t("当前文件暂时不可用，已跳到队列中的下一首。")
                : state.notice,
          };
        }),
      replacePlaylists: (playlists) => set({ playlists }),
      setScanning: (scanning) =>
        set({ scanning, scanProcessed: scanning ? get().scanProcessed : 0 }),
      setScanProcessed: (scanProcessed) => set({ scanProcessed }),
      setNotice: (notice) => set({ notice }),
      setSelectedTrack: (selectedTrackId) => set({ selectedTrackId }),
      setPlaying: (playing) => set({ playing }),
      markPlaybackStarted: (id) =>
        set({ lastPlayedAt: { ...get().lastPlayedAt, [id]: new Date().toISOString() } }),
      updateTrackLocal: (id, value) =>
        set({
          tracks: get().tracks.map((track) => (track.id === id ? { ...track, ...value } : track)),
        }),
      playTrack: (currentTrackId, context) =>
        set((state) => {
          const allowed = new Set(
            state.tracks.filter((track) => trackIsSelected(track, state)).map((track) => track.id),
          );
          if (!allowed.has(currentTrackId)) {
            if (!context) return {};
            const first = context.find((id) => allowed.has(id));
            if (first === undefined) return {};
            currentTrackId = first;
          }
          const queue = (context?.length ? context : state.queue).filter((id) => allowed.has(id));
          return {
            currentTrackId,
            playbackRevision: state.playbackRevision + 1,
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue, currentTrackId) : [],
            queueEnded: false,
            playing: true,
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
          };
        }),
      togglePlay: () => {
        const state = get();
        if (state.queueEnded && state.queue.length) {
          const order = state.orderMode === "shuffle" ? shuffleTracks(state.queue) : state.queue;
          state.playTrack(order[0], state.queue);
        } else if (state.currentTrackId === undefined) {
          const tracks = state.tracks.filter((track) => trackIsSelected(track, state));
          if (tracks.length)
            state.playTrack(
              tracks[0].id,
              tracks.map((track) => track.id),
            );
        } else {
          const track = state.tracks.find((item) => item.id === state.currentTrackId);
          if (track && trackIsSelected(track, state)) set({ playing: !state.playing });
        }
      },
      next: (automatic = false) => {
        const state = get();
        if (!state.queue.length) return;
        if (automatic && state.repeatMode === "one")
          return set({
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
            playbackRevision: state.playbackRevision + 1,
          });
        const order =
          state.orderMode === "shuffle"
            ? state.shuffleOrder.length === state.queue.length
              ? state.shuffleOrder
              : shuffleTracks(state.queue)
            : state.queue;
        const index = Math.max(0, order.indexOf(state.currentTrackId ?? order[0]));
        const nextIndex = index + 1;
        if (nextIndex >= order.length && state.repeatMode === "off")
          return set({
            playing: false,
            queueEnded: true,
            playbackRevision: state.playbackRevision + 1,
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
          });
        const nextOrder =
          nextIndex >= order.length && state.orderMode === "shuffle"
            ? shuffleTracks(state.queue)
            : order;
        const currentTrackId = nextOrder[nextIndex >= order.length ? 0 : nextIndex];
        set({
          currentTrackId,
          queueEnded: false,
          playbackRevision: state.playbackRevision + 1,
          shuffleOrder: state.orderMode === "shuffle" ? nextOrder : [],
          progressMs: 0,
          listenedSessionMs: 0,
          sessionCounted: false,
          sessionSeeked: false,
          playing: true,
        });
      },
      previous: () => {
        const state = get();
        if (state.progressMs > 5000)
          return set({
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
            playbackRevision: state.playbackRevision + 1,
          });
        const order =
          state.orderMode === "shuffle" && state.shuffleOrder.length === state.queue.length
            ? state.shuffleOrder
            : state.queue;
        const index = Math.max(0, order.indexOf(state.currentTrackId ?? order[0]));
        const previousIndex = index - 1;
        if (previousIndex < 0 && state.repeatMode === "off")
          return set({
            progressMs: 0,
            listenedSessionMs: 0,
            sessionCounted: false,
            sessionSeeked: false,
            playbackRevision: state.playbackRevision + 1,
          });
        const currentTrackId = order[(previousIndex + order.length) % order.length];
        set({
          currentTrackId,
          queueEnded: false,
          playbackRevision: state.playbackRevision + 1,
          progressMs: 0,
          listenedSessionMs: 0,
          sessionCounted: false,
          sessionSeeked: false,
          playing: true,
        });
      },
      setProgress: (progressMs) => set({ progressMs }),
      seekPlayback: (progressMs) => set({ progressMs, sessionSeeked: true, queueEnded: false }),
      tickPlayback: (elapsedMs) => {
        const state = get();
        if (!state.playing || state.currentTrackId === undefined) return;
        set({ listenedSessionMs: state.listenedSessionMs + Math.max(0, elapsedMs) });
      },
      completePlayback: () => {
        const state = get();
        const track = state.tracks.find((item) => item.id === state.currentTrackId);
        // Only natural completion counts. Allow one polling interval at either end.
        if (
          !track ||
          !state.playing ||
          state.sessionCounted ||
          state.sessionSeeked ||
          track.durationMs <= 0 ||
          state.listenedSessionMs < Math.max(1, track.durationMs - 750)
        )
          return;
        set({
          sessionCounted: true,
          playCounts: { ...state.playCounts, [track.id]: (state.playCounts[track.id] ?? 0) + 1 },
        });
      },
      setVolume: (volume) => set({ volume, muted: false }),
      toggleMute: () => set({ muted: !get().muted }),
      toggleOrderMode: () =>
        set((state) => {
          const orderMode = state.orderMode === "sequence" ? "shuffle" : "sequence";
          return {
            orderMode,
            shuffleOrder:
              orderMode === "shuffle" ? shuffleTracks(state.queue, state.currentTrackId) : [],
          };
        }),
      cycleRepeatMode: () =>
        set((state) => ({
          repeatMode: repeatCycle[(repeatCycle.indexOf(state.repeatMode) + 1) % repeatCycle.length],
        })),
      toggleDrawer: (drawer) => set({ drawer: get().drawer === drawer ? null : drawer }),
      enqueue: (id) =>
        set((state) => {
          const track = state.tracks.find((item) => item.id === id);
          if (!track || !trackIsSelected(track, state)) return {};
          const queue = [...state.queue, id];
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
            notice: t("已添加到队列"),
          };
        }),
      playNext: (id) => {
        const state = get();
        const track = state.tracks.find((item) => item.id === id);
        if (!track || !trackIsSelected(track, state)) return;
        const index = Math.max(0, state.queue.indexOf(state.currentTrackId ?? state.queue[0]));
        const queue = [...state.queue.slice(0, index + 1), id, ...state.queue.slice(index + 1)];
        set({
          queue,
          shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          notice: t("已设为下一首"),
        });
      },
      removeFromQueue: (index) =>
        set((state) => {
          const queue = state.queue.filter((_, itemIndex) => itemIndex !== index);
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          };
        }),
      reorderQueue: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.queue.length ||
            toIndex >= state.queue.length
          )
            return state;
          const queue = [...state.queue];
          const [moved] = queue.splice(fromIndex, 1);
          queue.splice(toIndex, 0, moved);
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? shuffleTracks(queue) : [],
          };
        }),
      clearQueue: () =>
        set((state) => {
          const queue = state.currentTrackId === undefined ? [] : [state.currentTrackId];
          return {
            queue,
            shuffleOrder: state.orderMode === "shuffle" ? [...queue] : [],
          };
        }),
      rate: (id, rating) => set({ ratings: { ...get().ratings, [id]: rating } }),
      createPlaylist: (name) => {
        const id = `${Date.now()}`;
        set({
          playlists: [...get().playlists, { id, name, trackIds: [] }],
          page: "playlist",
          selectedPlaylistId: id,
        });
        return id;
      },
      renamePlaylist: (id, name) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === id ? { ...playlist, name } : playlist,
          ),
        }),
      deletePlaylist: (id) =>
        set({
          playlists: get().playlists.filter((playlist) => playlist.id !== id),
          page: "playlists",
          selectedPlaylistId: undefined,
        }),
      addToPlaylist: (playlistId, trackId) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === playlistId && !playlist.trackIds.includes(trackId)
              ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
              : playlist,
          ),
          notice: t("已添加到歌单"),
        }),
      addManyToPlaylist: (playlistId, trackIds) =>
        set({
          playlists: get().playlists.map((playlist) => {
            if (playlist.id !== playlistId) return playlist;
            const existing = new Set(playlist.trackIds);
            return {
              ...playlist,
              trackIds: [...playlist.trackIds, ...trackIds.filter((id) => !existing.has(id))],
            };
          }),
          notice: t("已将 {0} 首歌曲添加到歌单", trackIds.length),
        }),
      removeFromPlaylist: (playlistId, trackId) =>
        set({
          playlists: get().playlists.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, trackIds: playlist.trackIds.filter((id) => id !== trackId) }
              : playlist,
          ),
        }),
      reorderPlaylist: (playlistId, fromTrackId, toTrackId) =>
        set({
          playlists: get().playlists.map((playlist) => {
            if (playlist.id !== playlistId || fromTrackId === toTrackId) return playlist;
            const next = playlist.trackIds.filter((id) => id !== fromTrackId);
            const target = next.indexOf(toTrackId);
            next.splice(target < 0 ? next.length : target, 0, fromTrackId);
            return { ...playlist, trackIds: next };
          }),
        }),
      setOnlineLyrics: (onlineLyrics) => set({ onlineLyrics }),
      setTheme: (theme) => set({ theme }),
      setOutputDevice: (outputDevice) => set({ outputDevice }),
      dismissOnboarding: () => set({ onboardingDismissed: true }),
    }),
    {
      name: "nanoplayer-state-v1",
      version: 4,
      migrate: (persisted, version) => {
        if (version > 4) throw new Error("Saved settings require a newer nanoPlayer version.");
        return version < currentVisualDesignVersion
          ? {
              ...migrateUserState(persisted),
              visualDesignVersion: currentVisualDesignVersion,
              theme: "dark",
            }
          : migrateUserState(persisted);
      },
      merge: (persisted, current) => ({ ...current, ...migrateUserState(persisted) }) as NanoState,
      storage: changedStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.localStorage,
      ),
      partialize: ({
        lyricOffsets,
        lyricFontSize,
        visualDesignVersion,
        statisticsVersion,
        selectedRootIds,
        playlists,
        ratings,
        playCounts,
        lastPlayedAt,
        volume,
        muted,
        orderMode,
        repeatMode,
        shuffleOrder,
        onlineLyrics,
        theme,
        language,
        outputDevice,
        queue,
        currentTrackId,
        progressMs,
        onboardingDismissed,
      }) => ({
        lyricOffsets,
        lyricFontSize,
        visualDesignVersion,
        statisticsVersion,
        selectedRootIds,
        playlists,
        ratings,
        playCounts,
        lastPlayedAt,
        volume,
        muted,
        orderMode,
        repeatMode,
        shuffleOrder,
        onlineLyrics,
        theme,
        language,
        outputDevice,
        queue,
        currentTrackId,
        progressMs,
        onboardingDismissed,
      }),
    },
  ),
);

setActiveLanguage(useNanoStore.getState().language);
useNanoStore.subscribe((state, previous) => {
  if (state.language !== previous.language) setActiveLanguage(state.language);
});
