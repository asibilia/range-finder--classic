/**
 * Worn and bag items the sim's item data lacks never stop the run (the
 * runner's `bonusStats` on `Character`, `wearing()` in `emit.ts` and
 * `ITEM_MOD_TO_STAT` in `export.ts`): a worn one is left out of the
 * request's equipment and its game stats become bonus stats, a bag one is
 * compared by its game stats, and an unknown main hand is a clear stop.
 * Checked from outside: the character an export reads into, the requests
 * the pool is sent, the plan and the stop's words.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
    createSimPool,
    sheetFromSim,
    STAT,
    type RaidSimRequest,
    type SimPool,
} from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import {
    testcharCharacter,
    type TestcharCharacter,
} from '../../sim/tests/helpers/testchar'
import { buildRequest, simExport, type Character } from '../src/browser-sim'
import { exportCharacter } from '../src/browser-sim/export-reader'
import type { DbItem, ItemDb } from '../src/browser-sim/gear'
import { planMaxDamage } from '../src/browser-sim/plan'
import { bonusFor, STAT_STEPS } from '../src/browser-sim/weights'
import { stopLines } from '../src/components/bring-in'
import { SLOTS, type Stat } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'

const BASE = pathToFileURL(join(import.meta.dir, '../../sim/build') + '/')

/** An item id in neither `db.json` nor `leftover_db.json`. */
const MADE_UP = 999_999_101
/** The made-up main hand of the stop. */
const UNKNOWN_MAIN_HAND = 999_999
/** Where the sim's equipment list keeps the legs. */
const LEGS = SLOTS.indexOf('legs')

beforeAll(() => ensureSimBuild(), 600_000)

const pools: SimPool[] = []
function pool(): SimPool {
    const made = createSimPool({ base: BASE })
    pools.push(made)
    return made
}
afterAll(() => {
    for (const made of pools.splice(0)) made.close()
})

let testcharMemo: Promise<TestcharCharacter> | undefined
function testchar(): Promise<TestcharCharacter> {
    testcharMemo ??= testcharCharacter(pool())
    return testcharMemo
}

/** A pool that reads data files and counts, but refuses, sims and sheets. */
function dataOnly(real: SimPool, calls: { sim: number; sheet: number }) {
    return {
        ...real,
        size: real.size,
        sim: () => {
            calls.sim += 1
            return Promise.reject(new Error('no sim expected'))
        },
        sheet: () => {
            calls.sheet += 1
            return Promise.reject(new Error('no sheet expected'))
        },
    } satisfies SimPool
}

/** A pool that keeps every sim and sheet request it passes on. */
function logging(real: SimPool, requests: RaidSimRequest[]): SimPool {
    return {
        ...real,
        size: real.size,
        sim: (request, profile) => {
            requests.push(request)
            return real.sim(request, profile)
        },
        sheet: (request, profile) => {
            requests.push(request)
            return real.sheet(request, profile)
        },
    }
}

/** The export with `stats` (game keys) added to the gear record of `id`. */
function withGameStats(
    text: string,
    id: number,
    stats: Record<string, number>
): string {
    const field = `["id"] = ${id},`
    expect(text.split(field)).toHaveLength(2)
    const lines = Object.entries(stats)
        .map(([key, value]) => `["${key}"] = ${value},`)
        .join('\n')
    return text.replace(field, `${field}\n["stats"] = {\n${lines}\n},`)
}

type Player = {
    name: string
    equipment: { items: { id?: number }[] }
    bonusStats?: { stats?: number[] }
}

function playerOf(request: RaidSimRequest): Player {
    const raid = request.raid as unknown as {
        parties: { players: Player[] }[]
    }
    return raid.parties[0]!.players[0]!
}

const itemIds = (request: RaidSimRequest) =>
    playerOf(request).equipment.items.map((item) => item.id)
const bonusStrength = (request: RaidSimRequest) =>
    playerOf(request).bonusStats?.stats?.[STAT.strength] ?? 0

/** Testchar wearing the made-up item (+10 Strength) in the legs. */
async function madeUpLegsExport(sheetPool: SimPool): Promise<string> {
    const plain = await testchar()
    const character = {
        ...plain,
        bags: [],
        gear: { ...plain.gear, legs: { id: MADE_UP } },
    }
    // The game's sheet: Testchar without the legs, plus 10 Strength.
    const strength = new Array<number>(40).fill(0)
    strength[STAT.strength] = 10
    const sheet = sheetFromSim(
        await sheetPool.sheet(
            buildRequest(
                { ...plain, bags: [], gear: { ...plain.gear, legs: null } },
                'dungeon-long',
                { seed: 23, iterations: 4000, bonusStats: { stats: strength } }
            ),
            plain.profile
        )
    )
    return withGameStats(exportFromCharacter(character, sheet), MADE_UP, {
        ITEM_MOD_STRENGTH_SHORT: 10,
    })
}

