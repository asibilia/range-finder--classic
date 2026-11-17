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
 *   parries per fight give. A build without Stormstrike gets it for the
 *   check only.
 * Above level 30 (the runner's level) both fights' mobs rise with the
 * character, keeping the runner's gap: solo at level + 1, the dungeon at
 * level + 2, each with its level's armor.
 *
 * `simCharacter` runs on Testchar with the fake pool
 * (`helpers/recorded-pool.ts`), scripted to answer each request from what
 * the request asks for, so a test sets each stat's gain per seed and the
 * Stormstrike casts directly. As the sim's rotation, it casts Stormstrike
 * only when the request's talents have it. The data files come from
 * `packages/sim/build/`.
 */
import { describe, expect, test } from 'bun:test'

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
import { recordedPool } from './helpers/recorded-pool'

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

/** Points in the Enhancement talent at `index`. */
function enhancementPoints(request: RaidSimRequest, index: number): number {
    const tree = (playerOfRequest(request).talentsString ?? '').split('-')[1]
    return Number((tree ?? '').padEnd(18, '0')[index])
}

/** Points in Stormstrike (Enhancement index 11). */
const stormstrikePoints = (request: RaidSimRequest) =>
    enhancementPoints(request, 11)

/** Points in Improved Stormstrike (Enhancement index 15). */
const improvedStormstrike = (request: RaidSimRequest) =>
    enhancementPoints(request, 15)

/** A sim of the Stormstrike gate: seed 31, 4000 iterations. */
function isStormstrikeCheck(request: RaidSimRequest): boolean {
    const { iterations, randomSeed } = asRequest(request).simOptions
    return randomSeed === 31 && iterations === 4000
}

/** A sim of the DPS-rises gates: seeds 21 to 23, 3000 iterations. */
function isDpsRisesSim(request: RaidSimRequest): boolean {
    const { iterations, randomSeed } = asRequest(request).simOptions
    return [21, 22, 23].includes(randomSeed) && iterations === 3000
}

/** The level and armor of the mob a request fights. */
function mobOf(request: RaidSimRequest): { level: number; armor: number } {
    const mob = asRequest(request).encounter.targets[0]!
    return { level: mob.level, armor: mob.stats[STAT.armor]! }
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

/**
 * The fake pool, scripted: it records every sim request and answers each
 * from what it asks for. The data files come from the build.
 */
function scriptedPool(script: Scripted, requests: RaidSimRequest[]): SimPool {
    const build = recordedPool()
    let l60: Promise<[string, number]> | undefined
    const level60 = () =>
        (l60 ??= Promise.all([
            build.data('l60-test.in.json'),
            build.data('version.json'),
        ]).then(([request, version]) => [
            JSON.stringify(request),
            (version as { l60_expected_dps: number }).l60_expected_dps,
        ]))
    const effect = script.resetEffectPerMin ?? EXPECTED_EFFECT_PER_MIN
    return recordedPool({
        async sim(request) {
            const [l60Request, l60Dps] = await level60()
            if (JSON.stringify(request) === l60Request)
                return result(l60Dps, 0, 1, 0)
            requests.push(request)
            const { iterations, randomSeed } = asRequest(request).simOptions
            const hit = isHit(request)
            const avoided = hit ? AVOIDED_PER_FIGHT : 0
            if (isStormstrikeCheck(request)) {
                const talented = improvedStormstrike(request) > 0
                const casts =
                    stormstrikePoints(request) === 0
                        ? 0
                        : talented && hit
                          ? CASTS_CALM + effect / 2
                          : CASTS_CALM
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
    })
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

/** What a test changes in Testchar: its level, its talents. */
type Changes = { level?: number; talents?: string }

/**
 * Testchar, with `changes`, simmed on the scripted pool, and the sim
 * requests it made.
 */
async function simmed(
    script: Scripted = {},
    changes: Changes = {}
): Promise<{
    outcome: SimOutcome
    requests: RaidSimRequest[]
    character: Character
}> {
    const requests: RaidSimRequest[] = []
    const pool = scriptedPool(script, requests)
    const testchar = (await testcharCharacter(pool)) as unknown as Character
    const level = changes.level ?? testchar.level
    const character: Character = {
        ...testchar,
        level,
        talents: changes.talents ?? testchar.talents,
        profile: { ...testchar.profile, level },
    }
    const outcome = await simCharacter(character, weights(), pool, () => {})
    return { outcome, requests, character }
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
const HIT_RISES = /^DPS rises with hit rating$/i
const STORMSTRIKE_RULE = /^being hit resets Stormstrike as the rule says$/

/** Testchar's build (`-050032302051`) with Stormstrike's point taken out. */
const NO_STORMSTRIKE = '-050032302050'

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

    test('a build without Stormstrike gets it in the four Stormstrike-check sims only, passes at the expected reset effect, and the detail says it was added for this check only', async () => {
        const { outcome, requests, character } = await simmed(
            { resetEffectPerMin: EXPECTED_EFFECT_PER_MIN },
            { talents: NO_STORMSTRIKE }
        )
        const checkSims = requests.filter(isStormstrikeCheck)
        expect(checkSims).toHaveLength(4)
        for (const request of checkSims)
            expect(stormstrikePoints(request)).toBeGreaterThan(0)
        const others = requests.filter((r) => !isStormstrikeCheck(r))
        expect(others.length).toBeGreaterThan(0)
        for (const request of others)
            expect(playerOfRequest(request).talentsString).toBe(
                character.talents
            )

        const check = checkOf(outcome, STORMSTRIKE_RULE)
        expect(check.passed).toBe(true)
        expect(check.detail).toMatch(/no Stormstrike talent/i)
        expect(check.detail).toMatch(/for this check only/i)
    })
})

describe('the sanity fights above level 30', () => {
    test('for Testchar at level 45, the DPS-rises sims fight a level-47 mob with 1900 armor, the Stormstrike sims a level-46 mob with 1850 armor, and the run gives a file', async () => {
        const { outcome, requests } = await simmed({}, { level: 45 })
        const rises = requests.filter(isDpsRisesSim)
        expect(rises).toHaveLength(3 * 7)
        expect(rises.map(mobOf)).toEqual(
            rises.map(() => ({ level: 47, armor: 1900 }))
        )
        const stormstrike = requests.filter(isStormstrikeCheck)
        expect(stormstrike).toHaveLength(4)
        expect(stormstrike.map(mobOf)).toEqual(
            stormstrike.map(() => ({ level: 46, armor: 1850 }))
        )

        expect(checkOf(outcome, HIT_RISES).detail).toContain('level 47')
        expect(outcome.kind).toBe('file')
    })
})
