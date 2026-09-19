export function shortcut(key: string, platform = navigator.platform) {
  return /Mac|iPhone|iPad/i.test(platform) ? `⌘${key.toUpperCase()}` : `Ctrl ${key.toUpperCase()}`;
}
