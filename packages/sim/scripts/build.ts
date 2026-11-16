/**
 * `bun run sim:build`: builds the vendored WoWSims to WASM into the
 * git-ignored `packages/sim/build/`:
 *
 * - `lib.wasm.gz`: `GOOS=js GOARCH=wasm go build -tags with_db -ldflags
 *   "-w -s" ./sim/wasm`, gzipped at level 9. Only the gzip ships: the raw
 *   module is over Cloudflare's 25 MiB limit per static asset.
 * - `wasm_exec.js`, copied from the same Go toolchain (it must match).
 * - The item data the TypeScript side reads, from `upstream/assets/database/`.
 * - `version.json`: `{ upstream_commit, patch_id, go_version, l60_expected_dps }`.
 *   `patch_id` is also compiled in (`-X main.patchID`), so `turboVersion()`
 *   names the Go the module was built from.
 */
import { createHash } from 'node:crypto'
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')
const UPSTREAM = join(PACKAGE_DIR, 'upstream')
const BUILD = join(PACKAGE_DIR, 'build')
const ITEM_DATA = ['db.json', 'leftover_db.json', 'item_first_seen.json']
const UPSTREAM_COMMIT = '47205c966132ef52b5d12cef97dac6ebe017190c'

/** Every file under `dir` whose name ends in one of `extensions`. */
function filesUnder(dir: string, extensions: string[]): string[] {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter(
            (entry) =>
                entry.isFile() &&
                extensions.some((ext) => entry.name.endsWith(ext))
        )
        .map((entry) => join(entry.parentPath, entry.name))
}

/**
 * The first 12 hex digits of a SHA-256 over every `.go` and `.proto` file
 * under `upstream/sim` and `upstream/proto`, sorted by path: each file's
 * path (relative to `upstream/`, with `/`), a NUL byte, then its contents.
 */
function patchId(): string {
    const paths = ['sim', 'proto']
        .flatMap((dir) => filesUnder(join(UPSTREAM, dir), ['.go', '.proto']))
        .map((path) => relative(UPSTREAM, path).split(sep).join('/'))
        .sort()
    const hash = createHash('sha256')
    for (const path of paths) {
        hash.update(path)
        hash.update('\0')
        hash.update(readFileSync(join(UPSTREAM, path)))
    }
    return hash.digest('hex').slice(0, 12)
}

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

const patch = patchId()
const raw = join(BUILD, 'lib.wasm')
go(
    [
        'build',
        '-tags',
        'with_db',
        '-ldflags',
        `-w -s -X main.patchID=${patch}`,
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

const expected = JSON.parse(
    readFileSync(join(PACKAGE_DIR, 'fixtures/l60-test.expected.json'), 'utf8')
) as { dps: number }
const version = {
    upstream_commit: UPSTREAM_COMMIT,
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
