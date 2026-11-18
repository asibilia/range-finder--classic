/**
 * The character art: one picture per race, class and gender, behind the
 * gear card. The page reads only the manifest (`public/art/art.json`) and
 * follows each entry's `url`, so the pictures can move to a storage bucket
 * by changing the URLs (and `bun run art:add`'s target), with no page code
 * change. The manifest is imported at build time: no extra request.
 *
 * Add a picture with `bun run art:add <file> --race <Race> --class <Class>
 * --gender <male|female>`.
 */
import { z } from 'zod'

import manifestJson from '../public/art/art.json'

export const GENDERS = ['male', 'female'] as const
export type Gender = (typeof GENDERS)[number]

/**
 * One picture in the manifest. Keys are snake_case; `race` and `class` are
 * spelled as the results file spells them (`Orc`, `Shaman`).
 */
export const artEntrySchema = z.strictObject({
    race: z.string().min(1).meta({
        description: 'The race, as the results file spells it, e.g. Orc.',
    }),
    class: z.string().min(1).meta({
        description: 'The class, as the results file spells it, e.g. Shaman.',
    }),
    gender: z.enum(GENDERS),
    url: z
        .string()
        .regex(/^(\/|https:\/\/)/)
        .meta({
            description:
                'Where the picture is: a path on this site (/art/orc-shaman-male.webp) today, a bucket URL later.',
        }),
    width: z.int().positive().meta({ description: 'Width in pixels.' }),
    height: z.int().positive().meta({ description: 'Height in pixels.' }),
    bytes: z.int().positive().meta({ description: "The file's size." }),
})

export const artManifestSchema = z.array(artEntrySchema)

export type ArtEntry = z.infer<typeof artEntrySchema>
export type ArtManifest = z.infer<typeof artManifestSchema>

const parsed = artManifestSchema.safeParse(manifestJson)
if (!parsed.success)
    console.error('The art manifest is invalid:', parsed.error.issues)

/** The committed manifest, or none when it doesn't read. */
export const ART: ArtManifest = parsed.success ? parsed.data : []

/** A race or class name compared without case, spaces or dashes. */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The picture in `manifest` for a race, class and gender: that gender's,
 * else (that gender missing, or the gender unknown) the other gender's of
 * the same race and class, else null.
 *
 * @example
 * ```ts
 * findArt(ART, 'Orc', 'Shaman', 'female') // the male picture, if only it exists
 * findArt(ART, 'Gnome', 'Warlock', undefined) // null: no picture for the pair
 * ```
 */
export function findArt(
    manifest: ArtManifest,
    race: string,
    cls: string,
    gender: Gender | undefined
): ArtEntry | null {
    const pair = manifest.filter(
        (entry) =>
            key(entry.race) === key(race) && key(entry.class) === key(cls)
    )
    return (
        pair.find((entry) => entry.gender === gender) ??
        pair.find((entry) => entry.gender !== gender) ??
        null
    )
}

/** The committed manifest's picture for a race, class and gender, or null. */
export function characterArt(
    race: string,
    cls: string,
    gender: Gender | undefined
): ArtEntry | null {
    return findArt(ART, race, cls, gender)
}