describe('a worn item the sim lacks', () => {
    test('an export wearing a made-up legs id with ITEM_MOD_STRENGTH_SHORT 10 reads into a character without that id and with bonus_stats of +10 Strength, and its request has no such item and +10 Strength, merged with a per-sim bonus', async () => {
        const real = pool()
        const read = await exportCharacter(
            await madeUpLegsExport(real),
            dataOnly(real, { sim: 0, sheet: 0 })
        )
        expect(read.kind).toBe('character')
        if (read.kind !== 'character') throw new Error(`a ${read.kind} stop`)
        const character = read.character

        const worn = Object.values(character.gear).map((piece) => piece?.id)
        expect(worn).not.toContain(MADE_UP)
        expect(character.bonus_stats).toHaveLength(40)
        expect(character.bonus_stats![STAT.strength]).toBe(10)

        const request = buildRequest(character, 'dungeon-long', {
            seed: 23,
            iterations: 10,
        })
        expect(itemIds(request)).not.toContain(MADE_UP)
        expect(bonusStrength(request)).toBe(10)

        // A per-sim bonus (the weights and sanity sims) adds to it.
        const raised = buildRequest(character, 'dungeon-long', {
            seed: 23,
            iterations: 10,
            bonusStats: bonusFor('strength', 20),
        })
        expect(bonusStrength(raised)).toBe(30)
    }, 600_000)

    test('simExport on that export gives a file; no request carries the made-up id, worn-gear requests carry +10 Strength, and the plan replacing the legs sims without it', async () => {
        const real = pool()
        const text = await madeUpLegsExport(real)
        const requests: RaidSimRequest[] = []
        const outcome = await simExport(text, logging(real, requests), () => {})
        expect(outcome.kind).toBe('file')
        if (outcome.kind !== 'file') throw new Error(`a ${outcome.kind} stop`)

        for (const request of requests)
            expect(itemIds(request)).not.toContain(MADE_UP)

        const testcharRequests = requests.filter(
            (request) => playerOf(request).name === 'Testchar'
        )
        const wornGear = testcharRequests.filter(
            (request) => itemIds(request)[LEGS] === undefined
        )
        expect(wornGear.length).toBeGreaterThan(0)
        for (const request of wornGear)
            expect(bonusStrength(request)).toBeGreaterThanOrEqual(10)

        const planLegs = outcome.file.plans[0]!.gear.legs
        expect(planLegs).not.toBeNull()
        expect(planLegs).not.toBe(MADE_UP)
        const planRequests = testcharRequests.filter(
            (request) => itemIds(request)[LEGS] === planLegs
        )
        expect(planRequests.length).toBeGreaterThan(0)
        for (const request of planRequests)
            expect(bonusStrength(request)).toBe(0)
    }, 600_000)
})

describe('an unknown main hand', () => {
    test('an export whose main hand is item 999999 returns the unknown_main_hand stop for 999999 and makes no sim or sheet call', async () => {
        const plain = await testchar()
        const text = exportFromCharacter(
            {
                ...plain,
                bags: [],
                gear: { ...plain.gear, main_hand: { id: UNKNOWN_MAIN_HAND } },
            },
            plain.sheet
        )
        const calls = { sim: 0, sheet: 0 }
        const outcome = await simExport(text, dataOnly(pool(), calls), () => {})
        expect(outcome).toEqual({
            kind: 'unknown_main_hand',
            item_id: UNKNOWN_MAIN_HAND,
        })
        expect(calls).toEqual({ sim: 0, sheet: 0 })
    }, 600_000)

    test("the page words the unknown_main_hand stop for 999999 as The sim doesn't know your main-hand weapon (item 999999).", () => {
        expect(
            stopLines({ kind: 'unknown_main_hand', item_id: UNKNOWN_MAIN_HAND })
        ).toEqual(["The sim doesn't know your main-hand weapon (item 999999)."])
    })
})

/** Every weighed stat worth 1 EP. */
const EP = new Map<Stat, number>(STAT_STEPS.map((step) => [step.stat, 1]))

function syntheticDb(items: DbItem[]): ItemDb {
    return {
        items: new Map(items.map((item) => [item.id, item])),
        firstSeen: new Map(),
    }
}

describe('a bag item the sim lacks', () => {
    test("a bag helm the sim lacks, 20 EP by its game stats over a worn 5 EP helm, is in bag_upgrades for the head at +15 EP with the game's name; one worth less than the worn helm is not", () => {
        const wornHelm: DbItem = {
            id: 70_101,
            name: 'Worn Helm',
            type: 1,
            armorType: 2,
            quality: 2,
            reqLvl: 20,
            sources: [{ drop: { otherName: 'Some Boss' } }],
            scalingOptions: { '0': { stats: { '0': 5 }, ilvl: 25 } },
        }
        const bagItem = (
            id: number,
            name: string,
            stats: Record<string, number>
        ) => ({
            id,
            name,
            quality: 2,
            item_level: 30,
            required_level: 25,
            equip_loc: 'INVTYPE_HEAD',
            stats,
        })
        const character = {
            name: 'Levelling',
            level: 30,
            race: 'Orc',
            class: 'Shaman',
            talents: '',
            gear: { head: { id: wornHelm.id } },
            bags: [
                bagItem(999_999_201, 'Odd Helm', {
                    ITEM_MOD_STRENGTH_SHORT: 12,
                    ITEM_MOD_AGILITY_SHORT: 8,
                }),
                bagItem(999_999_202, 'Weak Helm', {
                    ITEM_MOD_STRENGTH_SHORT: 2,
                }),
            ],
            imbue: null,
            known_spells: [],
            export_saved_at: '2026-11-16T00:00:00Z',
            game_build: '1.15.8',
        } as unknown as Character

        const plan = planMaxDamage(
            character,
            syntheticDb([wornHelm]),
            EP,
            new Map()
        )
        const upgrades = plan.bag_upgrades.map((upgrade) => ({
            slot: upgrade.slot,
            item_id: upgrade.item.item_id,
            name: upgrade.item.name,
            gain_ep: upgrade.gain_ep,
        }))
        expect(upgrades).toContainEqual({
            slot: 'head',
            item_id: 999_999_201,
            name: 'Odd Helm',
            gain_ep: 15,
        })
        expect(upgrades.map((upgrade) => upgrade.item_id)).not.toContain(
            999_999_202
        )
    })
})
