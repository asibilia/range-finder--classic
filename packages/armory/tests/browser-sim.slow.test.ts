/**
 * The runner's core, ported to the browser (`src/browser-sim/`), driven
 * from outside under Bun with the real WASM: `simCharacter(character,
 * weights, pool, onProgress)` turns a character into a results file or a
 * stop. The character is Testchar's (`testcharCharacter(pool)`, from
 * `packages/sim/tests/helpers/testchar.ts`) until #83.
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
import {
    BAG_PREVIEW_FAILURE,
    bagPreviewGear,
    buildRequest,
    epTable,
    loadItemDb,
    planMaxDamage,
    simCharacter,
    type Character,
    type SimOutcome,
    type StatWeights,
} from '../src/browser-sim'
import { characterCalls } from '../src/browser-sim/sim-character'
import { simAll } from '../src/browser-sim/session'
import type { SpellNames } from '../src/browser-sim/sim-result'
import {
    initialPlannerState,
    wearAllBagItems,
    wearBagItem,
    wornResult,
} from '../src/planner-state'
import { readResultsFile, type ResultsFile } from '../src/results-file'

const ARMORY = join(import.meta.dir, '..')
const SIM_DIR = join(ARMORY, '../sim')
const BASE = pathToFileURL(join(SIM_DIR, 'build') + '/')

const SINGLE_FIGHTS = ['solo-hit-short', 'dungeon-short', 'dungeon-long']
const ALL_FIGHTS = [...SINGLE_FIGHTS, 'chain-solo']
const NOTES: Record<string, string> = {
    'real fights':
        "Not checked: the sim hasn't been compared with a real combat log for this character.",
    'mana model':
        "Untested: no combat log has been checked against the sim's mana use, so out-of-mana times and the chain fight are estimates.",
    'long-fight weights':
        "Low confidence: the 2-minute fight's stat weights lean on the mana model, which is untested.",
}
/** An item that only the "left out" rule keeps out of the plan. */
const MADE_UP_ID = 999_999_001

const pools: SimPool[] = []
function pool(): SimPool {
    const made = createSimPool({ base: BASE, size: 2 })
    pools.push(made)
    return made
}

beforeAll(() => ensureSimBuild(), 600_000)

afterAll(() => {
    for (const made of pools.splice(0)) made.close()
})

/** The results file's stat_weights array from the first real file. */
async function sampleWeights(): Promise<StatWeights> {
    const sample: ResultsFile = await Bun.file(
        join(ARMORY, 'src/sample-truncha-first-run.json')
    ).json()
    return sample.stat_weights
}

function run(
    character: TestcharCharacter,
    weights: StatWeights,
    on: SimPool
): Promise<SimOutcome> {
    return simCharacter(character, weights, on, () => {})
}

/** One passing run of Testchar, shared by the tests that read its file. */
let passing:
    Promise<{ character: TestcharCharacter; outcome: SimOutcome }> | undefined
function passingRun() {
    passing ??= (async () => {
        const on = pool()
        const character = await testcharCharacter(on)
        const outcome = await run(character, await sampleWeights(), on)
        return { character, outcome }
    })()
    return passing
}

function fileOf(outcome: SimOutcome): ResultsFile {
    expect(outcome.kind).toBe('file')
    if (outcome.kind !== 'file') throw new Error(`a ${outcome.kind} stop`)
    return outcome.file
}

const QUALITY = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary']

/** Two known, positive-EP bag upgrades in distinct armor slots. */
async function withTwoBags(character: TestcharCharacter, on: SimPool) {
    const weights = await sampleWeights()
    const db = await loadItemDb(on)
    const planned = planMaxDamage(
        character,
        db,
        epTable(weights),
        new Map(),
        weights
    )
    const alternatives = planned.slots
        .filter(
            (entry) =>
                ![
                    'finger_1',
                    'finger_2',
                    'trinket_1',
                    'trinket_2',
                    'main_hand',
                    'off_hand',
                    'relic',
                ].includes(entry.slot)
        )
        .flatMap((entry) => entry.alternatives.slice(0, 1))
        .filter(
            (alternative) =>
                (alternative.gain_ep ?? 0) > 0 &&
                alternative.item.required_level <= character.level
        )
        .slice(0, 2)
    expect(alternatives).toHaveLength(2)
    const bags: Character['bags'] = alternatives.map(({ item }) => ({
        id: item.item_id,
        name: item.name,
        quality: QUALITY.indexOf(item.quality),
        item_level: item.item_level ?? 0,
        required_level: item.required_level,
        equip_loc: '',
        stats: {},
    }))
    return { character: { ...character, bags } as Character, db }
}

