/**
 * Per-second timelines on single fights, as the runner's `results.ts`
 * writes them (reference part 3): each single fight asks the sim for a
 * 1-second bucket, and its result's `timeline` holds `{ t_s, dps, mana }`
 * per point, mana whole. The chain keeps `timeline: null`.
 *
 * Driven through `simSingle` and `simSession` with the fake pool
 * (`helpers/recorded-pool.ts`), scripted to keep every sim request and
 * answer a fixed result and sheet, so no sim runs.
 */
import { describe, expect, test } from 'bun:test'

import {
    PSEUDO_STAT,
    type RaidSimRequest,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
} from '@goturbo/sim'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    chainFor,
    scenariosFor,
    simSession,
    simSingle,
    type Character,
} from '../src/browser-sim'
import { recordedPool } from './helpers/recorded-pool'

/** The sim's per-second points: mana with fractions, as the sim gives it. */
const POINTS = [
    { tS: 0, dps: 80, mana: 1500 },
    { tS: 1, dps: 95.5, mana: 1234.6 },
    { tS: 2, dps: 110, mana: 1000.4 },
]

function answer(): RaidSimResult {
    const player = {
        name: 'Testchar',
        dps: { avg: 95 },
        timeline: structuredClone(POINTS),
    }
    return {
        raidMetrics: { parties: [{ players: [player] }] },
    } as unknown as RaidSimResult
}

function sheetAnswer(): SimSheet {
    const pseudoStats: number[] = []
    pseudoStats[PSEUDO_STAT.meleeCritPercent] = 5
    return {
        level: 30,
        unreached_ranks: [],
        player: { finalStats: { stats: [], pseudoStats } },
    }
}

/** A pool that keeps every sim request in `sims` and answers `answer()`. */
function recordingPool(sims: RaidSimRequest[]): SimPool {
    return recordedPool({
        sim: (request) => {
            sims.push(request)
            return Promise.resolve(answer())
        },
        sheet: () => Promise.resolve(sheetAnswer()),
    })
}

async function character(pool: SimPool): Promise<Character> {
    return (await testcharCharacter(pool)) as Character
}

describe('single fights carry a per-second timeline', () => {
    test('each single-fight request asks for timelineBucketMs 1000', async () => {
        const sims: RaidSimRequest[] = []
        const pool = recordingPool(sims)
        const testchar = await character(pool)
        const fights = scenariosFor(testchar.level)
        expect(fights.length).toBeGreaterThan(0)
        for (const fight of fights)
            await simSingle(
                pool,
                testchar,
                fight,
                testchar.gear,
                testchar.sheet,
                () => undefined,
                {}
            )

        expect(sims).toHaveLength(fights.length)
        const buckets = sims.map(
            (request) =>
                (request.simOptions as { timelineBucketMs?: number })
                    .timelineBucketMs
        )
        expect(buckets).toEqual(fights.map(() => 1000))
    })

    test('a result with 3 timeline points gives the worn result a timeline of 3 entries with t_s, dps and whole-number mana', async () => {
        const pool = recordingPool([])
        const testchar = await character(pool)
        const fight = scenariosFor(testchar.level)[0]!
        const { result } = await simSingle(
            pool,
            testchar,
            fight,
            testchar.gear,
            testchar.sheet,
            () => undefined,
            {}
        )

        expect(result.timeline).toEqual([
            { t_s: 0, dps: 80, mana: 1500 },
            { t_s: 1, dps: 95.5, mana: 1235 },
            { t_s: 2, dps: 110, mana: 1000 },
        ])
        for (const point of result.timeline ?? [])
            expect(Number.isInteger(point.mana)).toBe(true)
    })
})

describe('the chain keeps no timeline', () => {
    test('a chain fight’s result has timeline null, where a single fight on the same sim answers has one', async () => {
        const pool = recordingPool([])
        const testchar = await character(pool)
        const single = await simSingle(
            pool,
            testchar,
            scenariosFor(testchar.level)[0]!,
            testchar.gear,
            testchar.sheet,
            () => undefined,
            {}
        )
        expect(single.result.timeline).toHaveLength(3)
        const result = await simSession(
            pool,
            testchar,
            chainFor(testchar.level),
            testchar.gear,
            testchar.sheet,
            () => undefined,
            {}
        )

        expect(result.pulls?.length).toBeGreaterThan(0)
        expect(result.timeline).toBeNull()
    })
})
