import { describe, expect, test } from 'bun:test'

import {
    decodeLayoutString,
    encodeCbor,
    encodeLayoutString,
    layoutStringToCbor,
    type LuaValue,
} from './codec'
import { Category, SHAMAN_COOLDOWNS } from './shaman-cooldowns'
import {
    buildTurboLayout,
    ESSENTIAL,
    finalCategory,
    LAYOUT_ID,
    LAYOUT_NAME,
    SHAMAN_SPEC_TAG,
    TRACKED_BUFFS,
    UTILITY,
} from './turbo-layout'

/** Exported from the live game (Forever 1.60.1.70790) by the owner. */
const OWNER_SAMPLE = '1|a2FtWCjh3tjQ6BdSVJqXnJGo4ASmAA=='

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')

/** Resolve a Lua table path the way the game's reader indexes it. */
const at = (value: LuaValue, ...keys: number[]): LuaValue =>
    keys.reduce<LuaValue>((v, k) => {
        if (Array.isArray(v)) return v[k - 1]
        if (v instanceof Map) return v.get(k)!
        throw new Error(`Not a table at key ${k}`)
    }, value)

describe("the owner's live-game sample", () => {
    test('decodes to [5, [], {71: [[]]}, ["Truncha Buncha"]]', () => {
        expect(hex(layoutStringToCbor(OWNER_SAMPLE))).toBe(
            '8405' +
                '80' +
                'a1184781' +
                '80' +
                '81' +
                '4e' +
                Buffer.from('Truncha Buncha').toString('hex')
        )
        expect(decodeLayoutString(OWNER_SAMPLE)).toEqual([
            5,
            [],
            new Map([[71, [[]]]]),
            ['Truncha Buncha'],
        ])
    })

    test('re-encodes to the same CBOR and the same string', () => {
        const decoded = decodeLayoutString(OWNER_SAMPLE)
        expect(hex(encodeCbor(decoded))).toBe(
            hex(layoutStringToCbor(OWNER_SAMPLE))
        )
        expect(encodeLayoutString(decoded)).toBe(OWNER_SAMPLE)
        expect(decodeLayoutString(encodeLayoutString(decoded))).toEqual(decoded)
    })
})

describe("Turbo's layout string", () => {
    const text = encodeLayoutString(buildTurboLayout())
    const data = decodeLayoutString(text)
    const layout = at(data, 3, SHAMAN_SPEC_TAG, LAYOUT_ID)
    const ids = (entries: { cooldownID: number }[]) =>
        entries.map((e) => e.cooldownID)

    test('has the save-format header the reader needs', () => {
        expect(text.startsWith('1|')).toBe(true)
        expect(at(data, 1)).toBe(5)
        expect(at(data, 2)).toEqual([])
        expect(at(data, 4, LAYOUT_ID)).toBe(LAYOUT_NAME)
    })

    test('uses the intended cooldownIDs, checked by name', () => {
        expect(ESSENTIAL.map((e) => e.name)).toEqual([
            'Stormstrike',
            'Earth Shock',
            'Chain Lightning',
        ])
        expect(ids(ESSENTIAL)).toEqual([200315, 200323, 200322])
        expect(UTILITY.map((e) => e.name)).toEqual([
            'Strength of Earth Totem',
            'Searing Totem',
            'Mana Spring Totem',
            'Windfury Totem',
        ])
        expect(ids(UTILITY)).toEqual([200484, 200367, 200488, 200485])
        expect(TRACKED_BUFFS.map((e) => e.name)).toEqual([
            'Lightning Shield',
            'Flurry',
        ])
        expect(ids(TRACKED_BUFFS)).toEqual([200311, 200321])
    })

    test('orders each shown category as intended', () => {
        const order = at(layout, 1) as number[]
        expect(new Set(order).size).toBe(SHAMAN_COOLDOWNS.length)
        const shown = (category: number) =>
            order.filter((id) =>
                (at(layout, 2, category) as number[]).includes(id)
            )
        expect(shown(Category.Essential)).toEqual(ids(ESSENTIAL))
        expect(shown(Category.Utility)).toEqual(ids(UTILITY))
        expect(shown(Category.TrackedBuff)).toEqual(ids(TRACKED_BUFFS))
        expect(at(layout, 2, Category.TrackedBar)).toBeUndefined()
    })

    test('hides everything else in the right "Not Displayed" bucket', () => {
        const chosen = [...ESSENTIAL, ...UTILITY, ...TRACKED_BUFFS]
        const rest = SHAMAN_COOLDOWNS.filter((e) => !chosen.includes(e))
        rest.forEach((e) =>
            expect(finalCategory(e)).toBe(
                e.category === Category.TrackedBuff
                    ? Category.HiddenPassive
                    : Category.HiddenActive
            )
        )
        const hidden = [
            ...(at(layout, 2, Category.HiddenActive) as number[]),
            ...(at(layout, 2, Category.HiddenPassive) as number[]),
        ]
        expect(hidden.sort()).toEqual(ids(rest).sort())
    })

    test('alerts on Lightning Shield removal with text to speech', () => {
        // { Sound = 1, OnAuraRemoved = 6, TextToSpeech = 0 }
        expect(at(layout, 3)).toEqual(new Map([[200311, [[1, 6, 0]]]]))
    })

    test('writes keyed tables as CBOR maps with integer keys', () => {
        const cbor = hex(layoutStringToCbor(text))
        expect(cbor.startsWith('8405' + '80' + 'a1' + '1847' + '81')).toBe(true)
        expect(at(data, 3)).toBeInstanceOf(Map)
        expect(at(layout, 2)).toBeInstanceOf(Map)
        expect(at(layout, 3)).toBeInstanceOf(Map)
    })

    test('writes the name as a byte string, like the game', () => {
        const cbor = hex(layoutStringToCbor(text))
        expect(cbor.endsWith('81' + '45' + hex(Buffer.from('Turbo')))).toBe(
            true
        )
    })
})
