/**
 * `bun run sim:build` builds vendored WoWSims to WASM: a gzip of the module
 * and Go's own `wasm_exec.js`, in the git-ignored `packages/sim/build/`.
 * This runs the build once, loads the module under Bun and runs upstream's
 * level-60 test request through its `raidSimJson`.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'

import { ensureSimBuild } from './helpers/sim-build'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const BUILD_DIR = join(PACKAGE_DIR, 'build')
const WASM_GZ = join(BUILD_DIR, 'lib.wasm.gz')
const WASM_EXEC = join(BUILD_DIR, 'wasm_exec.js')
const L60_REQUEST = join(PACKAGE_DIR, 'fixtures/l60-test.in.json')
const L60_DPS = 819.0224561454966
/** Cloudflare's limit per static asset. */
const MAX_ASSET_BYTES = 25 * 1024 * 1024
/** The leak guard's home-path pattern (spec section 7). */
const HOME_PATH = /(\/Users\/|\/home\/|[A-Za-z]:[\\/]Users[\\/])[^/\\\s]+/
/** Everyday names the leak guard skips (CI's user is `runner`). */
const COMMON_NAMES = ['runner', 'root', 'user', 'admin', 'ubuntu', 'localhost']

/** `name` as a whole word, ignoring case, as the leak guard matches it. */
function wholeWord(name: string): RegExp {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'i')
}

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

// This file is about the build itself: it always builds, and a failed
// build fails every test here, with the build's output.
beforeAll(() => ensureSimBuild({ always: true }), 600_000)

describe('sim:build', () => {
    test('writes lib.wasm.gz under 25 MiB and wasm_exec.js, which git ignores', () => {
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

    test('lib.wasm.gz holds no home path and no user or host name of the machine that built it', () => {
        const wasm = Buffer.from(
            Bun.gunzipSync(new Uint8Array(readFileSync(WASM_GZ)))
        ).toString('latin1')
        // Only the kind is reported, never the matched value.
        const found: string[] = []
        if (HOME_PATH.test(wasm)) found.push('home path')
        const names: [string, string][] = [
            ['user name', userInfo().username],
            ['host name', hostname()],
        ]
        for (const [kind, name] of names) {
            if (name.length < 4 || COMMON_NAMES.includes(name.toLowerCase()))
                continue
            if (wholeWord(name).test(wasm)) found.push(kind)
        }
        expect(found).toEqual([])
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
        // protojson with EmitUnpopulated writes an unset error as null.
        expect(result.error ?? null).toBeNull()
        const dps = result.raidMetrics.parties[0]!.players[0]!.dps.avg
        expect(Math.abs(dps - L60_DPS) / L60_DPS).toBeLessThanOrEqual(1e-9)
    }, 120_000)
})
