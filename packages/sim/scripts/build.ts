/**
 * `bun run sim:build`: builds the vendored WoWSims to WASM into the
 * git-ignored `packages/sim/build/`:
 *
 * - `lib.wasm.gz`: `GOOS=js GOARCH=wasm go build -trimpath -tags with_db
 *   -ldflags "-w -s" ./sim/wasm`, gzipped at level 9. Only the gzip ships:
 *   the raw module is over Cloudflare's 25 MiB limit per static asset.
 *   `-trimpath` keeps the build machine's folders out of the module (Go
 *   records every source file's path, even with `-w -s`).
 * - `wasm_exec.js`, copied from the same Go toolchain (it must match).
 * - The item data the TypeScript side reads, from `upstream/assets/database/`.
 * - `buffs.json`, the stats of the buffs in the vendored spell data
 *   (`write-buffs.ts`).
 * - `worker.js`, the pool's worker (from `src/`), `talents/<class>.json`
 *   (upstream's talent trees), `l60-test.in.json` (the level-60 gate's
 *   request) and `weights/` (from `packages/sim/weights/`, when it exists).
 * - `version.json`: `{ upstream_commit, patch_id, go_version, l60_expected_dps }`.
 *   The commit (from `UPSTREAM.md`, its one place) and `patch_id` are also
 *   compiled in (`-X main.upstreamCommit`, `-X main.patchID`), so
 *   `turboVersion()` names the code the module was built from.
 */
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { patchId, UPSTREAM, upstreamCommit } from './pin'
import { writeBuffs } from './write-buffs'

const PACKAGE_DIR = join(import.meta.dir, '..')
const BUILD = join(PACKAGE_DIR, 'build')
const ITEM_DATA = ['db.json', 'leftover_db.json', 'item_first_seen.json']

function go(args: string[], env: Record<string, string> = {}): string {
    const result = Bun.spawnSync(['go', ...args], {
        cwd: UPSTREAM,
        env: { ...process.env, ...env },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    if (result.exitCode !== 0) {
        console.error(result.stderr.toString())
        console.error(`go ${args[0]} failed.`)
        process.exit(1)
    }
    return result.stdout.toString()
}

mkdirSync(BUILD, { recursive: true })

const commit = upstreamCommit()
const patch = patchId()
const raw = join(BUILD, 'lib.wasm')
go(
    [
        'build',
        '-trimpath',
        '-tags',
        'with_db',
        '-ldflags',
        `-w -s -X main.upstreamCommit=${commit} -X main.patchID=${patch}`,
        '-o',
        raw,
        './sim/wasm',
    ],
    { GOOS: 'js', GOARCH: 'wasm' }
)
const gzipped = Bun.gzipSync(new Uint8Array(readFileSync(raw)), { level: 9 })
writeFileSync(join(BUILD, 'lib.wasm.gz'), gzipped)
rmSync(raw)

const goroot = go(['env', 'GOROOT']).trim()
const wasmExec = ['lib/wasm/wasm_exec.js', 'misc/wasm/wasm_exec.js']
    .map((path) => join(goroot, path))
    .find((path) => existsSync(path))
if (!wasmExec) {
    console.error('wasm_exec.js is not in this Go toolchain.')
    process.exit(1)
}
// The toolchain's files are read-only, and a copy keeps the mode: write
// the contents into a fresh file instead.
rmSync(join(BUILD, 'wasm_exec.js'), { force: true })
writeFileSync(join(BUILD, 'wasm_exec.js'), readFileSync(wasmExec))

for (const name of ITEM_DATA)
    copyFileSync(join(UPSTREAM, 'assets/database', name), join(BUILD, name))

// The pool's worker, a plain script beside the module, so no bundler
// rewrites its URL.
copyFileSync(join(PACKAGE_DIR, 'src/worker.js'), join(BUILD, 'worker.js'))

// The buffs the sheet check can model, from the vendored spell data.
writeBuffs(BUILD)

// The talent trees and the level-60 gate's request, for pool.data().
cpSync(join(UPSTREAM, 'ui/sim/talents/trees'), join(BUILD, 'talents'), {
    recursive: true,
})
copyFileSync(
    join(PACKAGE_DIR, 'fixtures/l60-test.in.json'),
    join(BUILD, 'l60-test.in.json')
)

// The precomputed stat weights, when there are any.
rmSync(join(BUILD, 'weights'), { recursive: true, force: true })
if (existsSync(join(PACKAGE_DIR, 'weights')))
    cpSync(join(PACKAGE_DIR, 'weights'), join(BUILD, 'weights'), {
        recursive: true,
    })

const expected = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'fixtures/l60-test.expected.json'), 'utf8')
) as { dps: number }
const version = {
    upstream_commit: commit,
    patch_id: patch,
    go_version: go(['env', 'GOVERSION']).trim(),
    l60_expected_dps: expected.dps,
}
writeFileSync(
    join(BUILD, 'version.json'),
    JSON.stringify(version, null, 2) + '\n'
)

const megabytes = (gzipped.length / 1024 / 1024).toFixed(1)
console.log(`Built packages/sim/build/lib.wasm.gz (${megabytes} MB).`)
