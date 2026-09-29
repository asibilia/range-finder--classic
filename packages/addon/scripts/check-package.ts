#!/usr/bin/env bun
/**
 * Checks a zip the BigWigs packager built: every entry must be a file (or
 * folder) of the addon folder, under `Turbo/`, and the addon's TOC must be
 * there. Anything else means a monorepo file leaked into the package.
 *
 * CI runs it on the packaged zip before anything is uploaded.
 *
 * @example
 * ```bash
 * bun packages/addon/scripts/check-package.ts packages/addon/Turbo/.release/*.zip
 * ```
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** The shipped addon folder. */
export const TURBO_DIR = resolve(import.meta.dir, '../Turbo')

const END_OF_CENTRAL_DIR = 0x06054b50
const CENTRAL_ENTRY = 0x02014b50

/**
 * Lists a zip's entry names from its central directory.
 *
 * @param zip - the zip file's path
 * @throws when the file isn't a zip
 */
export function zipEntries(zip: string): string[] {
    const bytes = readFileSync(zip)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    let end = bytes.length - 22
    while (end >= 0 && view.getUint32(end, true) !== END_OF_CENTRAL_DIR) end--
    if (end < 0) throw new Error(`${zip} is not a zip file`)

    const count = view.getUint16(end + 10, true)
    let at = view.getUint32(end + 16, true)
    const names: string[] = []
    for (let i = 0; i < count; i++) {
        if (view.getUint32(at, true) !== CENTRAL_ENTRY) {
            throw new Error(`${zip} has a broken central directory`)
        }
        const nameLength = view.getUint16(at + 28, true)
        const extraLength = view.getUint16(at + 30, true)
        const commentLength = view.getUint16(at + 32, true)
        names.push(bytes.subarray(at + 46, at + 46 + nameLength).toString())
        at += 46 + nameLength + extraLength + commentLength
    }
    return names
}

function isKind(path: string, kind: 'file' | 'dir'): boolean {
    const stat = statSync(path, { throwIfNoEntry: false })
    return kind === 'file' ? !!stat?.isFile() : !!stat?.isDirectory()
}

/**
 * Finds what doesn't belong in a packaged zip.
 *
 * @param options.zip - the packaged zip
 * @param options.addonDir - the addon folder the zip must hold, and only it
 * @returns one problem per bad or missing entry, naming it; empty when clean
 */
export function checkPackage(options: {
    zip: string
    addonDir: string
}): string[] {
    const { zip, addonDir } = options
    const folder = basename(addonDir)
    const entries = zipEntries(zip)
    const problems: string[] = []

    for (const entry of entries) {
        const isDir = entry.endsWith('/')
        const parts = entry.split('/').filter(Boolean)
        const [top, ...rest] = parts
        const inAddon =
            top === folder &&
            !rest.includes('..') &&
            (isDir
                ? rest.length === 0 || isKind(join(addonDir, ...rest), 'dir')
                : rest.length > 0 && isKind(join(addonDir, ...rest), 'file'))
        if (!inAddon) {
            problems.push(`${entry} is not part of the ${folder} addon folder`)
        }
    }

    const tocs = readdirSync(addonDir).filter((f) => f.endsWith('.toc'))
    for (const toc of tocs) {
        if (!entries.includes(`${folder}/${toc}`)) {
            problems.push(`${folder}/${toc} is missing from the package`)
        }
    }
    return problems
}

if (import.meta.main) {
    const zips = process.argv.slice(2)
    if (zips.length === 0) {
        console.error('Usage: bun check-package.ts <zip>...')
        process.exit(1)
    }
    let failed = false
    for (const zip of zips) {
        const problems = checkPackage({ zip, addonDir: TURBO_DIR })
        if (problems.length === 0) {
            console.log(`${zip}: only the addon folder`)
            continue
        }
        failed = true
        console.error(`${zip}:`)
        for (const problem of problems) console.error(`  ${problem}`)
    }
    if (failed) process.exit(1)
}
