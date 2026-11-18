import { reactRouter } from '@react-router/dev/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

import { latestPlugin } from './vite-plugin-latest'
import { simPlugin } from './vite-plugin-sim'

/**
 * The armory planner's build: React Router on a Cloudflare Worker, with
 * Tailwind 4 and shadcn/ui on Base UI (see `src/styles.css` and
 * `components.json`).
 */
export default defineConfig({
    build: {
        rollupOptions: {
            // Harmless warnings on every build, silenced so the ones that
            // matter stand out: zod ships comments Rollup can't place, and
            // Base UI marks its modules 'use client' (for server components,
            // which this page doesn't use), which Rollup drops.
            onwarn(warning, warn) {
                const fromDependency = warning.id?.includes('/node_modules/')
                const harmless = [
                    'INVALID_ANNOTATION',
                    'MODULE_LEVEL_DIRECTIVE',
                    'SOURCEMAP_ERROR',
                ]
                if (fromDependency && harmless.includes(warning.code ?? ''))
                    return
                warn(warning)
            },
        },
    },
    resolve: {
        // shadcn's import alias (components.json, and `paths` in
        // tsconfig.json for TypeScript and Bun's tests): `@/` is `src/`.
        // Vite's own alias, so no tsconfig-paths plugin.
        alias: [
            {
                find: /^@\//,
                replacement: `${fileURLToPath(new URL('./src', import.meta.url))}/`,
            },
        ],
    },
    optimizeDeps: {
        // Found only once the page is served (or, for the charts, once a
        // lazy chunk loads), so a fresh install's first dev visit
        // re-bundled and reloaded the page, losing a click. Every browser
        // dependency the page imports, listed up front;
        // tests/vite-config.test.ts checks the list against the imports.
        include: [
            '@base-ui/react/button',
            '@base-ui/react/dialog',
            '@base-ui/react/merge-props',
            '@base-ui/react/popover',
            '@base-ui/react/select',
            '@base-ui/react/slider',
            '@base-ui/react/tooltip',
            '@base-ui/react/use-render',
            '@goturbo/sim',
            'class-variance-authority',
            'cn',
            'lucide-react',
            'recharts',
            'zod',
        ],
    },
    plugins: [
        cloudflare({ viteEnvironment: { name: 'ssr' } }),
        tailwindcss(),
        reactRouter(),
        // The browser sim's files at /sim/ (packages/sim/build/).
        simPlugin(),
        // Dev only: the owner's latest results file at /local/, from the
        // untracked packages/armory/.local.json.
        latestPlugin(),
    ],
})
