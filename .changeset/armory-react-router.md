---
'@goturbo/armory': minor
---

The armory planner moves from Bun's HTML bundler to React Router 8 (framework mode) on Vite, with `@cloudflare/vite-plugin`, Wrangler and Tailwind 4 (no preflight). The page is prerendered from one route and looks and behaves as before. The Worker has no bindings and makes no requests. The error boundary is now the home route's `ErrorBoundary` (`react-error-boundary` is gone). New root script: `preview:armory`. The build now writes `packages/armory/build/`.
