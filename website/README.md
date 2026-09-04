# nanoPlayer website

This Next.js project contains the product introduction and download status pages. It intentionally does not expose placeholder binary links. When a release passes the repository release process, update `public/downloads/latest.json`, add verified download URLs to the download page, build, deploy to Vercel, and verify each live artifact.

```bash
npm install
npm run dev
npm run build
```

The download page renders `public/downloads/latest.json`; do not hardcode version numbers or artifact URLs in the component. The tag-triggered GitHub release workflow regenerates this manifest from the files it actually published and then performs a prebuilt production deployment to Vercel. Automatic Git deployments from `main` are disabled in `vercel.json` so that the generated metadata commit and the explicit verified deployment do not publish the same release twice.

The site is configured as a static Next.js export for Vercel. Publishing is a separate release action and must not happen merely because the local site builds.
