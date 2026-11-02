# 源码清单

基线：19bb1c8 与当前工作区，2026-11-02。

- `src/App.tsx`
- `src/ConfirmDialog.tsx`
- `src/layouts/PhoneNavigation.tsx`
- `src/library/AmbientBackground.tsx`
- `src/library/Artwork.tsx`
- `src/library/ContentPage.tsx`
- `src/library/HomeArtworkTint.tsx`
- `src/library/IOSLibraryDialogs.tsx`
- `src/library/IOSLibraryPage.tsx`
- `src/library/IOSOpenFiles.tsx`
- `src/library/LibraryPage.tsx`
- `src/library/PlaylistArtwork.tsx`
- `src/library/TrackDetails.tsx`
- `src/library/TrackTable.tsx`
- `src/library/WifiTransfer.tsx`
- `src/lyrics/LyricText.tsx`
- `src/main.tsx`
- `src/player/PlayerBar.tsx`
- `src/player/PlayerDrawer.tsx`
- `src/player/SleepTimer.tsx`
- `src/updates/UpdateSettings.tsx`

样式：src/styles.css → android.css → iosLibrary.css → ios.css → consistency.css（main.tsx 导入顺序）。

颜色、间距、圆角已提取源值。排版使用最终 consistency 覆盖。移动排版见规范。系统字体无随仓库字体文件；lucide-react 为现有图标来源。本轮不复制整套第三方图标。应用图标仍以 docs/design/nanoplayer-app-icon-v3.png 为准。动态封面色、媒体查询高对比覆盖、布局几何与 motion 未混入基础 token。组件未构建，清单不是组件库导出承诺。
