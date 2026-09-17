# Desktop → Pad parity checklist

Source audit: 2026-09-16, desktop 0.1.7 working tree. This is an acceptance checklist, not a claim that Android UI is implemented.

| Surface | Source of truth | Required order / behavior | Android exception |
| --- | --- | --- | --- |
| Primary navigation | src/App.tsx navigation | 首页、本地资料库、歌曲、专辑、艺术家、最近添加、播放最多、高评分 | P1 only hides the sidebar in narrow split view; never removes entries |
| Playlists navigation | src/App.tsx sidebar | 歌单 heading, 新建歌单, playlists in stored order, Settings at bottom | No regrouping |
| Track context menu | src/library/TrackTable.tsx menu | 立即播放 → 下一首播放 → 添加到队列 → 添加到 each playlist in stored order | P2 long press opens the same menu; never implicitly selects or plays |
| Track activation | TrackTable.tsx | Title single click opens details, row double click plays, explicit play button plays | Touch visibility/size under P3 |
| Playlist ordering | TrackTable.tsx | Drag handle, move up/down buttons; not alphabetical auto-sort | Handle drag does not trigger long-press context menu |
| Player leading | src/player/PlayerBar.tsx | Artwork opens now playing, title/artist/album, favorite | Same actions |
| Transport | PlayerBar.tsx | Order mode → repeat mode → previous → play/pause → next → lyrics | Same sequence; native service owns facts |
| Player trailing | PlayerBar.tsx | Queue → mute → volume | P5 system output mapping in settings |
| Lyrics and queue | src/player/PlayerDrawer.tsx | Existing drawer selection and close behavior | Narrow overlay may scroll; retains navigation and return behavior |
| Settings | src/library/ContentPage.tsx SettingsPage | 版本/更新 → 界面语言 → 播放计数 → 源文件只读 → 在线歌词 → 外观 → 快捷键 → 播放恢复 → 音频输出 → 数据库备份 → 从最新备份恢复 → 清除网络歌词缓存 → 清除封面缓存 → 导出脱敏诊断 | P5 platform mapping only; no silently dropped control |
| Update section | src/updates/UpdateSettings.tsx | Version/status and explicit user update action | P5 Android APK/store flow, not desktop updater |
| Native window | src-tauri/src/desktop.rs | Desktop-only window/menu lifecycle | P4 not initialized on Android |

Final UI acceptance must compare the implemented shared components in both desktop and Pad builds, including settings subsections, menu item state/disabled behavior, dialogs, search, row details, file-folder management and keyboard focus. This checklist does not authorize alternate feature ordering.
