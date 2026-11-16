/**
 * `bun run sim:go`: the Go checks. `gofmt -l` over our own Go (the
 * `turbo_*.go` files beside upstream's WASM entry point) prints nothing,
 * and `go vet` passes on `./sim/wasm/...` for the WASM target. Upstream's
 * full Go test suite runs in its own CI job.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const UPSTREAM = join(import.meta.dir, '../upstream')
const WASM_ENTRY = 'sim/wasm'

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

const ours = readdirSync(join(UPSTREAM, WASM_ENTRY))
    .filter((name) => name.startsWith('turbo_') && name.endsWith('.go'))
    .map((name) => `${WASM_ENTRY}/${name}`)
if (ours.length > 0) {
    const unformatted = run(['gofmt', '-l', ...ours]).trim()
    if (unformatted !== '') {
        console.error(`Not gofmt-formatted:\n${unformatted}`)
        process.exit(1)
    }
}

run(['go', 'vet', '-tags', 'with_db', `./${WASM_ENTRY}/...`], {
    GOOS: 'js',
    GOARCH: 'wasm',
})
console.log('Go checks passed.')
