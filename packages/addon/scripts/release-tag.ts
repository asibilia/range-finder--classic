#!/usr/bin/env bun
/**
 * Tags HEAD `v<addon version>` unless that tag exists. The changesets
 * workflow runs it on `main` once no changesets are pending, i.e. right after
 * a Version PR merges, then pushes the tag and starts the release.
 *
 * In GitHub Actions it writes `tag` and `created` to the step's outputs.
 *
 * @example
 * ```bash
 * bun packages/addon/scripts/release-tag.ts
 * ```
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function git(repoDir: string, ...args: string[]) {
    return Bun.spawnSync(['git', ...args], {
        cwd: repoDir,
        stdout: 'pipe',
        stderr: 'pipe',
    })
}

/**
 * Tags HEAD with the addon's version.
 *
 * @param options.repoDir - the repo root
 * @returns the tag, and whether it was created now
 * @throws when git can't create the tag
 */
export function tagRelease(options: { repoDir: string }): {
    tag: string
    created: boolean
} {
    const { repoDir } = options
    const manifest = join(repoDir, 'packages/addon/package.json')
    const { version } = JSON.parse(readFileSync(manifest, 'utf8'))
    const tag = `v${version}`

    const ref = `refs/tags/${tag}`
    const exists = git(repoDir, 'rev-parse', '-q', '--verify', ref)
    if (exists.exitCode === 0) return { tag, created: false }

    const created = git(repoDir, 'tag', tag)
    if (created.exitCode !== 0) {
        throw new Error(`git tag ${tag}: ${created.stderr.toString()}`)
    }
    return { tag, created: true }
}

if (import.meta.main) {
    try {
        const { tag, created } = tagRelease({
            repoDir: resolve(import.meta.dir, '../../..'),
        })
        console.log(created ? `Tagged ${tag}` : `${tag} already exists`)
        if (process.env.GITHUB_OUTPUT) {
            appendFileSync(
                process.env.GITHUB_OUTPUT,
                `tag=${tag}\ncreated=${created}\n`
            )
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    }
}
