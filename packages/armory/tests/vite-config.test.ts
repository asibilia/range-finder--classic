/**
 * The dev server's first load. Vite pre-bundles the browser's dependencies
 * it finds by crawling the code; one it only meets while serving the page
 * makes it re-bundle and reload the page, losing whatever the visitor just
 * did. The late ones are listed up front.
 */
import { describe, expect, test } from 'bun:test'

// Read as text: vite.config.ts belongs to tsconfig.node.json, not to the
// tests' project, so the tests can't import it.
const config = await Bun.file(
    new URL('../vite.config.ts', import.meta.url)
).text()

describe('vite.config.ts', () => {
    test('pre-bundles zod, which the crawl finds late', () => {
        const optimizeDeps = config.match(/optimizeDeps: \{([\s\S]*?)\n {4}\}/)
        expect(optimizeDeps).not.toBeNull()
        expect(optimizeDeps![1]).toMatch(/include: \[[^\]]*'zod'/)
    })
})
