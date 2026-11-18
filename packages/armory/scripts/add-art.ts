/**
 * Adds a character picture (`bun run art:add <file> --race <Race> --class
 * <Class> --gender <male|female>` at the repo root): resizes it to 1024 px
 * wide WebP at quality 78 with `cwebp`, names it
 * `<race>-<class>-<gender>.webp` (lower-case kebab), puts it where
 * `ART_TARGET` says, and writes its entry (url, width, height, bytes) into
 * the manifest, `packages/armory/public/art/art.json`, replacing any entry
 * for the same race, class and gender.
 *
 * `ART_TARGET` is the one setting: today the repo's own folder, served at
 * `/art/`. Moving to a storage bucket means a new target (its base URL and
 * an upload step here) and the bucket's host on the build guard's list; the
 * page only follows each entry's `url`.
 *
 * @example
 * ```sh
 * bun run art:add ~/Pictures/orc.png --race Orc --class Shaman --gender male
 * ```
 */
import { $ } from 'bun'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import { artManifestSchema, type ArtEntry, GENDERS } from '../src/character-art'

/** Where pictures go and the URL they're served at. */
const ART_TARGET = {
    dir: join(import.meta.dir, '../public/art'),
    base_url: '/art/',
} as const
const MANIFEST = join(import.meta.dir, '../public/art/art.json')
const WIDTH = 1024
const QUALITY = 78

/** `Night Elf` or `NightElf` as `night-elf`. */
export function kebab(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

/** `orc` or `Orc` as `Orc`: each word's first letter upper-case. */
function titled(name: string): string {
    return name.trim().replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

/** A WebP file's width and height, from its header (VP8, VP8L or VP8X). */
export function webpSize(bytes: Uint8Array): { width: number; height: number } {
    const text = (from: number, to: number) =>
        String.fromCharCode(...bytes.subarray(from, to))
    if (text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP')
        throw new Error('not a WebP file')
    const chunk = text(12, 16)
    if (chunk === 'VP8 ')
        return {
            width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
            height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
        }
    if (chunk === 'VP8L') {
        const bits =
            bytes[21]! |
            (bytes[22]! << 8) |
            (bytes[23]! << 16) |
            (bytes[24]! << 24)
        return {
            width: (bits & 0x3fff) + 1,
            height: ((bits >>> 14) & 0x3fff) + 1,
        }
    }
    if (chunk === 'VP8X')
        return {
            width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
            height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
        }
    throw new Error(`unknown WebP chunk ${chunk}`)
}

async function main() {
    const { values, positionals } = parseArgs({
        args: process.argv.slice(2),
        options: {
            race: { type: 'string' },
            class: { type: 'string' },
            gender: { type: 'string' },
        },
        allowPositionals: true,
    })
    const [source] = positionals
    const gender = GENDERS.find((g) => g === values.gender)
    if (!source || !values.race || !values.class || !gender) {
        console.error(
            'Usage: bun run art:add <file> --race <Race> --class <Class> --gender <male|female>'
        )
        process.exit(1)
    }
    if (!Bun.which('cwebp')) {
        console.error(
            'art:add needs cwebp (the WebP encoder) on the PATH: on macOS, `brew install webp`.'
        )
        process.exit(1)
    }

    const race = titled(values.race)
    const cls = titled(values.class)
    const name = `${kebab(race)}-${kebab(cls)}-${gender}.webp`
    const work = mkdtempSync(join(tmpdir(), 'art-add-'))
    try {
        const out = join(work, name)
        await $`cwebp -quiet -q ${QUALITY} -resize ${WIDTH} 0 -metadata none ${resolve(source)} -o ${out}`
        const bytes = new Uint8Array(await Bun.file(out).arrayBuffer())
        const { width, height } = webpSize(bytes)

        mkdirSync(ART_TARGET.dir, { recursive: true })
        await Bun.write(join(ART_TARGET.dir, name), bytes)

        const entry: ArtEntry = {
            race,
            class: cls,
            gender,
            url: `${ART_TARGET.base_url}${name}`,
            width,
            height,
            bytes: bytes.length,
        }
        const file = Bun.file(MANIFEST)
        const manifest = artManifestSchema.parse(
            (await file.exists()) ? await file.json() : []
        )
        const kept = manifest.filter(
            (other) =>
                !(
                    kebab(other.race) === kebab(race) &&
                    kebab(other.class) === kebab(cls) &&
                    other.gender === gender
                )
        )
        const next = [...kept, entry].sort((a, b) =>
            `${a.race} ${a.class} ${a.gender}`.localeCompare(
                `${b.race} ${b.class} ${b.gender}`
            )
        )
        await Bun.write(MANIFEST, JSON.stringify(next, null, 2) + '\n')
        console.log(
            `${entry.url}: ${width}×${height}, ${(bytes.length / 1024).toFixed(1)} KB`
        )
    } finally {
        rmSync(work, { recursive: true, force: true })
    }
}

if (import.meta.main) await main()
