# Windows packaging

2026-09-11：v0.1.7 已发布 x64 NSIS EXE 与中英文 MSI，当前未签名。下述原生系统集成和安装验证不因安装包存在而视为通过。

Produce an NSIS installer first and MSI second. Sign both installer and executable with Authenticode. Validate WebView2 availability, long and non-ASCII paths, media keys through SMTC, WASAPI device changes, install/upgrade/uninstall, and preservation of the application database. Installer uninstall must never touch indexed music folders.

