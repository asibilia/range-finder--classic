/**
 * `bun run sim:build` builds vendored WoWSims to WASM: a gzip of the module
 * and Go's own `wasm_exec.js`, in the git-ignored `packages/sim/build/`.
 * This runs the build once, loads the module under Bun and runs upstream's
 * level-60 test request through its `raidSimJson`.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const BUILD_DIR = join(PACKAGE_DIR, 'build')
const WASM_GZ = join(BUILD_DIR, 'lib.wasm.gz')
const WASM_EXEC = join(BUILD_DIR, 'wasm_exec.js')
const L60_REQUEST = join(PACKAGE_DIR, 'fixtures/l60-test.in.json')
const L60_DPS = 819.0224561454966
/** Cloudflare's limit per static asset. */
const MAX_ASSET_BYTES = 25 * 1024 * 1024

type GoRuntime = {
    importObject: WebAssembly.Imports
    run(instance: WebAssembly.Instance): Promise<void>
}
type SimGlobals = {
    Go: new () => GoRuntime
    raidSimJson: (request: string) => string
}
type RaidSimResult = {
    error?: unknown
    raidMetrics: { parties: { players: { dps: { avg: number } }[] }[] }
}

let buildExitCode: number | null = null
let buildOutput = ''

beforeAll(() => {
    const result = Bun.spawnSync([process.execPath, 'run', 'sim:build'], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    buildExitCode = result.exitCode
    buildOutput = result.stdout.toString() + result.stderr.toString()
}, 600_000)

describe('sim:build', () => {
    test('writes lib.wasm.gz under 25 MiB and wasm_exec.js, which git ignores', () => {
        if (buildExitCode !== 0) console.error(buildOutput)
        expect(buildExitCode).toBe(0)
        expect(existsSync(WASM_GZ)).toBe(true)
        expect(existsSync(WASM_EXEC)).toBe(true)
        expect(statSync(WASM_GZ).size).toBeLessThan(MAX_ASSET_BYTES)

        for (const path of [
            'packages/sim/build/lib.wasm.gz',
            'packages/sim/build/wasm_exec.js',
        ]) {
            const ignored = Bun.spawnSync(['git', 'check-ignore', '-q', path], {
                cwd: REPO_ROOT,
            })
            expect(ignored.exitCode).toBe(0)
        }
    })

    test("wasm_exec.js is the Go toolchain's own", () => {
        const goroot = Bun.spawnSync(['go', 'env', 'GOROOT'], {
            cwd: join(PACKAGE_DIR, 'upstream'),
            stdout: 'pipe',
        })
            .stdout.toString()
            .trim()
        expect(goroot.length).toBeGreaterThan(0)
        const original = ['lib/wasm/wasm_exec.js', 'misc/wasm/wasm_exec.js']
            .map((path) => join(goroot, path))
            .find((path) => existsSync(path))
        expect(original).toBeDefined()
        expect(readFileSync(WASM_EXEC, 'utf8')).toBe(
            readFileSync(original!, 'utf8')
        )
    })
})

describe('the WASM module under Bun', () => {
    test("raidSimJson gives upstream's level-60 DPS within 1e-9 relative", async () => {
        await import(WASM_EXEC)
        const sims = globalThis as unknown as SimGlobals
        const go = new sims.Go()
        const wasm = Bun.gunzipSync(new Uint8Array(readFileSync(WASM_GZ)))
        const { instance } = await WebAssembly.instantiate(
            wasm,
            go.importObject
        )
        void go.run(instance)
        await Promise.resolve()
        expect(typeof sims.raidSimJson).toBe('function')

        const reply = sims.raidSimJson(readFileSync(L60_REQUEST, 'utf8'))
        expect(typeof reply).toBe('string')
        const result = JSON.parse(reply) as RaidSimResult
        expect(result.error).toBeUndefined()
        const dps = result.raidMetrics.parties[0]!.players[0]!.dps.avg
        expect(Math.abs(dps - L60_DPS) / L60_DPS).toBeLessThanOrEqual(1e-9)
    }, 120_000)
})
