import { reactRouter } from '@react-router/dev/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

/**
 * The armory planner's build: React Router on a Cloudflare Worker, with
 * Tailwind 4 (theme and utilities only, no preflight; see `src/styles.css`).
 */
export default defineConfig({
    build: {
        rollupOptions: {
            // zod ships comments Rollup can't place; a harmless warning on
            // every build, silenced so the ones that matter stand out.
            onwarn(warning, warn) {
                const fromDependency = warning.id?.includes('/node_modules/')
                if (warning.code === 'INVALID_ANNOTATION' && fromDependency)
                    return
                warn(warning)
            },
        },
    },
    plugins: [
        cloudflare({ viteEnvironment: { name: 'ssr' } }),
        tailwindcss(),
        reactRouter(),
    ],
})
