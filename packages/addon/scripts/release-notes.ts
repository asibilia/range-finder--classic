#!/usr/bin/env bun
/**
 * Prints the newest entry of a changesets changelog: the release notes for
 * the stores and the GitHub release. The release workflow writes them to the
 * packager's manual changelog before packaging.
 *
 * @example
 * ```bash
 * bun packages/addon/scripts/release-notes.ts packages/addon/CHANGELOG.md
 * ```
 */
import { readFileSync } from 'node:fs'

/**
 * The newest version's entry, without its `## <version>` heading.
 *
 * @param changelog - the changelog's Markdown
 * @throws when there is no version entry, or it's empty
 */
export function newestChangelogEntry(changelog: string): string {
    const lines = changelog.split('\n')
    const start = lines.findIndex((line) => line.startsWith('## '))
    if (start < 0) throw new Error('The changelog has no version entry')

    const next = lines.findIndex((line, i) => i > start && /^## /.test(line))
    const entry = lines
        .slice(start + 1, next < 0 ? undefined : next)
        .join('\n')
        .trim()
    if (!entry) throw new Error(`The changelog entry ${lines[start]} is empty`)
    return entry
}

if (import.meta.main) {
    const path = process.argv[2]
    if (!path) {
        console.error('Usage: bun release-notes.ts <CHANGELOG.md>')
        process.exit(1)
    }
    try {
        console.log(newestChangelogEntry(readFileSync(path, 'utf8')))
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
        process.exit(1)
    }
}
