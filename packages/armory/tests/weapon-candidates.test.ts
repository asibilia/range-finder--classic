/**
 * Weapon suggestions as the runner makes them (`weaponList` in `gear.ts`
 * and its call in `emit.ts`, reference part 2): only two-handers of a type
 * the character has a skill for that it can wear at level + 3, pre-ranked
 * by the long dungeon fight's EP plus weapon DPS × its `weapon_dps` EP, the
 * top 12 simmed on `dungeon-long` at 6000 iterations, seed 77. Checked on
 * `weaponCandidates` with made-up items, and on the sim requests a run of
 * Testchar's export sends to a pool with no sim behind it.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { STAT, type RaidSimRequest, type SimPool } from '@goturbo/sim'

import { ensureSimBuild } from '../../sim/tests/helpers/sim-build'
import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import { buildRequest, simExport, type Character } from '../src/browser-sim'
import { loadItemDb, type DbItem } from '../src/browser-sim/gear'
import { weaponCandidates } from '../src/browser-sim/plan'
import { SLOTS, type Stat } from '../src/results-file'
import { exportFromCharacter } from './helpers/export-from-character'
import { recorded, recordedAnswer, recordedPool } from './helpers/recorded-pool'

const FIXTURE = join(import.meta.dir, '../../sim/fixtures/testchar-l30.json')
const MAIN_HAND = SLOTS.indexOf('main_hand')

/** The item data's weapon types (`weaponType`). */
const AXE = 1
const MACE = 4
const POLEARM = 6
const STAFF = 8
const SWORD = 9
const TWO_HAND = 4
const ONE_HAND = 2
const MAIN_HAND_ONLY = 1

/** A level 30 Shaman wearing nothing the lists below hold. */
const LEVEL_30 = {
    name: 'Levelling',
    level: 30,
    race: 'Orc',
    class: 'Shaman',
    talents: '',
    gear: {},
    bags: [],
    imbue: null,
    known_spells: [],
    export_saved_at: '2026-11-17T00:00:00Z',
    game_build: '1.15.8',
} as unknown as Character

/** A wearable weapon at level 30: uncommon, level 25, with a source. */
function weapon(
    id: number,
    weaponType: number,
    strength: number,
    dps: number,
    more: Partial<DbItem> = {}
): DbItem {
    return {
        id,
        name: `Weapon ${id}`,
        type: 13,
        weaponType,
        handType: TWO_HAND,
        quality: 2,
        reqLvl: 25,
        sources: [{ drop: { otherName: 'Some Boss' } }],
        scalingOptions: {
            '0': {
                stats: { [String(STAT.strength)]: strength },
                ilvl: 30,
                unroundedDps: dps,
            },
        },
        ...more,
    }
}

/** Strength worth 2 EP, nothing else; weapon DPS weighs 3 EP, given apart. */
const EP = new Map<Stat, number>([['strength', 2]])
const WEAPON_DPS_EP = 3
const ALL_TWO_HAND_SKILLS = new Set([AXE, MACE, STAFF, SWORD, POLEARM])

const ids = (items: DbItem[]) => items.map((item) => item.id)

describe('weaponCandidates', () => {
    test('with skills in Two-Handed Axes and Staves only, the candidates are the two-handed axe and the staff: no mace, sword, polearm or one-hander', () => {
        // The left-out kinds weigh far more, so only the skill rule drops them.
        const items = [
            weapon(301, AXE, 0, 20),
            weapon(302, STAFF, 0, 20),
            weapon(303, MACE, 50, 50),
            weapon(304, SWORD, 50, 50),
            weapon(305, POLEARM, 50, 50),
            weapon(306, AXE, 50, 50, { handType: ONE_HAND }),
            weapon(307, MACE, 50, 50, { handType: MAIN_HAND_ONLY }),
        ]
        const candidates = weaponCandidates(
            LEVEL_30,
            items,
            EP,
            WEAPON_DPS_EP,
            new Set([AXE, STAFF])
        )
        expect(ids(candidates).sort((a, b) => a - b)).toEqual([301, 302])
    })

    test('of 14 wearable two-handers and 5 that fail canWear or are one-handers, the candidates are the top 12 by strength EP plus weapon DPS × weapon_dps EP, best first', () => {
        // Pre-rank = 2 × strength + 3 × DPS. Neither strength nor DPS alone
        // gives this order.
        const wearable = [
            weapon(101, AXE, 0, 40, { reqLvl: 33 }), // 120: level + 3 is fine
            weapon(102, MACE, 30, 10), // 90
            weapon(103, STAFF, 10, 30), // 110
            weapon(104, SWORD, 50, 5), // 115
            weapon(105, POLEARM, 0, 20), // 60
            weapon(106, AXE, 20, 20), // 100
            weapon(107, MACE, 5, 25), // 85
            weapon(108, STAFF, 40, 0), // 80
            weapon(109, SWORD, 0, 35), // 105
            weapon(110, POLEARM, 15, 15), // 75
            weapon(111, AXE, 25, 5), // 65
            weapon(112, MACE, 1, 30), // 92
            weapon(113, STAFF, 2, 15), // 49: 13th
            weapon(114, SWORD, 0, 10), // 30: 14th
        ]
        // Each would rank first; none may be a candidate.
        const unwearable = [
            weapon(201, AXE, 100, 100, { reqLvl: 34 }), // above level + 3
            weapon(202, AXE, 100, 100, { quality: 1 }), // common
            weapon(203, AXE, 100, 100, {
                // left out: no source and level 1
                reqLvl: 1,
                sources: [],
                scalingOptions: {
                    '0': {
                        stats: { [String(STAT.strength)]: 100 },
                        ilvl: 60,
                        unroundedDps: 100,
                    },
                },
            }),
            weapon(204, AXE, 100, 100, { classAllowlist: [1] }), // Warrior only
            weapon(205, AXE, 100, 100, { handType: ONE_HAND }),
        ]
        const candidates = weaponCandidates(
            LEVEL_30,
            [...unwearable, ...wearable],
            EP,
            WEAPON_DPS_EP,
            ALL_TWO_HAND_SKILLS
        )
        expect(ids(candidates)).toEqual([
            101, 104, 103, 109, 106, 112, 102, 107, 108, 110, 111, 105,
        ])
    })
})

