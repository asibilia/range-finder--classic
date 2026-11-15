/**
 * The armory planner's Worker only renders the page: no bindings (no storage,
 * no other services, no AI, no variables) and no outbound requests. Results
 * files are read in the browser and never leave it. These read the Worker's
 * own files: `wrangler.jsonc` and `workers/app.ts`.
 */
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

const packageDir = new URL('../', import.meta.url)

/**
 * Every key `wrangler.jsonc` may have. Strict: anything else (kv_namespaces,
 * d1_databases, r2_buckets, services, durable_objects, ai, vars, queues,
 * routes, observability...) fails. Static assets are allowed, without a
 * binding.
 */
const WranglerConfigSchema = z.strictObject({
    $schema: z.string().optional(),
    name: z.literal('armory-planner'),
    main: z.literal('./workers/app.ts'),
    compatibility_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    compatibility_flags: z.array(z.string()).optional(),
    workers_dev: z.literal(false),
    preview_urls: z.literal(false),
    assets: z
        .strictObject({
            directory: z.string().optional(),
            html_handling: z.string().optional(),
            not_found_handling: z.string().optional(),
            run_worker_first: z
                .union([z.boolean(), z.array(z.string())])
                .optional(),
        })
        .optional(),
})

async function readText(path: string): Promise<string> {
    return Bun.file(new URL(path, packageDir)).text()
}

/** `source` without its comments, so a comment can't pass or fail a check. */
function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('the Worker', () => {
    test('wrangler.jsonc has no bindings and no public hostnames', async () => {
        const config = Bun.JSONC.parse(await readText('wrangler.jsonc'))
        const parsed = WranglerConfigSchema.safeParse(config)
        expect(parsed.error?.issues ?? []).toEqual([])
    })

    test('workers/app.ts makes no outbound requests and reads no bindings', async () => {
        const source = withoutComments(await readText('workers/app.ts'))
        // The one `fetch` is the Worker's own request handler, which takes
        // the request alone (no env, so no bindings).
        expect(source.match(/\bfetch\b/g)).toEqual(['fetch'])
        expect(source).toMatch(/^\s*fetch\(request\)\s*\{/m)
        // `import.meta.env` is Vite's build mode, not a binding.
        expect(source).not.toMatch(/(?<!import\.meta\.)\benv\b/)
        for (const word of [
            'connect(',
            'WebSocket',
            'XMLHttpRequest',
            'caches',
            'http://',
            'https://',
        ])
            expect(source).not.toContain(word)
    })
})
