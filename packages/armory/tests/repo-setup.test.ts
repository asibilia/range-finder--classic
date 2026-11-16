/**
 * The armory planner joins the repo: its words in AGENTS.md and CONTEXT.md,
 * its package and catalog dependencies, the root scripts that build,
 * type-check, lint and test it, and its commit scope. These read the repo's
 * own files as the contract. The type-check, lint and test runs themselves
 * are left to `bun run check:all`; the build, which nothing else runs, is
 * run by `build-output.test.ts`.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import ts from 'typescript'

import commitConfig from '../../../commit.config'

const REPO_ROOT = join(import.meta.dir, '../../..')

type PackageJson = {
    name?: string
    description?: string
    private?: boolean
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    workspaces?: { catalog?: Record<string, string> }
}

function readText(path: string): string {
    return readFileSync(join(REPO_ROOT, path), 'utf8')
}

function readPackage(path: string): PackageJson {
    return JSON.parse(readText(path)) as PackageJson
}

function oneLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

function paragraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map(oneLine)
        .filter((p) => p.length > 0)
}

/** The lines of a `### Heading` section, up to the next heading. */
function section(text: string, heading: string): string[] {
    const lines = text.split('\n')
    const start = lines.findIndex((l) => l.trim() === heading)
    if (start < 0) return []
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((l) => /^#{1,3} /.test(l))
    return end < 0 ? rest : rest.slice(0, end)
}

describe('AGENTS.md', () => {
    test('has the armory planner paragraph right after the first one', () => {
        const paras = paragraphs(readText('AGENTS.md'))
        const first = paras.findIndex((p) =>
            p.startsWith('Turbo is a small addon')
        )
        expect(first).toBeGreaterThanOrEqual(0)
        expect(paras[first + 1]).toBe(
            'The repo also holds the **armory planner** (`packages/armory`), ' +
                'a web page that opens a results file the gear sim made ' +
                "offline and shows a character's gear, the sim's plan and " +
                'its numbers. It is separate from the addon and from the ' +
                'Turbo site, and nothing in it ships with the addon.'
        )
    })

    test('has a Where things live row for packages/armory/', () => {
        const rows = readText('AGENTS.md')
            .split('\n')
            .map((l) => oneLine(l))
        expect(rows).toContain(
            '| The armory planner (a web page; not the Turbo site). How to run it and the samples: its README | `packages/armory/`, `packages/armory/README.md` |'
        )
    })

    test('says every package is private, not both packages', () => {
        const text = oneLine(readText('AGENTS.md'))
        expect(text).not.toContain('both packages')
        expect(text).toContain('every package is `"private": true`')
    })
})

describe('CONTEXT.md', () => {
    const entries = [
        {
            term: 'Armory planner',
            definition:
                "The web page that opens a results file and shows one character's gear, the sim's plans and its numbers.",
            avoid: '_Avoid_: armory site, dashboard, web app',
        },
        {
            term: 'Results file',
            definition:
                'One versioned JSON file the gear sim writes for one character, which the armory planner reads.',
            avoid: "_Avoid_: report (that's the sim's Markdown), export",
        },
        {
            term: 'Plan',
            definition:
                'A gear set the sim made for one mix of damage, survival, healing and utility.',
            avoid: '_Avoid_: loadout, build (a build is talents)',
        },
        {
            term: 'Export addon',
            definition:
                'TurboCharExport, the addon that writes a character to a SavedVariables file with `/tbexport`. It is not Turbo and does not ship with it.',
            avoid: '_Avoid_: Turbo export',
        },
    ]

    test('has The armory planner section after The addon, with its four entries', () => {
        const text = readText('CONTEXT.md')
        const addonAt = text.indexOf('\n### The addon\n')
        const armoryAt = text.indexOf('\n### The armory planner\n')
        expect(addonAt).toBeGreaterThanOrEqual(0)
        expect(armoryAt).toBeGreaterThan(addonAt)

        const lines = section(text, '### The armory planner').map((l) =>
            l.trim()
        )
        for (const { term, definition, avoid } of entries) {
            const at = lines.indexOf(`**${term}**:`)
            expect(at).toBeGreaterThanOrEqual(0)
            expect(lines[at + 1]).toBe(definition)
            expect((lines[at + 2] ?? '').replace(/\.$/, '')).toBe(avoid)
        }
    })
})

describe('the @goturbo/armory package', () => {
    const wanted = [
        'react',
        'react-dom',
        'react-router',
        'zod',
        '@react-router/dev',
        '@cloudflare/vite-plugin',
        '@tailwindcss/vite',
        'tailwindcss',
        'vite',
        'wrangler',
        '@happy-dom/global-registrator',
        '@testing-library/react',
        '@testing-library/dom',
        '@testing-library/user-event',
        '@types/react',
        '@types/react-dom',
        '@types/node',
    ]

    test('is named @goturbo/armory, private, and takes every dependency from the catalog', () => {
        const pkg = readPackage('packages/armory/package.json')
        expect(pkg.name).toBe('@goturbo/armory')
        expect(pkg.private).toBe(true)

        const deps = { ...pkg.dependencies, ...pkg.devDependencies }
        for (const name of wanted) expect(Object.keys(deps)).toContain(name)

        const catalog = readPackage('package.json').workspaces?.catalog ?? {}
        for (const [name, version] of Object.entries(deps)) {
            // The repo's own packages come from the workspace.
            if (name.startsWith('@goturbo/')) {
                expect(`${name}@${version}`).toBe(`${name}@workspace:*`)
                continue
            }
            expect(`${name}@${version}`).toBe(`${name}@catalog:`)
            expect(Object.keys(catalog)).toContain(name)
        }
        expect(catalog['zod']).toMatch(/^[\^~]?4\./)
    })

    test('depends on @goturbo/sim from the workspace, takes its source in tsconfig.app.json with no project reference, and builds with vite-plugin-sim', () => {
        const pkg = readPackage('packages/armory/package.json')
        expect(pkg.dependencies?.['@goturbo/sim']).toBe('workspace:*')

        const tsconfig = (path: string) =>
            ts.parseConfigFileTextToJson(path, readText(path)).config as {
                include?: string[]
                references?: { path: string }[]
            }
        const app = tsconfig('packages/armory/tsconfig.app.json')
        expect(
            (app.include ?? []).some((p) => p.startsWith('../sim/src'))
        ).toBe(true)
        const references = [
            ...(app.references ?? []),
            ...(tsconfig('packages/armory/tsconfig.json').references ?? []),
        ]
        expect(references.filter((r) => r.path.includes('sim'))).toEqual([])

        const node = tsconfig('packages/armory/tsconfig.node.json')
        expect(node.include).toContain('vite-plugin-sim.ts')
        expect(readText('packages/armory/vite.config.ts')).toMatch(
            /from '\.\/vite-plugin-sim(\.ts)?'/
        )
    })

    test('the root package.json description names @goturbo/armory', () => {
        expect(readPackage('package.json').description).toContain(
            '@goturbo/armory'
        )
    })
})

describe('commit.config.ts', () => {
    test('has the scope armory', () => {
        expect(commitConfig.scopes).toContainEqual({
            value: 'armory',
            label: 'The armory planner',
        })
    })
})

describe('the root scripts', () => {
    const scripts = () => readPackage('package.json').scripts ?? {}

    test('test:armory is bun test --isolate packages/armory', () => {
        expect(scripts()['test:armory']).toBe(
            'bun test --isolate packages/armory'
        )
    })

    test('check:all runs test:armory', () => {
        expect(scripts()['check:all']).toContain('bun run test:armory')
    })

    test('dev, build and preview run the armory package scripts', () => {
        expect(scripts()['dev:armory']).toBe(
            'cd packages/armory && bun run dev'
        )
        expect(scripts()['build:armory']).toBe(
            'cd packages/armory && bun run build'
        )
        expect(scripts()['preview:armory']).toBe(
            'cd packages/armory && bun run preview'
        )
    })

    test('type-check runs type-check:armory', () => {
        expect(scripts()['type-check:armory']).toBeDefined()
        expect(scripts()['type-check']).toContain('bun run type-check:armory')
    })
})

describe('ESLint', () => {
    // `bun run lint` lints the files; this checks the .tsx files are among
    // them, which a passing lint run alone wouldn't show.
    test('takes the package .tsx files, with the Prettier rule on', async () => {
        const eslint = new ESLint({ cwd: REPO_ROOT })
        const file = join(REPO_ROOT, 'packages/armory/src/app.tsx')
        expect(await eslint.isPathIgnored(file)).toBe(false)
        const config = (await eslint.calculateConfigForFile(file)) as {
            rules?: Record<string, unknown>
        }
        expect(config.rules?.['prettier/prettier']).toBeDefined()
    })
})