type Player = { equipment: { items: { id?: number }[] } }

const playerOf = (request: RaidSimRequest) =>
    (request.raid as unknown as { parties: { players: Player[] }[] })
        .parties[0]!.players[0]!
const mainHandOf = (request: RaidSimRequest) =>
    playerOf(request).equipment.items[MAIN_HAND]?.id
const optionsOf = (request: RaidSimRequest) =>
    request.simOptions as { iterations?: number; randomSeed?: number }
/** The fight a request is for: its encounter and whether it's hit. */
const fightOf = (request: RaidSimRequest) =>
    JSON.stringify({
        encounter: request.encounter,
        tanks: (request.raid as { tanks?: unknown }).tanks,
    })

/**
 * The fake pool, scripted to keep every sim request. Every sheet call
 * answers Testchar's recorded sheet, so the sheet gate passes; the level
 * 60 sim answers the version's expected DPS; every other sim a recorded
 * result. Data files and weights come from the sim's build.
 */
async function recordingPool(sims: RaidSimRequest[]): Promise<SimPool> {
    const build = recordedPool()
    const fixture = (await Bun.file(FIXTURE).json()) as {
        profile: unknown
        fights: { fight_id: string; request: unknown }[]
    }
    const long = fixture.fights.find((f) => f.fight_id === 'dungeon-long')!
    const sheet = await recordedAnswer('sheet', long.request, fixture.profile)
    const result = Object.values(await recorded()).find(
        (value) =>
            typeof value === 'object' &&
            value !== null &&
            'raidMetrics' in value
    )
    expect(result).toBeDefined()
    const version = (await build.data('version.json')) as {
        l60_expected_dps: number
    }
    const l60Requests = new Set<unknown>()
    const withDps = (dps: number) => {
        const copy = structuredClone(result) as {
            raidMetrics: { parties: { players: { dps: { avg: number } }[] }[] }
        }
        copy.raidMetrics.parties[0]!.players[0]!.dps.avg = dps
        return copy
    }
    return recordedPool({
        sim: (request) => {
            if (l60Requests.has(request))
                return Promise.resolve(
                    withDps(version.l60_expected_dps) as never
                )
            sims.push(request)
            return Promise.resolve(structuredClone(result) as never)
        },
        sheet: () => Promise.resolve(structuredClone(sheet) as never),
        data: async (name) => {
            const value = await build.data(name)
            if (name === 'l60-test.in.json') l60Requests.add(value)
            return value
        },
    })
}

beforeAll(() => ensureSimBuild(), 600_000)

describe('simming the weapon candidates', () => {
    test('a run of Testchar with Two-Handed Axes and Staves skills sims 1 to 12 two-handed axes or staves, each and the worn set on dungeon-long with simOptions iterations 6000 and randomSeed 77', async () => {
        const sims: RaidSimRequest[] = []
        const pool = await recordingPool(sims)
        const testchar = await testcharCharacter(pool)
        const level = testchar.level
        const character = {
            ...testchar,
            weapon_skills: [
                { skill: 'WeaponSkillTwoHandedAxes', value: level * 5 },
                { skill: 'WeaponSkillStaves', value: level * 5 },
            ],
        }
        await simExport(
            exportFromCharacter(character, testchar.sheet),
            pool,
            () => {}
        )

        const worn = testchar.gear.main_hand?.id
        const long = fightOf(
            buildRequest(character as Character, 'dungeon-long', {
                seed: 77,
                iterations: 6000,
            })
        )
        const weaponSims = sims.filter((r) => optionsOf(r).randomSeed === 77)
        for (const request of weaponSims) {
            expect(optionsOf(request)).toMatchObject({
                iterations: 6000,
                randomSeed: 77,
            })
            expect(fightOf(request)).toBe(long)
        }
        // The worn set at the same settings, and every candidate.
        const mainHands = weaponSims.map(mainHandOf)
        expect(mainHands).toContain(worn)
        const candidates = [...new Set(mainHands)].filter((id) => id !== worn)
        expect(candidates.length).toBeGreaterThanOrEqual(1)
        expect(candidates.length).toBeLessThanOrEqual(12)

        const db = await loadItemDb(pool)
        for (const id of candidates) {
            const item = db.items.get(id!)
            expect(item?.handType).toBe(TWO_HAND)
            expect([AXE, STAFF]).toContain(item?.weaponType ?? -1)
        }

        // No other weapon is simmed at other settings: the plan's sims
        // only ever wear the worn main hand or a candidate.
        const others = sims
            .filter((r) => optionsOf(r).randomSeed !== 77)
            .map(mainHandOf)
            .filter((id) => id !== worn)
        for (const id of others) expect(candidates).toContain(id)
    }, 60_000)
})