const UNKNOWN_BAG = 999_999_202
const UNKNOWN_BAG_STRENGTH = 25

function withUnknownBag(character: TestcharCharacter): Character {
    return {
        ...character,
        bags: [
            {
                id: UNKNOWN_BAG,
                name: 'Exported Preview Helm',
                quality: 2,
                item_level: 35,
                required_level: character.level,
                equip_loc: 'INVTYPE_HEAD',
                stats: { ITEM_MOD_STRENGTH_SHORT: UNKNOWN_BAG_STRENGTH },
            },
        ],
    }
}

function hasUnknownPreviewStats(request: RaidSimRequest): boolean {
    const raid = request.raid as unknown as {
        parties: { players: { bonusStats?: { stats?: number[] } }[] }[]
    }
    return (
        raid.parties[0]!.players[0]!.bonusStats?.stats?.[STAT.strength] ===
        UNKNOWN_BAG_STRENGTH
    )
}

describe('simCharacter on Testchar with the real WASM', () => {
    test('gives a file readResultsFile accepts: provisional, worn and max-damage results on the three single fights and chain-solo, and the max-damage plan', async () => {
        const { outcome } = await passingRun()
        const file = fileOf(outcome)
        const read = readResultsFile(file)
        expect(read.ok ? 'ok' : JSON.stringify(read)).toBe('ok')
        expect(file.provisional).toBe(true)
        expect(file.fights.map((f) => f.fight_id).sort()).toEqual(
            [...ALL_FIGHTS].sort()
        )
        for (const fight of ALL_FIGHTS)
            for (const gear of ['worn', 'max-damage'])
                expect(
                    file.results.some(
                        (r) => r.gear === gear && r.fight_id === fight
                    )
                ).toBe(true)
        expect(file.plans.map((p) => p.plan_id)).toContain('max-damage')
    }, 1_200_000)

    test('run twice with the same character, weights and seeds, gives identical files apart from made_at', async () => {
        const { character, outcome } = await passingRun()
        const again = await run(
            structuredClone(character),
            await sampleWeights(),
            pool()
        )
        const withoutMadeAt = (file: ResultsFile) => {
            const copy: Partial<ResultsFile> = structuredClone(file)
            delete copy.made_at
            return copy
        }
        const first = fileOf(outcome)
        const second = fileOf(again)
        expect(second.made_at).toEqual(expect.any(String))
        expect(withoutMadeAt(second)).toEqual(withoutMadeAt(first))
    }, 1_200_000)

    test("the level-60 gate's detail names the 1e-9 tolerance", async () => {
        const { outcome } = await passingRun()
        const gate = fileOf(outcome).checks.find((c) =>
            /level[ -]?60/i.test(c.name)
        )
        expect(gate).toBeDefined()
        expect(gate!.passed).toBe(true)
        expect(gate!.detail).toContain('1e-9')
    }, 1_200_000)

    test('a passing run carries exactly three failed checks: the real fights, mana model and long-fight weights notes, with their neutral text', async () => {
        const { outcome } = await passingRun()
        const failed = fileOf(outcome).checks.filter((c) => !c.passed)
        expect(
            failed
                .map((c) => ({ name: c.name, detail: c.detail }))
                .sort((a, b) => a.name.localeCompare(b.name))
        ).toEqual(
            Object.entries(NOTES)
                .map(([name, detail]) => ({ name, detail }))
                .sort((a, b) => a.name.localeCompare(b.name))
        )
    }, 1_200_000)
})

