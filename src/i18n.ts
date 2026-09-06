import english from "./translations.en.json";

export type Language = "zh-CN" | "en";
let activeLanguage: Language = "zh-CN";
export function setActiveLanguage(language: Language) {
  activeLanguage = language;
}
const dictionary: Record<string, string> = english;
const reverse = Object.fromEntries(Object.entries(dictionary).map(([zh, en]) => [en, zh]));
const interpolate = (template: string, values: unknown[]) =>
  template.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ""));
const patterns = Object.entries(dictionary)
  .filter(([key]) => /\{\d+\}/.test(key))
  .map(([zh, en]) => {
    const compile = (template: string) =>
      new RegExp(
        "^" +
          template
            .split(/\{\d+\}/)
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("(.*?)") +
          "$",
        "s",
      );
    return { zh, en, fromChinese: compile(zh), fromEnglish: compile(en) };
  });

/** UI copy only: metadata, lyrics, paths and user playlist names stay intact. */
export function t(key: string, ...values: unknown[]): string {
  const en = activeLanguage === "en";
  const exact = en ? dictionary[key] : reverse[key];
  if (exact !== undefined) return interpolate(exact, values);
  if (!en && dictionary[key] !== undefined) return interpolate(key, values);
  if (values.length) return interpolate(key, values);
  // Native errors and already-visible notifications can arrive as formatted strings.
  for (const entry of patterns) {
    const match = (en ? entry.fromChinese : entry.fromEnglish).exec(key);
    if (match) return interpolate(en ? entry.en : entry.zh, match.slice(1));
  }
  return key;
}

export function locale() {
  return activeLanguage === "en" ? "en-US" : "zh-CN";
}
