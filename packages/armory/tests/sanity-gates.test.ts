/**
 * The sanity gates, as strict as the runner's `sanityChecks` (`checks.ts`,
 * reference part 3):
 * - `DPS rises with <stat>`: Strength +20, Agility +20, Intellect +20,
 *   Attack Power +40, Hit rating +20 and Crit rating +28, on the fixed
 *   short dungeon fight (level 32, armor 1150, 30 s), 3000 iterations,
 *   seeds 21, 22 and 23; it passes when the mean gain less its 95%
 *   half-width (Student's t) is above 0.
 * - `being hit resets Stormstrike as the rule says`: the fixed solo fight
 *   (level 31, armor 1100, 30 s), seed 31, 4000 iterations, with and
 *   without Improved Stormstrike, hit and not; it passes when the reset
 *   effect is above 0 and within ±35% of the rate the mob's dodges and
 *   parries per fight give.
 *
 * `simCharacter` runs on Testchar with a fake `SimPool`: no sim behind it,
 * it answers each request from what the request asks for, so a test sets
 * each stat's gain per seed and the Stormstrike casts directly. The data
 * files come from `packages/sim/build/`.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import {
    PSEUDO_STAT,
    STAT,
    type RaidSimRequest,
    type RaidSimResult,
    type SimPool,
    type SimSheet,
} from '@goturbo/sim'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    simCharacter,
    STAT_STEPS,
    type Character,
    type SimOutcome,
    type StatWeights,
} from '../src/browser-sim'

const BUILD = join(import.meta.dir, '../../sim/build')

/** Stormstrike's spell id. */
const STORMSTRIKE = 17364
/** DPS of any request that adds no stat. */
const BASE_DPS = 50
/** The mob's dodged and parried swings per fight while hitting. */
const AVOIDED_PER_FIGHT = 4
/**
 * Stormstrike casts per fight on the 30 s solo fight. Without the talent:
 * 4/min hit or not; with it, 4/min not hit. The expected reset effect is
 * 4 avoided × 50% (1/2 points) × half a cast × 2 (per minute) = 2/min.
 */
const CASTS_CALM = 2
const EXPECTED_EFFECT_PER_MIN = 2

type Scripted = {
    /** DPS gained per seed, by stat index; other stats and seeds gain 1. */
    gains?: Partial<Record<number, Record<number, number>>>
    /** Stormstrike's reset effect per minute, hit with the talent. */
    resetEffectPerMin?: number
}

type Player = {
    talentsString?: string
    bonusStats?: { stats?: number[]; pseudoStats?: number[] }
}

type Request = {
    raid: { parties: { players: Player[] }[]; tanks?: unknown[] }
    encounter: {
        duration: number
        targets: { level: number; stats: number[] }[]
    }
    simOptions: { iterations: number; randomSeed: number }
}

const asRequest = (request: RaidSimRequest) => request as unknown as Request
const playerOfRequest = (request: RaidSimRequest) =>
    asRequest(request).raid.parties[0]!.players[0]!

/** The one stat a request adds: its index and amount, or null. */
function addedStat(
    request: RaidSimRequest
): { index: number; amount: number; pseudo: boolean } | null {
    const bonus = playerOfRequest(request).bonusStats
    const stat = (bonus?.stats ?? []).findIndex((v) => (v ?? 0) !== 0)
    if (stat >= 0)
        return { index: stat, amount: bonus!.stats![stat]!, pseudo: false }
    const pseudo = (bonus?.pseudoStats ?? []).findIndex((v) => (v ?? 0) !== 0)
    if (pseudo >= 0)
        return {
            index: pseudo,
            amount: bonus!.pseudoStats![pseudo]!,
            pseudo: true,
        }
    return null
}

/** Points in Improved Stormstrike (Enhancement index 15). */
function improvedStormstrike(request: RaidSimRequest): number {
    const tree = (playerOfRequest(request).talentsString ?? '').split('-')[1]
    return Number((tree ?? '').padEnd(18, '0')[15])
}

const isHit = (request: RaidSimRequest) =>
    (asRequest(request).raid.tanks ?? []).length > 0