describe('real bag previews', () => {
    test('match fresh sims on every fight, drive Equip/Equip all/Undo, and finish their progress budget', async () => {
        const on = pool()
        const { character, db } = await withTwoBags(
            await testcharCharacter(on),
            on
        )
        const reports: { done: number; planned: number }[] = []
        const outcome = await simCharacter(
            character,
            await sampleWeights(),
            on,
            (done, planned) => reports.push({ done, planned })
        )
        const file = fileOf(outcome)
        expect(file.bag_upgrades).toHaveLength(2)
        expect(
            new Set(file.bag_upgrades.map((upgrade) => upgrade.slot)).size
        ).toBe(2)
        expect(file.bag_upgrades_all).toBeDefined()
        expect(
            file.checks.filter((check) => check.name === 'bag_preview')
        ).toEqual([])
        expect(reports[0]?.planned).toBe(characterCalls(character))
        expect(characterCalls(character)).toBeGreaterThan(
            characterCalls({ ...character, bags: [] })
        )
        for (const [index, report] of reports.entries()) {
            expect(report.done).toBeLessThanOrEqual(report.planned)
            const before = reports[index - 1]
            if (before)
                expect(report.done * before.planned).toBeGreaterThanOrEqual(
                    before.done * report.planned
                )
        }
        expect(reports.at(-1)?.done).toBe(reports.at(-1)?.planned)

        const spellNames = (await on.data('spell-names.json')) as SpellNames
        const names = (id: number) => db.items.get(id)?.name
        const expectPreview = async (
            upgrades: ResultsFile['bag_upgrades'],
            results: ResultsFile['bag_upgrades'][number]['results']
        ) => {
            expect(results?.map((result) => result.fight_id)).toEqual(
                ALL_FIGHTS
            )
            if (!results) throw new Error('preview not simmed')
            const preview = bagPreviewGear(character, db, upgrades)
            const sheet = sheetFromSim(
                await on.sheet(
                    buildRequest(preview.character, 'dungeon-long', {
                        seed: 23,
                        iterations: 4000,
                        gear: preview.gear,
                    }),
                    character.profile
                )
            )
            const simmed = await simAll(
                on,
                preview.character,
                preview.gear,
                sheet,
                names,
                spellNames
            )
            expect(results).toEqual([
                ...simmed.singles.map((single) => single.result),
                simmed.chain,
            ])
        }
        for (const upgrade of file.bag_upgrades) {
            await expectPreview([upgrade], upgrade.results)
            const equipped = wearBagItem(
                file,
                initialPlannerState(file),
                upgrade.item.item_id
            )
            expect(equipped.bagOn).toEqual([upgrade.item.item_id])
            for (const result of upgrade.results!)
                expect(wornResult(file, equipped, result.fight_id)).toEqual({
                    gear: 'worn',
                    ...result,
                })
            const undone = wearBagItem(file, equipped, null)
            for (const fight of file.fights)
                expect(wornResult(file, undone, fight.fight_id)).toEqual(
                    file.results.find(
                        (result) =>
                            result.gear === 'worn' &&
                            result.fight_id === fight.fight_id
                    ) ?? null
                )
        }
        await expectPreview(file.bag_upgrades, file.bag_upgrades_all?.results)
        const all = wearAllBagItems(file, initialPlannerState(file))
        expect(all.bagOn).toEqual(
            file.bag_upgrades.map((upgrade) => upgrade.item.item_id)
        )
        for (const result of file.bag_upgrades_all!.results)
            expect(wornResult(file, all, result.fight_id)).toEqual({
                gear: 'worn',
                ...result,
            })
        expect(wearBagItem(file, all, null).bagOn).toEqual([])
    }, 1_200_000)

    test('an optional preview failure keeps the main file and adds only the exact not-checked row', async () => {
        const real = pool()
        const character = withUnknownBag(await testcharCharacter(real))
        const failing: SimPool = {
            ...real,
            size: real.size,
            sheet: (request, profile) =>
                hasUnknownPreviewStats(request)
                    ? Promise.reject(new Error('preview failed'))
                    : real.sheet(request, profile),
        }
        const outcome = await simCharacter(
            character,
            await sampleWeights(),
            failing,
            () => {}
        )
        const file = fileOf(outcome)
        expect(file.results).toHaveLength(ALL_FIGHTS.length * 2)
        expect(file.bag_upgrades).toHaveLength(1)
        expect(file.bag_upgrades[0]!.results).toBeNull()
        expect(file.bag_upgrades_all).toBeUndefined()
        expect(
            file.checks.filter((check) => check.name === 'bag_preview')
        ).toEqual([BAG_PREVIEW_FAILURE])
    }, 1_200_000)

    test('a main long-fight failure still rejects instead of becoming a bag_preview note', async () => {
        const real = pool()
        const character = withUnknownBag(await testcharCharacter(real))
        const failing: SimPool = {
            ...real,
            size: real.size,
            sim: (request, profile) => {
                const options = request.simOptions as
                    { randomSeed?: number; iterations?: number } | undefined
                const encounter = request.encounter as { duration?: number }
                if (
                    !hasUnknownPreviewStats(request) &&
                    options?.randomSeed === 23 &&
                    options.iterations === 4000 &&
                    encounter.duration === 120
                )
                    return Promise.reject(new Error('main fight failed'))
                return real.sim(request, profile)
            },
        }
        await expect(
            simCharacter(character, await sampleWeights(), failing, () => {})
        ).rejects.toThrow('main fight failed')
    }, 1_200_000)
})

