/**
 * What names a sim build: the upstream commit vendored in `upstream/` and
 * the patch id of the Go on top. The commit's one place is `UPSTREAM.md`'s
 * table. `sim:build` compiles both into the module (`turboVersion()`) and
 * writes them to `build/version.json`. The tests' `ensureSimBuild` builds
 * again when they no longer match.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const PACKAGE_DIR = join(import.meta.dir, '..')

/** The vendored WoWSims. */
export const UPSTREAM = join(PACKAGE_DIR, 'upstream')

/** `UPSTREAM.md`'s Commit row: the full hash, in backticks. */
const COMMIT_ROW = /^\| Commit \| `([0-9a-f]{40})` \|$/m

/** The upstream commit vendored in `upstream/`, from `UPSTREAM.md`. */
export function upstreamCommit(): string {
    const doc = readFileSync(join(PACKAGE_DIR, 'UPSTREAM.md'), 'utf8')
    const commit = COMMIT_ROW.exec(doc)?.[1]
    if (!commit)
        throw new Error(
            "UPSTREAM.md's table has no Commit row with a full commit hash."
        )
    return commit
}

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
export function patchId(): string {
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