/** The sim's `turboSheet` answer, the same for every sheet call. */
function sheetAnswer(): SimSheet {
    const stats: number[] = new Array(40).fill(0)
    stats[STAT.strength] = 80
    stats[STAT.agility] = 60
    stats[STAT.stamina] = 70
    stats[STAT.intellect] = 50
    stats[STAT.spirit] = 55
    stats[STAT.attackPower] = 200
    stats[STAT.armor] = 900
    stats[STAT.health] = 1500
    stats[STAT.mana] = 1200
    const pseudoStats: number[] = new Array(37).fill(0)
    pseudoStats[PSEUDO_STAT.meleeCritPercent] = 5
    pseudoStats[PSEUDO_STAT.spellCritPercent] = 3
    pseudoStats[PSEUDO_STAT.dodgePercent] = 4
    return {
        level: 30,
        unreached_ranks: [],
        player: { finalStats: { stats, pseudoStats } },
    }
}

function result(
    dps: number,
    stormstrikeCasts: number,
    iterations: number,
    avoided: number
): RaidSimResult {
    return {
        raidMetrics: {
            parties: [
                {
                    players: [
                        {
                            dps: { avg: dps },
                            actions: [
                                {
                                    id: { otherId: 'OtherActionAttack' },
                                    spellSchool: 1,
                                    targets: [{ damage: 1000, casts: 10 }],
                                },
                                {
                                    id: { spellId: STORMSTRIKE },
                                    spellSchool: 1,
                                    targets: [
                                        {
                                            damage: 500,
                                            casts:
                                                stormstrikeCasts * iterations,
                                        },
                                    ],
                                },
                            ],
                            timeline: [
                                { tS: 0, dps, mana: 1000 },
                                { tS: 1, dps, mana: 900 },
                            ],
                        },
                    ],
                },
            ],
        },
        encounterMetrics: {
            targets: [
                {
                    actions: [
                        {
                            id: { otherId: 'OtherActionAttack' },
                            targets: [
                                {
                                    dodges: (avoided * iterations) / 2,
                                    parries: (avoided * iterations) / 2,
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    } as unknown as RaidSimResult
}

/** A pool with no sim behind it, recording every sim request. */
function scriptedPool(script: Scripted, requests: RaidSimRequest[]): SimPool {
    let l60: Promise<[string, number]> | undefined
    const level60 = () =>
        (l60 ??= Promise.all([
            Bun.file(join(BUILD, 'l60-test.in.json')).json(),
            Bun.file(join(BUILD, 'version.json')).json(),
        ]).then(([request, version]) => [
            JSON.stringify(request),
            (version as { l60_expected_dps: number }).l60_expected_dps,
        ]))
    const effect = script.resetEffectPerMin ?? EXPECTED_EFFECT_PER_MIN
    return {
        size: 4,
        async sim(request) {
            const [l60Request, l60Dps] = await level60()
            if (JSON.stringify(request) === l60Request)
                return result(l60Dps, 0, 1, 0)
            requests.push(request)
            const { iterations, randomSeed } = asRequest(request).simOptions
            const hit = isHit(request)
            const avoided = hit ? AVOIDED_PER_FIGHT : 0
            if (randomSeed === 31 && iterations === 4000) {
                const talented = improvedStormstrike(request) > 0
                const casts =
                    talented && hit ? CASTS_CALM + effect / 2 : CASTS_CALM
                return result(BASE_DPS, casts, iterations, avoided)
            }
            const added = addedStat(request)
            const gain = added
                ? (script.gains?.[added.index]?.[randomSeed] ??
                  ([21, 22, 23].includes(randomSeed) ? 1 : 0))
                : 0
            return result(BASE_DPS + gain, CASTS_CALM, iterations, avoided)
        },
        sheet: () => Promise.resolve(sheetAnswer()),
        version: () => Bun.file(join(BUILD, 'version.json')).json(),
        weights: () => Promise.resolve(null),
        data: (name) => Bun.file(join(BUILD, name)).json(),
        stats: () => ({ calls: 0, iterations: 0, ms: 0 }),
        batch() {},
        onProgress: () => () => {},
        cancel() {},
        close() {},
    }
}

/** Every weighed stat at 1 EP, on every fight. */
function weights(): StatWeights {
    return [
        'solo-hit-short',
        'dungeon-short',
        'dungeon-long',
        'chain-solo',
    ].map((fight_id) => ({
        fight_id,
        weights: STAT_STEPS.map(({ stat }) => ({ stat, ep: 1 })),
    }))
}

/** Testchar simmed on the scripted pool, and the sim requests it made. */
async function simmed(
    script: Scripted = {}
): Promise<{ outcome: SimOutcome; requests: RaidSimRequest[] }> {
    const requests: RaidSimRequest[] = []
    const pool = scriptedPool(script, requests)
    const character = (await testcharCharacter(pool)) as unknown as Character
    const outcome = await simCharacter(character, weights(), pool, () => {})
    return { outcome, requests }
}

/** The run's check whose name matches, from the file or the failed gates. */
function checkOf(outcome: SimOutcome, name: RegExp) {
    const checks =
        outcome.kind === 'file'
            ? outcome.file.checks
            : outcome.kind === 'gates'
              ? outcome.failed
              : []
    const check = checks.find((c) => name.test(c.name))
    expect(check).toBeDefined()
    return check!
}

const INTELLECT_RISES = /^DPS rises with intellect$/i
const STORMSTRIKE_RULE = /^being hit resets Stormstrike as the rule says$/

describe('the DPS-rises gates', () => {
    test('the sanity step asks for exactly Strength +20, Agility +20, Intellect +20, Attack Power +40, Hit rating +20 and Crit rating +28, each at seeds 21, 22 and 23 with 3000 iterations, on the level 32, 1150-armor, 30 s fight', async () => {
        const { requests } = await simmed()
        const raised = requests.filter((r) => addedStat(r) !== null)
        const asked = raised
            .map((r) => {
                const added = addedStat(r)!
                const { iterations, randomSeed } = asRequest(r).simOptions
                return `${added.pseudo ? 'pseudo ' : ''}${added.index} +${added.amount} seed ${randomSeed} × ${iterations}`
            })
            .sort()
        const expected = [
            [STAT.strength, 20],
            [STAT.agility, 20],
            [STAT.intellect, 20],
            [STAT.attackPower, 40],
            [STAT.hitRating, 20],
            [STAT.critRating, 28],
        ]
            .flatMap(([index, amount]) =>
                [21, 22, 23].map(
                    (seed) => `${index} +${amount} seed ${seed} × 3000`
                )
            )
            .sort()
        expect(asked).toEqual(expected)

        const fights = raised.map((r) => {
            const { encounter } = asRequest(r)
            const mob = encounter.targets[0]!
            return {
                level: mob.level,
                armor: mob.stats[STAT.armor],
                duration: encounter.duration,
            }
        })
        expect(fights).toEqual(
            raised.map(() => ({ level: 32, armor: 1150, duration: 30 }))
        )
    })

    test('Intellect gains of 0.1, −0.1 and 0.0 over seeds 21, 22 and 23 fail DPS rises with Intellect', async () => {
        const { outcome } = await simmed({
            gains: { [STAT.intellect]: { 21: 0.1, 22: -0.1, 23: 0 } },
        })
        expect(checkOf(outcome, INTELLECT_RISES).passed).toBe(false)
    })

    test('Intellect gains of 0.5, 0.6 and 0.55 over seeds 21, 22 and 23 pass DPS rises with Intellect', async () => {
        const { outcome } = await simmed({
            gains: { [STAT.intellect]: { 21: 0.5, 22: 0.6, 23: 0.55 } },
        })
        const check = checkOf(outcome, INTELLECT_RISES)
        expect(check.passed).toBe(true)
        // The detail gives the mean gain, as the runner's does.
        expect(check.detail).toContain('0.55')
    })
})

describe('the Stormstrike reset gate', () => {
    test('a reset effect 50% above the expected rate fails, and the detail names both rates and the ±35% band', async () => {
        const { outcome } = await simmed({
            resetEffectPerMin: EXPECTED_EFFECT_PER_MIN * 1.5,
        })
        const check = checkOf(outcome, STORMSTRIKE_RULE)
        expect(check.passed).toBe(false)
        expect(check.detail).toContain('3.00')
        expect(check.detail).toContain('2.00')
        expect(check.detail).toMatch(/±\s?35\s?%/)
    })

    test('a reset effect at the expected rate passes', async () => {
        const { outcome } = await simmed({
            resetEffectPerMin: EXPECTED_EFFECT_PER_MIN,
        })
        const check = checkOf(outcome, STORMSTRIKE_RULE)
        expect(check.passed).toBe(true)
        expect(check.detail).toMatch(/±\s?35\s?%/)
    })
})
