/**
 * `ensureSimBuild`: the tests that read `packages/sim/build/` build it
 * first when they need to (Luca's checks don't run `sim:build`). It builds
 * when a file a test reads is missing, or when the build's `version.json`
 * names other Go or another upstream commit than the repo holds, and
 * always with `always`. A failed build prints its output and throws.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { patchId, upstreamCommit } from '../../scripts/pin'

const PACKAGE_DIR = join(import.meta.dir, '../..')
const REPO_ROOT = join(PACKAGE_DIR, '../..')
const BUILD = join(PACKAGE_DIR, 'build')

/** Files every build has; `sim:build` writes `version.json` last. */
const BUILT = [
    'lib.wasm.gz',
    'wasm_exec.js',
    'worker.js',
    'db.json',
    'buffs.json',
    'l60-test.in.json',
    'version.json',
]

/** True when the build's `version.json` names the repo's Go and commit. */
function current(): boolean {
    try {
        const version = JSON.parse(
            readFileSync(join(BUILD, 'version.json'), 'utf8')
        ) as { upstream_commit?: unknown; patch_id?: unknown }
        return (
            version.patch_id === patchId() &&
            version.upstream_commit === upstreamCommit()
        )
    } catch {
        return false
    }
}

/**
 * Runs `bun run sim:build` unless the build is there and current.
 *
 * @param options.always - Build even when the build is current.
 * @param options.needs - Files under `build/` the test reads, besides
 * those every build has (for example `weights/<file>`).
 */
export function ensureSimBuild(
    options: { always?: boolean; needs?: string[] } = {}
): void {
    const needs = [...BUILT, ...(options.needs ?? [])]
    if (
        !options.always &&
        needs.every((name) => existsSync(join(BUILD, name))) &&
        current()
    )
        return
    const build = Bun.spawnSync([process.execPath, 'run', 'sim:build'], {
        cwd: REPO_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    if (build.exitCode !== 0) {
        console.error(build.stdout.toString() + build.stderr.toString())
        throw new Error('bun run sim:build failed')
    }
}
