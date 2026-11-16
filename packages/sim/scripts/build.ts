/**
 * `bun run sim:build`: builds the vendored WoWSims to WASM into the
 * git-ignored `packages/sim/build/`:
 *
 * - `lib.wasm.gz`: `GOOS=js GOARCH=wasm go build -tags with_db -ldflags
 *   "-w -s" ./sim/wasm`, gzipped at level 9. Only the gzip ships: the raw
 *   module is over Cloudflare's 25 MiB limit per static asset.
 * - `wasm_exec.js`, copied from the same Go toolchain (it must match).
 * - The item data the TypeScript side reads, from `upstream/assets/database/`.
 */
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')
const UPSTREAM = join(PACKAGE_DIR, 'upstream')
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

const raw = join(BUILD, 'lib.wasm')
go(
    ['build', '-tags', 'with_db', '-ldflags', '-w -s', '-o', raw, './sim/wasm'],
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

const megabytes = (gzipped.length / 1024 / 1024).toFixed(1)
console.log(`Built packages/sim/build/lib.wasm.gz (${megabytes} MB).`)
