import type { CSSProperties } from "react";
import type { LyricLine } from "./lrc";

export function LyricText({
  line,
  progressMs,
  endMs,
}: {
  line: LyricLine;
  progressMs: number;
  endMs?: number | null;
}) {
  if (!line.words) return <>{line.text}</>;
  return (
    <>
      {line.words.map((word, index) => {
        const end = line.words![index + 1]?.at ?? endMs ?? word.at;
        const fraction =
          end > word.at
            ? Math.max(0, Math.min(1, (progressMs - word.at) / (end - word.at)))
            : Number(progressMs >= word.at);
        return (
          <span
            key={index}
            className={`lyric-word${fraction >= 1 ? " sung" : ""}`}
            style={{ "--word-fill": `${fraction * 100}%` } as CSSProperties}
          >
            {word.text}
          </span>
        );
      })}
    </>
  );
}
