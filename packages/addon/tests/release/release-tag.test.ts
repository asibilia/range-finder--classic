/**
 * Tagging a release: after the Version PR merges, a workflow step tags the
 * merged commit `v<addon version>`, and that tag starts the packager. A beta
 * version gives a beta tag, which the packager publishes as a pre-release.
 *
 * `tagRelease({ repoDir })` reads `packages/addon/package.json` in that repo
 * and creates the tag at HEAD unless it already exists.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { tagRelease } from '../../scripts/release-tag'

let scratch: string | undefined

afterEach(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    scratch = undefined
})

function git(repo: string, ...args: string[]): string {
    const result = Bun.spawnSync(['git', ...args], {
        cwd: repo,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`)
    }
    return result.stdout.toString().trim()
}

/** Commits the addon's package.json at the given version. */
function commitVersion(repo: string, version: string): string {
    mkdirSync(join(repo, 'packages/addon'), { recursive: true })
    writeFileSync(
        join(repo, 'packages/addon/package.json'),
        JSON.stringify({ name: '@goturbo/addon', version }, null, 2)
    )
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', `chore: version ${version}`)
    return git(repo, 'rev-parse', 'HEAD')
}

/** A fresh git repo whose addon is at the given version. */
function repoAt(version: string): string {
    scratch = mkdtempSync(join(tmpdir(), 'turbo-release-tag-'))
    git(scratch, 'init', '-q')
    git(scratch, 'config', 'user.name', 'Turbo crew')
    git(scratch, 'config', 'user.email', 'crew@goturbo.gg')
    git(scratch, 'config', 'commit.gpgsign', 'false')
    git(scratch, 'config', 'tag.gpgsign', 'false')
    commitVersion(scratch, version)
    return scratch
}

describe('tagRelease', () => {
    test("tags the merged commit v<addon version>, not changesets' package@version form", () => {
        const repo = repoAt('0.1.0-beta.0')

        const result = tagRelease({ repoDir: repo })

        expect(result).toEqual({ tag: 'v0.1.0-beta.0', created: true })
        expect(git(repo, 'tag', '--list')).toBe('v0.1.0-beta.0')
        expect(git(repo, 'rev-list', '-n', '1', 'v0.1.0-beta.0')).toBe(
            git(repo, 'rev-parse', 'HEAD')
        )
    })

    test('a beta version gets a beta tag, which the packager publishes as a pre-release', () => {
        const repo = repoAt('0.0.1-beta.3')

        const { tag } = tagRelease({ repoDir: repo })

        expect(tag).toBe('v0.0.1-beta.3')
        expect(tag).toContain('beta')
    })

    test('does nothing when that version is already tagged, so later pushes to main never re-release it', () => {
        const repo = repoAt('0.1.0-beta.0')
        tagRelease({ repoDir: repo })

        const again = tagRelease({ repoDir: repo })

        expect(again).toEqual({ tag: 'v0.1.0-beta.0', created: false })
        expect(git(repo, 'tag', '--list')).toBe('v0.1.0-beta.0')
    })

    test('the next merged Version PR gets its own tag, and the old tag stays on its commit', () => {
        const repo = repoAt('0.1.0-beta.0')
        const first = git(repo, 'rev-parse', 'HEAD')
        tagRelease({ repoDir: repo })
        const second = commitVersion(repo, '0.1.0-beta.1')

        const result = tagRelease({ repoDir: repo })

        expect(result).toEqual({ tag: 'v0.1.0-beta.1', created: true })
        expect(git(repo, 'rev-list', '-n', '1', 'v0.1.0-beta.0')).toBe(first)
        expect(git(repo, 'rev-list', '-n', '1', 'v0.1.0-beta.1')).toBe(second)
    })
})