describe('the ported request builder', () => {
    test("with Testchar, seed 23 and 2000 iterations, gives the fixture's recorded DPS on the three single fights within 1e-9 relative", async () => {
        const fixture = (await Bun.file(
            join(SIM_DIR, 'fixtures/testchar-l30.json')
        ).json()) as { fights: { fight_id: string; worn_dps: number }[] }
        const on = pool()
        const character = await testcharCharacter(on)
        for (const id of SINGLE_FIGHTS) {
            const expected = fixture.fights.find((f) => f.fight_id === id)!
            const result = (await on.sim(
                buildRequest(character, id, { seed: 23, iterations: 2000 }),
                character.profile
            )) as {
                raidMetrics: {
                    parties: { players: { dps: { avg: number } }[] }[]
                }
            }
            const dps = result.raidMetrics.parties[0]!.players[0]!.dps.avg
            const relative =
                Math.abs(dps - expected.worn_dps) / expected.worn_dps
            expect(relative).toBeLessThanOrEqual(1e-9)
        }
    }, 1_200_000)
})

describe('simCharacter stops and leaves out', () => {
    test('a sheet with Strength 10 higher than the sim says returns a gates stop naming sheet strength, and no file', async () => {
        const on = pool()
        const character = structuredClone(await testcharCharacter(on))
        character.sheet.strength += 10
        const outcome = await run(character, await sampleWeights(), on)
        expect(outcome.kind).toBe('gates')
        expect(outcome).not.toHaveProperty('file')
        if (outcome.kind !== 'gates') throw new Error('not a gates stop')
        const strength = outcome.failed.find((c) => c.name === 'sheet strength')
        expect(strength).toBeDefined()
        expect(strength!.passed).toBe(false)
    }, 1_200_000)

    test('a Warrior with every talent point in Arms returns an unsupported stop before any sim or sheet call', async () => {
        const real = pool()
        const character = structuredClone(await testcharCharacter(real))
        character.class = 'Warrior'
        character.profile.class = 'ClassWarrior'
        // Every point moves into the first tree, Arms.
        character.talents = character.talents.replace(/-/g, '')

        const calls: string[] = []
        const counting: SimPool = {
            ...real,
            size: real.size,
            sim: (...args) => {
                calls.push('sim')
                return real.sim(...args)
            },
            sheet: (...args) => {
                calls.push('sheet')
                return real.sheet(...args)
            },
            batch: (planned) => real.batch(planned),
        }
        const outcome = await run(character, await sampleWeights(), counting)
        expect(outcome).toEqual({
            kind: 'unsupported',
            class: 'Warrior',
            spec: 'Arms',
        })
        expect(calls).toEqual([])
    }, 1_200_000)

    test('an unconfirmed item (no source, no level requirement) is in left_out_items, never in alternatives or the plan', async () => {
        const real = pool()
        const character = await testcharCharacter(real)
        // A leather helm far better than anything worn, that no source
        // confirms and that needs level 1 (a missing reqLvl means 60).
        const madeUp = {
            id: MADE_UP_ID,
            name: 'Made-up Helm',
            icon: 'inv_helmet_01',
            type: 1,
            armorType: 2,
            reqLvl: 1,
            phase: 1,
            quality: 4,
            scalingOptions: {
                '0': {
                    randPropPoints: 20,
                    stats: { '0': 120, '1': 120, '2': 60, '3': 60 },
                    ilvl: 35,
                },
            },
        }
        const withMadeUp: SimPool = {
            ...real,
            size: real.size,
            async data(name) {
                const data = await real.data(name)
                if (name === 'db.json') {
                    const db = data as { items: unknown[] }
                    return { ...db, items: [...db.items, madeUp] }
                }
                if (name === 'item_first_seen.json' && Array.isArray(data))
                    return [...data, { id: MADE_UP_ID, firstSeen: 1794294967 }]
                return data
            },
        }
        const outcome = await run(character, await sampleWeights(), withMadeUp)
        const file = fileOf(outcome)
        expect((file.left_out_items ?? []).map((i) => i.item_id)).toContain(
            MADE_UP_ID
        )
        for (const slot of file.slots)
            expect(slot.alternatives.map((a) => a.item.item_id)).not.toContain(
                MADE_UP_ID
            )
        for (const plan of file.plans)
            expect(Object.values(plan.gear)).not.toContain(MADE_UP_ID)
    }, 1_200_000)
})
