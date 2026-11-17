/**
 * `bun run sim:go`: the Go checks. `gofmt -l` over our own Go (the
 * `turbo_*.go` files beside upstream's WASM entry point) prints nothing,
 * `go vet` passes on `./sim/wasm/...` for the WASM target, and the
 * level-aware patch's packages pass `go test -tags with_db`. Upstream's
 * full Go test suite runs in its own CI job.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const UPSTREAM = join(import.meta.dir, '../upstream')
const WASM_ENTRY = 'sim/wasm'
const PATCHED_PACKAGES = ['./sim/core/spelldata', './sim/shaman']

function run(args: string[], env: Record<string, string> = {}): string {
    const result = Bun.spawnSync(args, {
        cwd: UPSTREAM,
        env: { ...process.env, ...env },
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const output = result.stdout.toString() + result.stderr.toString()
    if (result.exitCode !== 0) {
        console.error(output)
        console.error(`${args.slice(0, 2).join(' ')} failed.`)
        process.exit(1)
    }
    return output
}

// Our Go: the turbo_*.go exports, and the patch's per-call level profile.
const ours = [
    ...readdirSync(join(UPSTREAM, WASM_ENTRY))
        .filter((name) => name.startsWith('turbo_') && name.endsWith('.go'))
        .map((name) => `${WASM_ENTRY}/${name}`),
    'sim/core/level_profile.go',
    'sim/shaman/level_ranks.go',
    'sim/shaman/level_aware_test.go',
    'sim/shaman/level_60_test.go',
]
const unformatted = run(['gofmt', '-l', ...ours]).trim()
if (unformatted !== '') {
    console.error(`Not gofmt-formatted:\n${unformatted}`)
    process.exit(1)
}

run(['go', 'vet', '-tags', 'with_db', `./${WASM_ENTRY}/...`], {
    GOOS: 'js',
    GOARCH: 'wasm',
})

// The level-aware patch's tests, in the packages it touches whose tests read
// only vendored files (sim/core's own tests read ui/, which isn't vendored).
run(['go', 'test', '-tags', 'with_db', ...PATCHED_PACKAGES])
console.log('Go checks passed.')
