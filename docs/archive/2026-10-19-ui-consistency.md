# 0.1.30 UI 一致性与首页/歌单菜单回归

2026-10-19。需求来自用户批准的 `designs/ui-consistency-review/`，本清单先于实现建立。

| 编号 | 需求 / 验收标准 | 验证入口 | 结果 |
| --- | --- | --- | --- |
| U01 | 桌面32/18/14/13字号，常规按钮36px；手机26/18/16/14、Pad28/18/16/14，触摸按钮44px；统一8px圆角、20px工具图标和间距 | 新E2E、typography、check:ui | 通过，详见 summary.md |
| U02 | 保留现有导航、底栏、深浅色、600–900px Pad72px图标侧栏；720桌面、360/390手机、600/840/1024Pad无溢出 | 新E2E、android-layout、ios-ui-redesign、截图 | 通过，详见 summary.md |
| M01 | 歌曲菜单中每个歌单ID只出现一次；不同ID同名歌单仍可分别添加且标签可辨识；空歌单、长列表、批量添加一致 | helper单测、新E2E | 通过，详见 summary.md |
| M02 | 菜单再次点击关闭、外部/Escape/返回关闭、焦点恢复、旋转和末项可达；不改变其他菜单顺序 | playback-ui-fixes、ios-ui-redesign、新E2E | 通过，详见 summary.md |
| H01 | 最近添加与推荐集合共用数量上限（移动12、桌面20）；最近添加仍按专辑聚合，仅可见资料库、日期降序，横向滚动可达最后项；不足不填充 | recentAlbums单测、新E2E、library-selection | 通过，详见 summary.md |
| H02 | 首页播放最多/高评分移除播放状态标识及预留列；封面左缘与分区标题左缘一致；普通列表/队列播放状态保留，点击推荐维持原队列 | 新E2E、collection-queue、既有回归 | 通过，详见 summary.md |
| R01 | pnpm check、完整E2E、Rust fmt/Clippy/tests/10k、发布脚本单测、官网构建 | summary.md记录 | 通过，详见 summary.md |
| N01 | Android JVM、可用模拟器/设备测试、本次APK版本/ABI/hash/签名校验 | 本地构建与设备证据 | 部分通过：JVM/打包通过；无连接 Android 设备，原生触摸与设备验收未执行 |
| N02 | iOS原生单测、工具链可用则构建本次模拟器，iPhone/iPad检查；真实安全区/大字体/设备行为与浏览器结论分开 | iOS公共生命周期命令 | 部分通过：Swift及双模拟器通过；各1项真实歌曲点播跳过，真机/大字体/安全区待验收 |

不修改源音频与原生队列算法；仅UI与目标选择视图。未执行项必须保留原因和后续验收方式。桌面发布由用户运行。

## 已执行与待验收

73项Vitest、110项E2E、26项Rust及显式10k、23项发布/iOS脚本、75项Swift、15项Android JVM通过。iPhone/iPad各2项原生用例通过、各1项初始空库点播跳过。已检查6张共享快照和两端原生截图。

本地Android0.1.30-b1031（arm64，APK v2调试签名）与iOS0.1.30-b12模拟器ZIP（arm64，adhoc）已归档；详细hash、命令、截图与边界见 [本地验证报告](../../artifacts/verification/v0.1.30/summary.md)。Android设备、iOS真机/真实音频、大字体和系统分屏仍待验收。桌面发布交由用户在main运行 `pnpm release 0.1.30`。
