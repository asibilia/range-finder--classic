/**
 * A missing required level means 60 (the runner's `reqOf` in `gear.ts`:
 * "the data leaves reqLvl out when it is 60"). Checked from outside the
 * plan: `planMaxDamage` on a character and item data, read through the
 * results file's slots, plan, bag upgrades and left-out items.
 */
import { beforeAll, describe, expect, test } from 'bun:test'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import type { Stat } from '../src/results-file'
import type { Character } from '../src/browser-sim/character'
import {
    loadItemDb,
    slotsFor,
    type DbItem,
    type ItemDb,
} from '../src/browser-sim/gear'
import { planMaxDamage } from '../src/browser-sim/plan'
import { STAT_STEPS } from '../src/browser-sim/weights'
import { recordedPool } from './helpers/recorded-pool'
import { syntheticDb } from './helpers/synthetic-db'

/** Every weighed stat worth 1 EP: any item with stats is a gain. */
const EP = new Map<Stat, number>(STAT_STEPS.map((step) => [step.stat, 1]))

function shaman(level: number): Character {
    return {
        name: 'Levelling',
        level,
        race: 'Orc',
        class: 'Shaman',
        talents: '',
        gear: {},
        bags: [],
        imbue: null,
        known_spells: [],
        export_saved_at: '2026-11-16T00:00:00Z',
        game_build: '1.15.8',
    } as unknown as Character
}

/** The build's item data, read the way the page reads it. */
function realDb(): Promise<ItemDb> {
    return loadItemDb(recordedPool())
}

/** A leather helm with plenty of stats, dropped by a boss unless overridden. */
function helm(id: number, extra: Partial<DbItem> = {}): DbItem {
    return {
        id,
        name: `Helm ${id}`,
        type: 1,
        armorType: 2,
        quality: 4,
        sources: [{ drop: { otherName: 'Some Boss' } }],
        scalingOptions: {
            '0': { stats: { '0': 40, '1': 40, '2': 40, '3': 40 }, ilvl: 63 },
        },
        ...extra,
    }
}

beforeAll(() => ensureSimBuild(), 600_000)

describe('a missing required level means 60', () => {
    test("for a level-30 character, no db.json item without reqLvl is in the plan's gear, a slot's alternatives or the bag upgrades", async () => {
        const db = await realDb()
        const character = shaman(30)
        const noReq = [...db.items.values()].filter(
            (item) =>
                item.reqLvl === undefined &&
                (item.scalingOptions?.['0']?.ilvl ?? 0) > 45 &&
                slotsFor(character, item).length > 0
        )
        // The data really has such items, or the test proves nothing.
        expect(noReq.length).toBeGreaterThan(0)
        const noReqIds = new Set(noReq.map((item) => item.id))
        // As the export has them: the game says these need level 60.
        character.bags = noReq.slice(0, 20).map((item) => ({
            id: item.id,
            name: item.name,
            quality: item.quality ?? 1,
            item_level: item.scalingOptions?.['0']?.ilvl ?? 0,
            required_level: 60,
            equip_loc: '',
            stats: {},
        }))

        // Every weapon is "simmed" with a gain, so main_hand is ranked too.
        const weaponGains = new Map<number, number>(
            [...db.items.keys()].map((id) => [id, 10])
        )
        const plan = planMaxDamage(character, db, EP, weaponGains)

        for (const id of Object.values(plan.plan.gear))
            if (id !== null) expect(noReqIds.has(id)).toBe(false)
        for (const piece of Object.values(plan.gear))
            if (piece) expect(noReqIds.has(piece.id)).toBe(false)
        for (const slot of plan.slots)
            for (const alternative of slot.alternatives) {
                expect(noReqIds.has(alternative.item.item_id)).toBe(false)
                expect(alternative.item.required_level).toBeLessThanOrEqual(35)
            }
        for (const upgrade of plan.bag_upgrades)
            expect(noReqIds.has(upgrade.item.item_id)).toBe(false)
    }, 600_000)

    test('for a level-56 character, an item without reqLvl listed as an alternative has required_level 60 and is not planned', () => {
        const item = helm(70_001)
        const plan = planMaxDamage(
            shaman(56),
            syntheticDb([item]),
            EP,
            new Map()
        )
        const head = plan.slots.find((slot) => slot.slot === 'head')!
        const listed = head.alternatives.find(
            (alternative) => alternative.item.item_id === item.id
        )
        expect(listed).toBeDefined()
        expect(listed!.item.required_level).toBe(60)
        expect(plan.plan.gear.head).toBeNull()
    })

    test('an item with no source and reqLvl 1 is in left_out_items; one with no source and no reqLvl is not', () => {
        const levelOne = helm(70_011, { sources: undefined, reqLvl: 1 })
        const noReq = helm(70_012, { sources: undefined })
        const plan = planMaxDamage(
            shaman(56),
            syntheticDb([levelOne, noReq]),
            EP,
            new Map()
        )
        const leftOut = plan.left_out_items.map((item) => item.item_id)
        expect(leftOut).toContain(levelOne.id)
        expect(leftOut).not.toContain(noReq.id)
        const head = plan.slots.find((slot) => slot.slot === 'head')!
        expect(
            head.alternatives.map((alternative) => alternative.item.item_id)
        ).toContain(noReq.id)
    })
})
