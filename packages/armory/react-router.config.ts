import type { Config } from '@react-router/dev/config'

/**
 * React Router (framework mode) for the armory planner: one page, `/`.
 *
 * The page is prerendered to `build/client/index.html` at build time, and
 * the Worker server-renders anything else (only error pages: there are no
 * other routes). SPA mode (`ssr: false`) is not supported with
 * `@cloudflare/vite-plugin`, hence `ssr: true` plus a prerender.
 */
export default {
    // The page lives in src/ (not React Router's default app/), where it
    // lived before and where the tests import it from.
    appDirectory: 'src',
    ssr: true,
    prerender: ['/'],
    // Every route is in the first page's manifest, so the browser never asks
    // the Worker for `/__manifest`.
    routeDiscovery: { mode: 'initial' },
} satisfies Config
