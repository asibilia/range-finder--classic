import { describe, expect, test } from 'bun:test'

import {
    SimCancelled,
    STAT,
    type RaidSimRequest,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
} from '@goturbo/sim'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    BAG_PREVIEW_FAILURE,
    bagPreviewGear,
    bagPreviewWork,
    buildRequest,
    failedChecks,
    simBagPreviews,
    type Character,
} from '../src/browser-sim'
import type { GearPlan } from '../src/browser-sim/plan'
import type { ResultsFile, Slot } from '../src/results-file'
import sample from '../src/sample-truncha.json'
import { recorded, recordedPool } from './helpers/recorded-pool'
import { syntheticDb } from './helpers/synthetic-db'

type Upgrade = ResultsFile['bag_upgrades'][number]
type Planned = Pick<GearPlan, 'bag_upgrades' | 'left_out_items'>

const FIGHTS = ['solo-hit-short', 'dungeon-short', 'dungeon-long', 'chain-solo']
const template = sample.bag_upgrades[0]!

function upgrade(id: number, slot: Slot, gain = 5): Upgrade {
    return {
        slot,
        gain_ep: gain,
        item: {
            ...template.item,
            item_id: id,
            name: `Bag ${id}`,
        },
    } as Upgrade
}

function leftOut(
    item_id: number
): NonNullable<ResultsFile['left_out_items']>[number] {
    return { item_id, name: `Bag ${item_id}`, reason: 'not confirmed' }
}

function planned(upgrades: Upgrade[], leftOutIds: number[] = []): Planned {
    return {
        bag_upgrades: upgrades,
        left_out_items: leftOutIds.map(leftOut),
    }
}

describe('not-checked gates', () => {
    test('ignore only rows marked not_checked, retaining ordinary failures', () => {
        const failed = {
            name: 'ordinary',
            passed: false,
            detail: 'Failed.',
        }
        expect(
            failedChecks([
                failed,
                BAG_PREVIEW_FAILURE,
                { name: 'pass', passed: true, detail: 'Passed.' },
            ])
        ).toEqual([failed])
    })
})

describe('bag preview eligibility', () => {
    test('only positive-EP items absent from left_out_items get previews, and an ineligible emitted row blocks Equip all', () => {
        const work = bagPreviewWork(
            planned(
                [
                    upgrade(1, 'head'),
                    upgrade(2, 'neck', 0),
                    upgrade(3, 'shoulder'),
                    upgrade(4, 'back'),
                ],
                [3]
            ),
            30
        )
        expect(work.upgrades.map((item) => item.item.item_id)).toEqual([1, 4])
        expect(work.combined).toBe(false)
        expect(work.calls).toBeGreaterThan(0)
    })

    test('Equip all needs at least two eligible upgrades in distinct slots', () => {
        const two = bagPreviewWork(
            planned([upgrade(1, 'head'), upgrade(2, 'neck')]),
            30
        )
        expect(two.combined).toBe(true)
        expect(two.calls).toBeGreaterThan(0)

        const one = bagPreviewWork(planned([upgrade(1, 'head')]), 30)
        expect(one.combined).toBe(false)
        expect(one.calls).toBeLessThan(two.calls)

        const sameSlot = bagPreviewWork(
            planned([upgrade(1, 'head'), upgrade(2, 'head')]),
            30
        )
        expect(sameSlot.combined).toBe(false)
        expect(sameSlot.calls).toBe(one.calls * 2)
    })
})

type Player = {
    equipment: { items: { id?: number }[] }
    bonusStats?: { stats?: number[] }
}

function strengthOf(request: RaidSimRequest): number {
    const raid = request.raid as unknown as {
        parties: { players: Player[] }[]
    }
    return raid.parties[0]!.players[0]!.bonusStats?.stats?.[STAT.strength] ?? 0
}

function withDps(answer: RaidSimResult, dps: number): RaidSimResult {
    const result = structuredClone(answer) as RaidSimResult & {
        raidMetrics: { parties: { players: { dps: { avg: number } }[] }[] }
    }
    result.raidMetrics.parties[0]!.players[0]!.dps.avg = dps
    return result
}

/** Recorded answers, with DPS derived from the preview bag's game stats. */
async function previewPool(
    _character: Character,
    fail: (strength: number) => boolean = () => false
): Promise<SimPool> {
    const answers = Object.values(await recorded())
    const answer = answers.find(
        (value): value is RaidSimResult =>
            typeof value === 'object' &&
            value !== null &&
            'raidMetrics' in value
    )
    const sheet = answers.find(
        (value): value is SimSheet =>
            typeof value === 'object' && value !== null && 'player' in value
    )
    if (!answer || !sheet) throw new Error('No recorded sim answers.')
    return recordedPool({
        sim: async (preview) => {
            const strength = strengthOf(preview)
            if (fail(strength)) throw new Error('preview failed')
            return withDps(answer, 100 + strength)
        },
        sheet: async () => structuredClone(sheet),
    })
}

