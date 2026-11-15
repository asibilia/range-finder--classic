/**
 * The dev server's first load. Vite pre-bundles the browser's dependencies
 * it finds by crawling the code; one it only meets while serving the page
 * (or a lazy chunk) makes it re-bundle and reload the page, losing whatever
 * the visitor just did. Every one the page imports is listed up front.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Read as text: vite.config.ts belongs to tsconfig.node.json, not to the
// tests' project, so the tests can't import it.
const config = await Bun.file(
    new URL('../vite.config.ts', import.meta.url)
).text()

const SRC = new URL('../src', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return sourceFiles(path)
        return /\.tsx?$/.test(entry.name) ? [path] : []
    })
}

/** The packages the page's own code imports in the browser. */
function browserImports(): string[] {
    const found = new Set<string>()
    for (const file of sourceFiles(SRC)) {
        // Build-time and server files: never in the browser.
        if (/(entry\.server\.tsx|routes\.ts)$/.test(file)) continue
        for (const m of readFileSync(file, 'utf8').matchAll(
            /from '([^'.@/][^']*|@[^'/]+\/[^']+)'/g
        )) {
            const name = m[1]!
            // React and React Router are crawled from the entry; `@/` is ours.
            if (/^(react|react-dom|react-router)(\/|$)/.test(name)) continue
            if (name.startsWith('@/')) continue
            found.add(name)
        }
    }
    return [...found].sort()
}

function included(): string[] {
    const optimizeDeps = config.match(/optimizeDeps: \{([\s\S]*?)\n {4}\}/)
    expect(optimizeDeps).not.toBeNull()
    const include = optimizeDeps![1]!.match(/include: \[([\s\S]*?)\]/)
    expect(include).not.toBeNull()
    return [...include![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort()
}

describe('vite.config.ts', () => {
    test('pre-bundles every browser dependency the page imports', () => {
        const imports = browserImports()
        expect(imports).toEqual(
            expect.arrayContaining([
                '@base-ui/react/dialog',
                'class-variance-authority',
                'cn',
                'lucide-react',
                'recharts',
                'zod',
            ])
        )
        expect(included()).toEqual(imports)
    })
})
