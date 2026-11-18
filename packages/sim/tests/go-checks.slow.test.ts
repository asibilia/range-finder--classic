/**
 * `bun run sim:go`, part of `bun run check`: gofmt over our own Go beside
 * upstream's WASM entry point, go vet, and the patched packages' Go tests.
 * The level profile now travels with each call, so the patch's start-up
 * read (an environment variable and a file) is gone.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const UPSTREAM = join(PACKAGE_DIR, 'upstream')

describe('sim:go', () => {
    test('passes, with our turbo_*.go exports and no start-up level read left in the Go', () => {
        const ours = readdirSync(join(UPSTREAM, 'sim/wasm')).filter(
            (name) => name.startsWith('turbo_') && name.endsWith('.go')
        )
        expect(ours.length).toBeGreaterThan(0)

        const profileGo = readFileSync(
            join(UPSTREAM, 'sim/core/level_profile.go'),
            'utf8'
        )
        expect(profileGo).not.toContain('WOWSIMS_LEVEL')
        expect(profileGo).not.toContain('os.Getenv')
        expect(profileGo).not.toContain('os.ReadFile')

        const result = Bun.spawnSync([process.execPath, 'run', 'sim:go'], {
            cwd: REPO_ROOT,
            stdout: 'pipe',
            stderr: 'pipe',
        })
        if (result.exitCode !== 0) {
            console.error(result.stdout.toString() + result.stderr.toString())
        }
        expect(result.exitCode).toBe(0)
    }, 600_000)
})
