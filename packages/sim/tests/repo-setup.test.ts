/**
 * The sim package joins the repo: its vendored upstream (tracked, never
 * linted, type-checked or tested by the root runs), its fixtures, its
 * scripts, the root scripts and CI's Go steps. These read the repo's own
 * files as the contract.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESLint } from 'eslint'
import ts from 'typescript'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const UPSTREAM = 'packages/sim/upstream'

type PackageJson = {
    name?: string
    private?: boolean
    exports?: unknown
    scripts?: Record<string, string>
}
type Step = { uses?: string; run?: string; with?: Record<string, string> }
type Workflow = {
    jobs: Record<string, { steps: Step[]; defaults?: unknown }>
}

function readText(path: string): string {
    return readFileSync(join(REPO_ROOT, path), 'utf8')
}

function readJson<T>(path: string): T {
    return JSON.parse(readText(path)) as T
}

describe('the vendored upstream and the fixtures', () => {
    test('l60-test.in.json and l60-test.expected.json are in packages/sim/fixtures', () => {
        expect(existsSync(join(PACKAGE_DIR, 'fixtures/l60-test.in.json'))).toBe(
            true
        )
        expect(
            readJson<unknown>('packages/sim/fixtures/l60-test.expected.json')
        ).toEqual({ dps: 819.0224561454966 })
    })

    test('no vendored path is git-ignored', () => {
        for (const part of [
            'go.mod',
            'go.sum',
            'LICENSE',
            'sim',
            'proto',
            'assets/database',
            'ui/sim/talents/trees',
        ])
            expect(existsSync(join(REPO_ROOT, UPSTREAM, part))).toBe(true)

        const files = readdirSync(join(REPO_ROOT, UPSTREAM), {
            recursive: true,
            encoding: 'utf8',
        }).map((file) => `${UPSTREAM}/${file.split('\\').join('/')}`)
        expect(files.length).toBeGreaterThan(1000)
        const check = Bun.spawnSync(
            ['git', 'check-ignore', '--no-index', '--stdin'],
            {
                cwd: REPO_ROOT,
                stdin: new TextEncoder().encode(files.join('\n') + '\n'),
                stdout: 'pipe',
            }
        )
        expect(check.stdout.toString().trim()).toBe('')
    }, 60_000)
})

describe('bun run check and CI', () => {
    test('the package and root scripts build, vet and test the sim before any test needs it', () => {
        const sim = readJson<PackageJson>('packages/sim/package.json')
        expect(sim.name).toBe('@goturbo/sim')
        expect(sim.private).toBe(true)
        expect(JSON.stringify(sim.exports)).toContain('./src/index.ts')
        for (const name of ['sim:build', 'sim:go', 'sim:test'])
            expect(sim.scripts?.[name]).toBeDefined()

        const root = readJson<PackageJson>('package.json')
        for (const name of [
            'sim:build',
            'sim:go',
            'sim:test',
            'type-check:sim',
        ])
            expect(root.scripts?.[name]).toBeDefined()
        expect(root.scripts?.['sim:test']).toBe(
            'bun test --isolate packages/sim'
        )
        expect(root.scripts?.['check:all']).toBe(
            'bun run type-check && bun run lint && bun run syncpack:check && bun run sim:build && bun run sim:go && bun run sim:test && bun run test:armory'
        )

        const luca = readJson<{
            prepare: string
            checks: Record<string, string>
        }>('.luca/config.json')
        expect(luca.prepare).toBe('bun run tools:fetch && bun run sim:build')
        expect(luca.checks.lint).toEndWith('&& bun run sim:go')
    })

    test("CI sets up Go from upstream's go.mod before bun run check, and runs upstream's Go tests in a job", () => {
        const ci = Bun.YAML.parse(
            readText('.github/workflows/ci.yml')
        ) as Workflow
        const steps = ci.jobs.check!.steps
        const setupGo = steps.findIndex((s) =>
            s.uses?.startsWith('actions/setup-go@')
        )
        const check = steps.findIndex((s) => s.run?.trim() === 'bun run check')
        expect(setupGo).toBeGreaterThanOrEqual(0)
        expect(setupGo).toBeLessThan(check)
        expect(steps[setupGo]!.with).toMatchObject({
            'go-version-file': 'packages/sim/upstream/go.mod',
            'cache-dependency-path': 'packages/sim/upstream/go.sum',
        })

        const goTestJobs = Object.entries(ci.jobs).filter(
            ([name, job]) =>
                name !== 'check' &&
                job.steps.some((s) =>
                    /go test\b.*-tags with_db.*\.\/sim\/\.\.\./.test(
                        s.run ?? ''
                    )
                )
        )
        expect(goTestJobs.length).toBe(1)
        const [, job] = goTestJobs[0]!
        expect(
            job.steps.some((s) => s.uses?.startsWith('actions/setup-go@'))
        ).toBe(true)
    })
})

describe('what reads packages/sim/upstream', () => {
    test('ESLint and the root bun test skip it', async () => {
        const eslint = new ESLint({ cwd: REPO_ROOT })
        expect(
            await eslint.isPathIgnored(join(REPO_ROOT, UPSTREAM, 'ui/sim/x.ts'))
        ).toBe(true)
        expect(
            await eslint.isPathIgnored(join(PACKAGE_DIR, 'src/leak-scan.ts'))
        ).toBe(false)

        const bunfig = Bun.TOML.parse(readText('bunfig.toml')) as {
            test?: { pathIgnorePatterns?: string[] }
        }
        expect(bunfig.test?.pathIgnorePatterns).toContain(
            'packages/sim/upstream/**'
        )
    })

    test('ESLint lints the tracked worker script with worker globals', async () => {
        const eslint = new ESLint({ cwd: REPO_ROOT })
        const worker = join(PACKAGE_DIR, 'src/worker.js')
        expect(existsSync(worker)).toBe(true)
        expect(await eslint.isPathIgnored(worker)).toBe(false)
        const config = (await eslint.calculateConfigForFile(worker)) as {
            languageOptions?: { globals?: Record<string, unknown> }
        }
        const globals = Object.keys(config.languageOptions?.globals ?? {})
        expect(globals).toEqual(
            expect.arrayContaining(['self', 'importScripts', 'postMessage'])
        )
    })

    test('type-check:sim runs a composite tsconfig without upstream, in the root type-check', () => {
        const root = readJson<PackageJson>('package.json')
        expect(root.scripts?.['type-check']).toContain('bun run type-check:sim')
        expect(root.scripts?.['type-check:sim']).toContain('tsc -b')

        const tsconfig = ts.parseConfigFileTextToJson(
            'tsconfig.json',
            readText('packages/sim/tsconfig.json')
        ).config as {
            include?: string[]
            files?: string[]
            compilerOptions?: { composite?: boolean }
        }
        expect(tsconfig.compilerOptions?.composite).toBe(true)
        const covers = [...(tsconfig.include ?? []), ...(tsconfig.files ?? [])]
        expect(covers.length).toBeGreaterThan(0)
        for (const pattern of covers)
            expect(pattern.replace(/^\.\//, '')).not.toMatch(/^(upstream|\*)/)
    })
})
