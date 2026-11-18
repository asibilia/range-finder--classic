/**
 * The character art: the manifest (`public/art/art.json`) and its schema,
 * the lookup by race, class and gender, the picture behind the gear card,
 * and the footer's line on the art. The DOM helper must be the first import.
 */
import './dom'
import { openFile, variant } from './open-app'

import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, screen } from '@testing-library/react'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import manifestJson from '../public/art/art.json'
import {
    ART,
    type ArtEntry,
    artManifestSchema,
    characterArt,
    findArt,
} from '../src/character-art'
import sample from '../src/sample-truncha.json'

const PUBLIC_DIR = join(import.meta.dir, '../public')

const entry = (
    race: string,
    cls: string,
    gender: 'male' | 'female'
): ArtEntry => ({
    race,
    class: cls,
    gender,
    url: `/art/${race}-${cls}-${gender}.webp`.toLowerCase(),
    width: 1024,
    height: 1024,
    bytes: 40_000,
})

afterEach(() => {
    cleanup()
})

describe('the manifest', () => {
    test('the committed art.json reads, and each url is a file under public/ of its bytes', () => {
        const parsed = artManifestSchema.safeParse(manifestJson)
        expect(parsed.success).toBe(true)
        expect(ART.length).toBeGreaterThan(0)
        for (const art of ART) {
            const path = join(PUBLIC_DIR, art.url)
            expect({ url: art.url, exists: existsSync(path) }).toEqual({
                url: art.url,
                exists: true,
            })
            expect(statSync(path).size).toBe(art.bytes)
            expect(art.url).toBe(
                `/art/${art.race}-${art.class}-${art.gender}.webp`.toLowerCase()
            )
        }
    })

    test("the schema refuses a gender of 'other', a camelCase key, a missing size and an extra key", () => {
        const good = entry('Orc', 'Shaman', 'male')
        expect(artManifestSchema.safeParse([good]).success).toBe(true)
        const bad: unknown[] = [
            { ...good, gender: 'other' },
            { ...good, byteSize: 1 },
            (({ width: _width, ...rest }) => rest)(good),
            { ...good, pose: 'idle' },
            { ...good, url: 'art/orc.webp' },
            { ...good, height: 0 },
        ]
        for (const item of bad)
            expect(artManifestSchema.safeParse([item]).success).toBe(false)
    })
})

describe('the lookup', () => {
    const male = entry('Orc', 'Shaman', 'male')
    const female = entry('Orc', 'Shaman', 'female')
    const both = [male, female, entry('Troll', 'Shaman', 'female')]

    test('finds the exact gender', () => {
        expect(findArt(both, 'Orc', 'Shaman', 'male')).toBe(male)
        expect(findArt(both, 'Orc', 'Shaman', 'female')).toBe(female)
    })

    test('falls back to the other gender of the same pair', () => {
        expect(findArt([male], 'Orc', 'Shaman', 'female')).toBe(male)
        expect(findArt([female], 'Orc', 'Shaman', 'male')).toBe(female)
    })

    test('an unknown gender gets either picture of the pair', () => {
        expect(findArt([female], 'Orc', 'Shaman', undefined)).toBe(female)
        expect([male, female]).toContain(
            findArt(both, 'Orc', 'Shaman', undefined)!
        )
    })

    test('a pair with no picture gets null, whatever the gender', () => {
        expect(findArt(both, 'Troll', 'Shaman', 'male')?.gender).toBe('female')
        expect(findArt(both, 'Tauren', 'Shaman', 'male')).toBeNull()
        expect(findArt(both, 'Orc', 'Warrior', undefined)).toBeNull()
        expect(findArt([], 'Orc', 'Shaman', 'male')).toBeNull()
    })

    test('the committed manifest has the male Orc Shaman', () => {
        expect(characterArt('Orc', 'Shaman', 'male')?.url).toBe(
            '/art/orc-shaman-male.webp'
        )
    })
})

describe('the gear card', () => {
    test("the sample's Orc Shaman fills the card with the manifest's picture, at the manifest's size, decorative", async () => {
        await openFile(sample)
        const art = characterArt('Orc', 'Shaman', 'male')!
        const pane = document.querySelector('[data-slot="gear-pane"]')!
        const img = pane.querySelector('img[data-slot="character-art"]')
        expect(img).not.toBeNull()
        expect(img!.getAttribute('src')).toBe(art.url)
        expect(img!.getAttribute('width')).toBe(String(art.width))
        expect(img!.getAttribute('height')).toBe(String(art.height))
        expect(img!.getAttribute('alt')).toBe('')
        expect(img!.className).toContain('object-cover')
        expect(
            screen.getByText(/Character art is the owner.s own\./)
        ).toBeDefined()
        expect(screen.queryByText(/original placeholder/)).toBeNull()
    })

    test('with no gender in the file the Orc Shaman still has its picture', async () => {
        await openFile(
            variant((file) => {
                delete (file.character as Record<string, unknown>).gender
            })
        )
        expect(
            document.querySelector('img[data-slot="character-art"]')
        ).not.toBeNull()
    })

    test('a pair not in the manifest gets the plain card: no picture, and the footer keeps its placeholder line', async () => {
        await openFile(
            variant((file) => {
                ;(file.character as Record<string, unknown>).race = 'Tauren'
            })
        )
        expect(document.querySelector('[data-slot="gear-pane"] img')).toBeNull()
        expect(screen.queryByText(/owner.s own/)).toBeNull()
        expect(
            screen.getByText(/all art\s+here is original placeholder/)
        ).toBeDefined()
    })
})
