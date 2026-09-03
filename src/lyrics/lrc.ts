export interface LyricLine {
  at: number | null;
  text: string;
}

const timestamp = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const offsetTag = /^\[offset:([+-]?\d+)\]$/i;
const metadataTag = /^\[(ar|al|ti|by|re|ve|length):/i;

export function parseLyrics(content?: string): { lines: LyricLine[]; synchronized: boolean } {
  if (!content?.trim()) return { lines: [], synchronized: false };
  let offset = 0;
  const pending: LyricLine[] = [];
  for (const raw of content.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const offsetMatch = line.match(offsetTag);
    if (offsetMatch) {
      offset = Number(offsetMatch[1]);
      continue;
    }
    if (metadataTag.test(line)) continue;
    const times = [...line.matchAll(timestamp)];
    const text = line.replace(timestamp, "").trim();
    if (times.length) {
      if (!text) continue;
      for (const match of times) {
        const fraction = match[3] ? Number(match[3].padEnd(3, "0").slice(0, 3)) : 0;
        pending.push({ at: (Number(match[1]) * 60 + Number(match[2])) * 1000 + fraction, text });
      }
    } else {
      pending.push({ at: null, text: line });
    }
  }
  const synchronized = pending.some((line) => line.at !== null);
  const lines = pending.map((line) => ({
    ...line,
    at: line.at === null ? null : Math.max(0, line.at + offset),
  }));
  if (synchronized)
    lines.sort(
      (left, right) => (left.at ?? Number.MAX_SAFE_INTEGER) - (right.at ?? Number.MAX_SAFE_INTEGER),
    );
  return { lines, synchronized };
}

export function activeLyricIndex(lines: LyricLine[], progressMs: number) {
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const at = lines[index].at;
    if (at !== null && at <= progressMs) active = index;
  }
  return active;
}
