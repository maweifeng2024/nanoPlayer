import type { Track } from "../domain";

export const LIMIT = 12;
export const CACHE_KEY = "nanoplayer.recommendations.v1";
export const CONSENT_KEY = "nanoplayer.recommendations.consent";
export type Stats = { playCounts: Record<number, number>; lastPlayedAt: Record<number, string> };
export type RecommendationCache = {
  version: 1;
  active: number[];
  pending?: number[];
  generatedAt: number;
  retryAt?: number;
  sentIds?: number[];
  title?: string;
  description?: string;
  pendingTitle?: string;
  pendingDescription?: string;
};

export const boundedCopy = (value: unknown, max: number) =>
  typeof value === "string"
    ? value
        .replace(/[\r\n\t]/g, " ")
        .trim()
        .slice(0, max)
    : "";

const playedTime = (raw: string | undefined) =>
  /^\d+$/.test(raw ?? "") ? Number(raw) * 1000 : Date.parse(raw ?? "");

export function recentTracks(tracks: Track[], stats: Stats) {
  return tracks
    .filter((track) => stats.lastPlayedAt[track.id])
    .sort((a, b) => playedTime(stats.lastPlayedAt[b.id]) - playedTime(stats.lastPlayedAt[a.id]))
    .slice(0, LIMIT);
}

export function eligibleTracks(tracks: Track[], stats: Stats) {
  const recent = recentTracks(tracks, stats);
  if (!recent.length) return tracks;
  const excluded = new Set(recent.map((track) => track.id));
  const threshold = Math.min(...recent.map((track) => stats.playCounts[track.id] ?? 0));
  return tracks.filter(
    (track) =>
      !excluded.has(track.id) &&
      ((stats.playCounts[track.id] ?? 0) === 0 || (stats.playCounts[track.id] ?? 0) < threshold),
  );
}

export function shuffled<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function intervalMs(tracks: Track[], stats: Stats, now: number) {
  const count = tracks.filter((track) => {
    const raw = stats.lastPlayedAt[track.id];
    const date = playedTime(raw);
    return date <= now && date >= now - 7 * 86400000;
  }).length;
  return (count >= 30 ? 1 : count >= 10 ? 3 : 7) * 86400000;
}

export function validatedIds(value: unknown, allowed: Set<number>) {
  return Array.isArray(value)
    ? [
        ...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && allowed.has(id))),
      ].slice(0, LIMIT)
    : [];
}

// UTF-8 bytes are a conservative upper bound on the token budget. No paths,
// artwork, lyrics or stable client identifier leave the device.
export function buildRequest(tracks: Track[], stats: Stats, sentIds: number[] = []) {
  const recent = recentTracks(tracks, stats);
  const artists = new Set(recent.map((track) => track.artist));
  const eligible = shuffled(eligibleTracks(tracks, stats));
  const sent = new Set(sentIds);
  const fresh = eligible.filter((track) => !sent.has(track.id));
  const pool = fresh.length ? fresh : eligible;
  pool.sort((a, b) => Number(artists.has(b.artist)) - Number(artists.has(a.artist)));
  const compact = (track: Track) => ({
    id: track.id,
    title: track.title.slice(0, 100),
    artist: track.artist.slice(0, 100),
  });
  const request = {
    recent: recent.map(compact),
    candidates: [] as ReturnType<typeof compact>[],
    count: LIMIT,
  };
  const seen = new Set<number>();
  let bytes = new TextEncoder().encode(JSON.stringify(request)).length;
  for (const track of pool) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    const item = compact(track);
    const size = new TextEncoder().encode(JSON.stringify(item)).length + 1;
    if (bytes + size > 12000 || request.candidates.length >= 400) continue;
    request.candidates.push(item);
    bytes += size;
  }
  return request;
}

export function readCache(): RecommendationCache {
  const empty: RecommendationCache = { version: 1, active: [], generatedAt: 0 };
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    const valid = (ids: unknown) =>
      Array.isArray(ids) && ids.length <= LIMIT && ids.every(Number.isSafeInteger);
    if (
      value?.version !== 1 ||
      !valid(value.active) ||
      (value.pending !== undefined && !valid(value.pending)) ||
      !Number.isFinite(value.generatedAt) ||
      value.generatedAt < 0
    )
      return empty;
    return {
      ...value,
      title: boundedCopy(value.title, 60),
      description: boundedCopy(value.description, 160),
      pendingTitle: boundedCopy(value.pendingTitle, 60),
      pendingDescription: boundedCopy(value.pendingDescription, 160),
      sentIds: Array.isArray(value.sentIds)
        ? value.sentIds.filter(Number.isSafeInteger).slice(0, 100000)
        : [],
      retryAt: Number.isFinite(value.retryAt) ? value.retryAt : 0,
    };
  } catch {
    return empty;
  }
}
