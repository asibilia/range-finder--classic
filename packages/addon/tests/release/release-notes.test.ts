/**
 * Release notes: the newest entry of the addon's changesets changelog becomes
 * the store changelog and the GitHub release body.
 *
 * `newestChangelogEntry(changelog)` returns that entry;
 * `bun packages/addon/scripts/release-notes.ts <CHANGELOG.md>` prints it.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { newestChangelogEntry } from '../../scripts/release-notes'

const SCRIPT = join(import.meta.dir, '../../scripts/release-notes.ts')

const CHANGELOG = `# @goturbo/addon

## 0.1.0-beta.1

### Patch Changes

- [#40](https://github.com/asibilia/range-finder--classic/pull/40) [\`abc1234\`](https://github.com/asibilia/range-finder--classic/commit/abc1234) Thanks [@asibilia](https://github.com/asibilia)! - The swing timer greys out during hard casts.
- [#41](https://github.com/asibilia/range-finder--classic/pull/41) [\`def5678\`](https://github.com/asibilia/range-finder--classic/commit/def5678) Thanks [@asibilia](https://github.com/asibilia)! - Totem slots pulse in their last five seconds.

## 0.1.0-beta.0

### Minor Changes

- [#27](https://github.com/asibilia/range-finder--classic/pull/27) [\`0a1b2c3\`](https://github.com/asibilia/range-finder--classic/commit/0a1b2c3) Thanks [@asibilia](https://github.com/asibilia)! - Turbo loads on Forever with an empty HUD card.
`

let scratch: string | undefined

afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = undefined
})

describe('newestChangelogEntry', () => {
    test("returns every change in the newest version's entry", () => {
        const notes = newestChangelogEntry(CHANGELOG)

        expect(notes).toContain('### Patch Changes')
        expect(notes).toContain('The swing timer greys out during hard casts.')
        expect(notes).toContain('Totem slots pulse in their last five seconds.')
    })

    test('leaves out older entries and the package title', () => {
        const notes = newestChangelogEntry(CHANGELOG)

        expect(notes).not.toContain('Turbo loads on Forever')
        expect(notes).not.toContain('0.1.0-beta.0')
        expect(notes).not.toContain('### Minor Changes')
        expect(notes).not.toContain('# @goturbo/addon')
    })

    test('returns the whole entry when the changelog has only one', () => {
        const only = `# @goturbo/addon

## 0.0.1-beta.0

### Patch Changes

- 1234567: The first beta release.
`
        expect(newestChangelogEntry(only)).toContain('The first beta release.')
    })

    test('fails when the changelog has no version entry, rather than publish empty notes', () => {
        expect(() => newestChangelogEntry('# @goturbo/addon\n')).toThrow()
    })
})

describe('bun packages/addon/scripts/release-notes.ts', () => {
    test("prints the newest entry of the changelog it's given", () => {
        scratch = mkdtempSync(join(tmpdir(), 'turbo-release-notes-'))
        const path = join(scratch, 'CHANGELOG.md')
        writeFileSync(path, CHANGELOG)

        const result = Bun.spawnSync(['bun', SCRIPT, path], {
            stdout: 'pipe',
            stderr: 'pipe',
        })
        const stdout = result.stdout.toString()

        expect(result.exitCode, result.stderr.toString()).toBe(0)
        expect(stdout).toContain('The swing timer greys out during hard casts.')
        expect(stdout).not.toContain('Turbo loads on Forever')
    })
})
