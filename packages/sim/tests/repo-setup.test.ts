/**
 * The sim package joins the repo: its vendored upstream (tracked, never
 * linted, type-checked or tested by the root runs), its fixtures, its
 * scripts, the root scripts and CI's Go steps. These read the repo's own
 * files as the contract.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative } from 'node:path'
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

const SLOW_RUN =
    "bun test --isolate --path-ignore-patterns='.tools/**' --path-ignore-patterns='.claude/**' --path-ignore-patterns='packages/sim/upstream/**'"

/** The committed test limits (spec #119, section 3). */
const TEST_LIMITS = {
    test_case_timeout_ms: 2000,
    test_timeout_ms: 900000,
    test_concurrency: 1,
    prepare_concurrency: 1,
    'checks.slow_test': [
        {
            run: `${SLOW_RUN} .slow.test`,
            file_patterns: ['**/*.slow.test.ts'],
            run_files: `${SLOW_RUN} {files}`,
        },
    ],
    'test:armory': 'bun test --isolate --timeout=2000 packages/armory',
    'sim:test': 'bun test --isolate --timeout=2000 packages/sim',
    'test:slow': `${SLOW_RUN} .slow.test`,
    'check:all':
        'bun run type-check && bun run lint && bun run syncpack:check && bun run sim:build && bun run sim:go && bun run sim:test && bun run test:armory && bun run test:slow',
    'bunfig.toml pathIgnorePatterns': [
        '.tools/**',
        '.claude/**',
        'packages/sim/upstream/**',
        '**/*.slow.test.ts',
    ],
}

const CONFIG_LIMITS = [
    'test_case_timeout_ms',
    'test_timeout_ms',
    'test_concurrency',
    'prepare_concurrency',
] as const
const SCRIPT_LIMITS = [
    'test:armory',
    'sim:test',
    'test:slow',
    'check:all',
] as const

/**
 * Checks the test limits that keep a test run inside its time and memory
 * budget: Luca's config, the root scripts and bunfig.toml's ignore list.
 *
 * @param config - the parsed `.luca/config.json`
 * @param scripts - the root `package.json` scripts
 * @param bunfigText - the text of `bunfig.toml`
 * @returns the name of each value that is missing or different, in the
 *     order `test_case_timeout_ms`, `test_timeout_ms`, `test_concurrency`,
 *     `prepare_concurrency`, `checks.slow_test`, `test:armory`, `sim:test`,
 *     `test:slow`, `check:all`, `bunfig.toml pathIgnorePatterns`; `[]` when
 *     all hold
 *
 * @example
 * checkTestLimits({ ...config, test_concurrency: 4 }, scripts, bunfigText)
 * // ['test_concurrency']
 */
export function checkTestLimits(
    config: unknown,
    scripts: Record<string, string>,
    bunfigText: string
): string[] {
    const record = (value: unknown): Record<string, unknown> =>
        typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)
            : {}
    const same = (a: unknown, b: unknown) => Bun.deepEquals(a, b, true)
    const luca = record(config)
    const problems: string[] = CONFIG_LIMITS.filter(
        (name) => !same(luca[name], TEST_LIMITS[name])
    )
    if (!same(record(luca.checks).slow_test, TEST_LIMITS['checks.slow_test']))
        problems.push('checks.slow_test')
    for (const name of SCRIPT_LIMITS)
        if (scripts[name] !== TEST_LIMITS[name]) problems.push(name)

    let ignore: unknown
    try {
        ignore = record(
            record(Bun.TOML.parse(bunfigText)).test
        ).pathIgnorePatterns
    } catch {
        ignore = undefined
    }
    if (!same(ignore, TEST_LIMITS['bunfig.toml pathIgnorePatterns']))
        problems.push('bunfig.toml pathIgnorePatterns')
    return problems
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
    })
})