async function fixture(upgrades: Upgrade[], leftOutIds: number[] = []) {
    const base = recordedPool()
    const plain = await testcharCharacter(base)
    const character: Character = {
        ...plain,
        bags: upgrades.map((item, index) => ({
            id: item.item.item_id,
            name: item.item.name,
            quality: 2,
            item_level: 30,
            required_level: 1,
            equip_loc: 'INVTYPE_HEAD',
            stats: { ITEM_MOD_STRENGTH_SHORT: (index + 1) * 10 },
        })),
    }
    const plan = planned(upgrades, leftOutIds)
    const work = bagPreviewWork(plan, character.level)
    const original = structuredClone(character)
    const run = (pool: SimPool) =>
        simBagPreviews({
            pool,
            character,
            db: syntheticDb([]),
            planned: plan,
            work,
            names: () => undefined,
            spellNames: {},
        })
    return { character, original, run }
}

describe('bag preview simulation', () => {
    test('per-item and combined previews have real results for every fight, and leave the source gear unchanged', async () => {
        const { character, original, run } = await fixture([
            upgrade(900001, 'head'),
            upgrade(900002, 'neck'),
        ])
        const outcome = await run(await previewPool(character))
        expect(outcome.checks).toEqual([])
        expect(
            outcome.bag_upgrades.map((item) => item.results?.length)
        ).toEqual([FIGHTS.length, FIGHTS.length])
        for (const [index, dps] of [110, 120].entries()) {
            const results = outcome.bag_upgrades[index]!.results!
            expect(results.map((result) => result.fight_id)).toEqual(FIGHTS)
            expect(results.map((result) => result.dps)).toEqual(
                FIGHTS.map(() => dps)
            )
        }
        expect(
            outcome.bag_upgrades_all?.results.map((result) => result.dps)
        ).toEqual(FIGHTS.map(() => 130))
        expect(character).toEqual(original)
    })

    test('ineligible rows have no preview property and make no sim calls', async () => {
        const { character, run } = await fixture(
            [upgrade(900001, 'head', 0), upgrade(900002, 'neck')],
            [900002]
        )
        let calls = 0
        const pool = await previewPool(character)
        const counting = recordedPool({
            ...pool,
            sim: (request, profile) => {
                calls++
                return pool.sim(request, profile)
            },
            sheet: (request, profile) => {
                calls++
                return pool.sheet(request, profile)
            },
        })
        const outcome = await run(counting)
        expect(outcome.bag_upgrades.every((item) => !('results' in item))).toBe(
            true
        )
        expect(outcome.bag_upgrades_all).toBeNull()
        expect(calls).toBe(0)
    })

    test('a per-item failure nulls only that preview and adds the exact non-blocking check', async () => {
        const { character, run } = await fixture([upgrade(900001, 'head')])
        const outcome = await run(await previewPool(character, () => true))
        expect(outcome.bag_upgrades[0]!.results).toBeNull()
        expect(outcome.bag_upgrades_all).toBeNull()
        expect(outcome.checks).toEqual([BAG_PREVIEW_FAILURE])
    })

    test('a combined-only failure keeps both per-item previews and nulls Equip all', async () => {
        const { character, run } = await fixture([
            upgrade(900001, 'head'),
            upgrade(900002, 'neck'),
        ])
        const outcome = await run(
            await previewPool(character, (strength) => strength === 30)
        )
        expect(
            outcome.bag_upgrades.map((item) => item.results?.length)
        ).toEqual([FIGHTS.length, FIGHTS.length])
        expect(outcome.bag_upgrades_all).toBeNull()
        expect(outcome.checks).toEqual([BAG_PREVIEW_FAILURE])
    })

    test('cancellation rejects instead of becoming a preview failure, with no partial gear mutation', async () => {
        const { character, original, run } = await fixture([
            upgrade(900001, 'head'),
        ])
        const base = await previewPool(character)
        const pool = recordedPool({
            ...base,
            sim: () => Promise.reject(new SimCancelled()),
        })
        await expect(run(pool)).rejects.toBeInstanceOf(SimCancelled)
        expect(character).toEqual(original)
    })

    test('an unknown bag item is removed from sim equipment and its exported stats are applied once', async () => {
        const [item] = [upgrade(900001, 'head')]
        const { character, original } = await fixture([item])
        const preview = bagPreviewGear(character, syntheticDb([]), [item])
        const request = buildRequest(preview.character, 'dungeon-long', {
            seed: 23,
            iterations: 4000,
            gear: preview.gear,
        })
        const raid = request.raid as unknown as {
            parties: { players: Player[] }[]
        }
        const player = raid.parties[0]!.players[0]!
        expect(player.equipment.items.map((piece) => piece.id)).not.toContain(
            item.item.item_id
        )
        expect(strengthOf(request)).toBe(10)
        expect(preview.gear.head?.id).toBe(item.item.item_id)
        expect(character).toEqual(original)
    })
})
