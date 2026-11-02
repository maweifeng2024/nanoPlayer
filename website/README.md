# nanoPlayer website

Next.js static export hosted by Cloudflare Workers Static Assets at <https://nanoplayer.nanodo.cc>. Domain names are case-insensitive. `wrangler.jsonc` defines the custom domain and static `out/` directory; unknown routes return the exported 404 page. Installers remain on GitHub Release, avoiding Cloudflare asset size limits and preserving published checksums.

From the repository root:

```sh
npm ci --prefix website
pnpm website:sync
pnpm website:check
pnpm website:deploy
pnpm website:verify 0.1.30
```

`website:sync` reads the latest published stable release using authenticated `gh`, verifies every installer against published SHA256SUMS and GitHub asset digests/sizes, then writes `public/downloads/latest.json`. Missing platforms/checksums fail without replacing the previous manifest. The download page reads this manifest at build time. `website:build` only builds; `website:check` also runs migration tests, lint and Wrangler dry-run. `website:deploy` builds then publishes; run it only when publication is authorized. Local deployment needs Wrangler login or `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

The release workflow retains artifact provenance checks, generates the manifest from actual published installers, deploys to Cloudflare and verifies the custom domain before persisting metadata to main. Set repository Actions secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit and zone DNS/zone read permissions for nanodo.cc) and `CLOUDFLARE_ACCOUNT_ID`. Connector access does not create CLI credentials or Actions secrets. Configure them before the next user-run release. The old Vercel project can remain available until cutover is verified; it is no longer the release deployment target. `vercel.json` continues to disable automatic Git deployment on that legacy project.

This migration updates website distribution only; application version remains 0.1.30. No installers are rebuilt and Android/iOS public distribution remains unavailable. See the [migration checklist](../docs/development/REGRESSION_CHECKLIST.md#官网-cloudflare-迁移验收2026-10-26).

## Current product previews

Updated 2026-10-15 from v0.1.23 source. `public/product-home-current.png`, `product-android-current.png`, `product-iphone-current.png`, and `product-ipad-current.png` are fresh Chromium renders of the shared UI using synthetic browser demo data, not native device screenshots. Viewports: desktop 1440×960, Android/iPhone 390×844, iPad 1024×900. iOS previews show the three-source library and managed folder browser. No personal media is included.

Keep implemented mobile features separate from public download availability and device qualification. Desktop download metadata comes from the published release manifest; Android and iOS do not have public download buttons. This content-only update does not allocate an application version or rebuild mobile installers.

Validation for this content refresh: `pnpm website:build`, `npm --prefix website run lint`, `git diff --check`, and README relative-link checks passed. Chromium checked homepage/downloads at 1440, 390, and 768px: all four images decode, eight desktop artifact links render, no horizontal overflow or page errors. Desktop/mobile page previews were visually reviewed. Download hashes and sizes for v0.1.23 were cross-checked against GitHub asset metadata and published SHA256SUMS; no installer was rebuilt.

## Cloudflare migration verification (2026-10-26)

Deployed v0.1.30 website to <https://nanoplayer.nanodo.cc>, deployment ID `f02d183c-2a2b-4e14-a44c-1ca04e02229b`. Live homepage/download/manifest verification passed. Local and live Cloudflare browser checks passed at 1440/390/768px with loaded images, no overflow/page errors, eight installer links plus checksums, and an unknown-route 404. Screenshots and script: `artifacts/website/cloudflare-2026-10-26/` (local, ignored).

Migration tests (3), release tests (19), `pnpm check` (73 Vitest tests), static build/dry-run and Markdown paths passed. An unrelated existing lint warning remains for the shared UI unused Clock3 import. Published checksums and GitHub asset metadata match all eight downloads. Direct binary HEAD requests timed out; no fresh full-binary checksum or install qualification is claimed. Actions has legacy Vercel secrets only: add Cloudflare secrets before the next release. No remote workflow was run and local source changes have not been pushed.
