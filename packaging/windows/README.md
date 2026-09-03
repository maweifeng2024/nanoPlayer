# Windows packaging

Produce an NSIS installer first and MSI second. Sign both installer and executable with Authenticode. Validate WebView2 availability, long and non-ASCII paths, media keys through SMTC, WASAPI device changes, install/upgrade/uninstall, and preservation of the application database. Installer uninstall must never touch indexed music folders.

