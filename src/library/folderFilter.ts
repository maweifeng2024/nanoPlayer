import type { LibraryRoot } from "../domain";

// Match directory boundaries, including nested roots and Windows separators.
// POSIX paths remain case-sensitive; Windows drive/UNC paths are case-insensitive.
export function trackInRoots(path: string, roots: Pick<LibraryRoot, "path">[]) {
  const normalize = (value: string) => {
    const slash = value.replace(/\\/g, "/").replace(/\/+$/, "");
    return /^[a-z]:/i.test(slash) || slash.startsWith("//") ? slash.toLowerCase() : slash;
  };
  const candidate = normalize(path);
  return Boolean(path) && roots.some((root) => candidate.startsWith(`${normalize(root.path)}/`));
}
