# nanoPlayer website

This Next.js project contains the product introduction and download status pages. It intentionally does not expose placeholder binary links. When a release passes the repository release process, update `public/downloads/latest.json`, add verified download URLs to the download page, build, deploy to Vercel, and verify each live artifact.

```bash
npm install
npm run dev
npm run build
```

The download page renders `public/downloads/latest.json`; do not hardcode version numbers or artifact URLs in the component. The tag-triggered GitHub release workflow regenerates this manifest from the files it actually published and then performs a prebuilt production deployment to Vercel. Automatic Git deployments from `main` are disabled in `vercel.json` so that the generated metadata commit and the explicit verified deployment do not publish the same release twice.

The site is configured as a static Next.js export for Vercel. Publishing is a separate release action and must not happen merely because the local site builds.

## Current product previews

Updated 2026-10-15 from v0.1.23 source. `public/product-home-current.png`, `product-android-current.png`, `product-iphone-current.png`, and `product-ipad-current.png` are fresh Chromium renders of the shared UI using synthetic browser demo data, not native device screenshots. Viewports: desktop 1440×960, Android/iPhone 390×844, iPad 1024×900. iOS previews show the three-source library and managed folder browser. No personal media is included.

Keep implemented mobile features separate from public download availability and device qualification. Desktop download metadata comes from the published release manifest; Android and iOS do not have public download buttons. This content-only update does not allocate an application version or rebuild mobile installers.

Validation for this content refresh: `pnpm website:build`, `npm --prefix website run lint`, `git diff --check`, and README relative-link checks passed. Chromium checked homepage/downloads at 1440, 390, and 768px: all four images decode, eight desktop artifact links render, no horizontal overflow or page errors. Desktop/mobile page previews were visually reviewed. Download hashes and sizes for v0.1.23 were cross-checked against GitHub asset metadata and published SHA256SUMS; no installer was rebuilt.
