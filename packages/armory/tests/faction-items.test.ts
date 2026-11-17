/**
 * No item of the other faction (the runner's faction rule in `gear.ts`,
 * both ways): a Horde race drops `factionRestriction: 1` (Alliance only), an
 * Alliance race drops `factionRestriction: 2` (Horde only), and a race
 * outside the table keeps both. Checked from outside the plan:
 * `planMaxDamage` on a character and item data, read through the slots'
 * alternatives, the plan and the bag upgrades.
 */
import { describe, expect, test } from 'bun:test'

import type { Stat } from '../src/results-file'
import type { Character } from '../src/browser-sim/character'
import type { DbItem, ItemDb } from '../src/browser-sim/gear'
import { planMaxDamage } from '../src/browser-sim/plan'
import { STAT_STEPS } from '../src/browser-sim/weights'

/** Every weighed stat worth 1 EP: any item with stats is a gain. */
const EP = new Map<Stat, number>(STAT_STEPS.map((step) => [step.stat, 1]))

const ALLIANCE_ONLY = 1
const HORDE_ONLY = 2

/** An item of `type` with `power` in each of four stats, from a boss. */
function item(
    id: number,
    type: number,
    power: number,
    factionRestriction?: number
): DbItem {
    return {
        id,
        name: `Item ${id}`,
        type,
        armorType: type === 1 ? 2 : 0,
        quality: 4,
        reqLvl: 50,
        sources: [{ drop: { otherName: 'Some Boss' } }],
        scalingOptions: {
            '0': {
                stats: { '0': power, '1': power, '2': power, '3': power },
                ilvl: 60,
            },
        },
        ...(factionRestriction === undefined ? {} : { factionRestriction }),
    } as DbItem
}

// Helms: the faction ones beat the neutral one, so they'd be planned.
const ALLIANCE_HELM = item(71_001, 1, 60, ALLIANCE_ONLY)
const HORDE_HELM = item(71_002, 1, 60, HORDE_ONLY)
const NEUTRAL_HELM = item(71_003, 1, 30)
// Necks, carried in the bags.
const ALLIANCE_NECK = item(71_011, 2, 50, ALLIANCE_ONLY)
const HORDE_NECK = item(71_012, 2, 50, HORDE_ONLY)

const DB: ItemDb = {
    items: new Map(
        [
            ALLIANCE_HELM,
            HORDE_HELM,
            NEUTRAL_HELM,
            ALLIANCE_NECK,
            HORDE_NECK,
        ].map((entry) => [entry.id, entry])
    ),
    firstSeen: new Map(),
}

function shaman(race: string): Character {
    return {
        name: 'Faction',
        level: 55,
        race,
        class: 'Shaman',
        talents: '',
        gear: {},
        bags: [ALLIANCE_NECK, HORDE_NECK].map((neck) => ({
            id: neck.id,
            name: neck.name,
            quality: 4,
            item_level: 60,
            required_level: 50,
            equip_loc: 'INVTYPE_NECK',
            stats: {},
        })),
        imbue: null,
        known_spells: [],
        export_saved_at: '2026-11-16T00:00:00Z',
        game_build: '1.15.8',
    } as unknown as Character
}

/** The item ids the plan shows: alternatives, planned gear, bag upgrades. */
function shown(race: string) {
    const plan = planMaxDamage(shaman(race), DB, EP, new Map())
    return {
        alternatives: new Set(
            plan.slots.flatMap((slot) =>
                slot.alternatives.map((alternative) => alternative.item.item_id)
            )
        ),
        planned: new Set(
            [
                ...Object.values(plan.plan.gear),
                ...Object.values(plan.gear).map((piece) => piece?.id ?? null),
            ].filter((id): id is number => id !== null)
        ),
        bags: new Set(plan.bag_upgrades.map((upgrade) => upgrade.item.item_id)),
        headPlan: plan.plan.gear.head,
    }
}

describe('no items of the other faction', () => {
    test('for an Orc, no item with factionRestriction 1 is in the alternatives, the plan or the bag upgrades', () => {
        const ids = shown('Orc')
        for (const alliance of [ALLIANCE_HELM.id, ALLIANCE_NECK.id]) {
            expect(ids.alternatives.has(alliance)).toBe(false)
            expect(ids.planned.has(alliance)).toBe(false)
            expect(ids.bags.has(alliance)).toBe(false)
        }
        // Horde items stay for a Horde race.
        expect(ids.alternatives.has(HORDE_HELM.id)).toBe(true)
        expect(ids.headPlan).toBe(HORDE_HELM.id)
        expect(ids.bags.has(HORDE_NECK.id)).toBe(true)
    })

    test('for a Human, no item with factionRestriction 2 is in the alternatives, the plan or the bag upgrades', () => {
        const ids = shown('Human')
        for (const horde of [HORDE_HELM.id, HORDE_NECK.id]) {
            expect(ids.alternatives.has(horde)).toBe(false)
            expect(ids.planned.has(horde)).toBe(false)
            expect(ids.bags.has(horde)).toBe(false)
        }
        // Alliance items stay for an Alliance race.
        expect(ids.alternatives.has(ALLIANCE_HELM.id)).toBe(true)
        expect(ids.headPlan).toBe(ALLIANCE_HELM.id)
        expect(ids.bags.has(ALLIANCE_NECK.id)).toBe(true)
    })

    test('for a race outside the table (WindshaperSkyborne), items of both factions stay in the alternatives and the bag upgrades, unlike for a Troll or a NightElf in the table', () => {
        // The table decides: a Troll and a NightElf each lose the other
        // faction's items, so only a race outside it keeps both.
        const troll = shown('Troll')
        expect(troll.alternatives.has(ALLIANCE_HELM.id)).toBe(false)
        expect(troll.bags.has(ALLIANCE_NECK.id)).toBe(false)
        const nightElf = shown('NightElf')
        expect(nightElf.alternatives.has(HORDE_HELM.id)).toBe(false)
        expect(nightElf.bags.has(HORDE_NECK.id)).toBe(false)

        const ids = shown('WindshaperSkyborne')
        for (const id of [
            ALLIANCE_HELM.id,
            HORDE_HELM.id,
            ALLIANCE_NECK.id,
            HORDE_NECK.id,
        ])
            expect(ids.alternatives.has(id)).toBe(true)
        expect(ids.bags.has(ALLIANCE_NECK.id)).toBe(true)
        expect(ids.bags.has(HORDE_NECK.id)).toBe(true)
        expect([ALLIANCE_HELM.id, HORDE_HELM.id]).toContain(ids.headPlan!)
    })
})