describe('bun run check and CI', () => {
    test('the package and root scripts build, vet and test the sim before any test needs it, sim:test with a 2000 ms limit and check:all ending in test:slow', () => {
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
            'bun test --isolate --timeout=2000 packages/sim'
        )
        expect(sim.scripts?.['sim:test']).toBe('bun run --cwd ../.. sim:test')
        expect(root.scripts?.['check:all']).toBe(
            'bun run type-check && bun run lint && bun run syncpack:check && bun run sim:build && bun run sim:go && bun run sim:test && bun run test:armory && bun run test:slow'
        )

        const luca = readJson<{
            prepare: string
            checks: Record<string, string> & {
                slow_test?: {
                    run: string
                    file_patterns: string[]
                    run_files: string
                }[]
            }
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

describe("the package's entry", () => {
    test('@goturbo/sim points at src/index.ts, and nothing it reaches imports a Node or Bun built-in, so the page can import it', () => {
        const sim = readJson<PackageJson>('packages/sim/package.json')
        const exported = sim.exports as string | Record<string, string>
        expect(typeof exported === 'string' ? exported : exported['.']).toBe(
            './src/index.ts'
        )

        const builtins = new Set(builtinModules)
        const isBuiltin = (specifier: string) =>
            specifier.startsWith('node:') ||
            specifier === 'bun' ||
            specifier.startsWith('bun:') ||
            builtins.has(specifier) ||
            builtins.has(specifier.split('/')[0]!)
        const isFile = (path: string) =>
            existsSync(path) && statSync(path).isFile()

        const reached = new Set<string>()
        const serverOnly: string[] = []
        const walk = (file: string) => {
            if (reached.has(file)) return
            reached.add(file)
            const { importedFiles } = ts.preProcessFile(
                readFileSync(file, 'utf8'),
                true,
                true
            )
            for (const { fileName } of importedFiles) {
                if (fileName.startsWith('.')) {
                    const base = join(dirname(file), fileName)
                    const next = [
                        `${base}.ts`,
                        `${base}.tsx`,
                        join(base, 'index.ts'),
                        base,
                    ].find(isFile)
                    expect(next).toBeDefined()
                    walk(next!)
                } else if (isBuiltin(fileName)) {
                    serverOnly.push(
                        `${relative(PACKAGE_DIR, file)} imports ${fileName}`
                    )
                }
            }
        }
        walk(join(PACKAGE_DIR, 'src/index.ts'))
        expect(reached.size).toBeGreaterThan(1)
        expect(serverOnly).toEqual([])
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

describe('checkTestLimits', () => {
    const config = () => readJson<Record<string, unknown>>('.luca/config.json')
    const scripts = () => readJson<PackageJson>('package.json').scripts ?? {}
    const bunfigText = () => readText('bunfig.toml')

    test("the repo's Luca config, root scripts and bunfig.toml hold every limit", () => {
        expect(checkTestLimits(config(), scripts(), bunfigText())).toEqual([])
    })

    test('a config without test_concurrency gives ["test_concurrency"]', () => {
        const { test_concurrency: _dropped, ...rest } = config()
        expect(checkTestLimits(rest, scripts(), bunfigText())).toEqual([
            'test_concurrency',
        ])
    })

    test('test_case_timeout_ms 5000 gives ["test_case_timeout_ms"]', () => {
        expect(
            checkTestLimits(
                { ...config(), test_case_timeout_ms: 5000 },
                scripts(),
                bunfigText()
            )
        ).toEqual(['test_case_timeout_ms'])
    })

    test('a check:all without bun run test:slow gives ["check:all"]', () => {
        const all = scripts()
        expect(
            checkTestLimits(
                config(),
                {
                    ...all,
                    'check:all': all['check:all']!.replace(
                        ' && bun run test:slow',
                        ''
                    ),
                },
                bunfigText()
            )
        ).toEqual(['check:all'])
    })

    test('a bunfig.toml without **/*.slow.test.ts gives ["bunfig.toml pathIgnorePatterns"]', () => {
        const text = bunfigText().replace(', "**/*.slow.test.ts"', '')
        expect(text).not.toContain('**/*.slow.test.ts')
        expect(checkTestLimits(config(), scripts(), text)).toEqual([
            'bunfig.toml pathIgnorePatterns',
        ])
    })
})
