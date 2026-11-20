/**
 * Real-result metadata (#136): weapon EP uses the AP weight of the fight the
 * weapon was simmed on; melee miss follows the native attack table; professions
 * come only from the export's profession skill rows.
 */
import { describe, expect, test } from 'bun:test'

import type { Character } from '../src/browser-sim/character'
import { readProfessions } from '../src/browser-sim/export-reader'
import type { DbItem } from '../src/browser-sim/gear'
import { planMaxDamage, weaponGainEp } from '../src/browser-sim/plan'
import { meleeMissPct } from '../src/browser-sim/scenarios'
import type { SavedValue } from '../src/browser-sim/saved-variables'
import type { StatWeights } from '../src/browser-sim/weights'
import type { Stat } from '../src/results-file'
import { syntheticDb } from './helpers/synthetic-db'

function weights(...fights: [string, number][]): StatWeights {
    return fights.map(([fight_id, ep]) => ({
        fight_id,
        weights: [{ stat: 'attack_power', ep }],
    }))
}

function parseProfessions(rows: unknown) {
    return readProfessions(rows as SavedValue)
}

describe('weapon gain_ep', () => {
    test("uses the same fight's AP weight at multiple fights and levels, and rounds to two decimals", () => {
        const cases = [
            {
                level: 30,
                gain: 1.234,
                fight: 'dungeon-long',
                all: weights(
                    ['solo-hit-short', 2],
                    ['dungeon-long', 4],
                    ['chain-solo', 8]
                ),
                expected: 0.31,
            },
            {
                level: 45,
                gain: 1.234,
                fight: 'solo-hit-short',
                all: weights(
                    ['solo-hit-short', 2],
                    ['dungeon-long', 4],
                    ['chain-solo', 8]
                ),
                expected: 0.62,
            },
            {
                level: 45,
                gain: 3.456,
                fight: 'chain-solo',
                all: weights(
                    ['solo-hit-short', 2],
                    ['dungeon-long', 4],
                    ['chain-solo', 8]
                ),
                expected: 0.43,
            },
        ]
        for (const { level, gain, fight, all, expected } of cases)
            expect([level, weaponGainEp(gain, all, fight)]).toEqual([
                level,
                expected,
            ])
    })

    test('is null for an absent or non-finite gain, or a missing, non-finite or nonpositive same-fight AP weight', () => {
        const valid = weights(['dungeon-long', 2])
        for (const gain of [undefined, null, NaN, Infinity, -Infinity])
            expect(weaponGainEp(gain, valid, 'dungeon-long')).toBeNull()
        expect(weaponGainEp(1, undefined, 'dungeon-long')).toBeNull()
        expect(
            weaponGainEp(1, weights(['solo-hit-short', 2]), 'dungeon-long')
        ).toBeNull()
        for (const ap of [NaN, Infinity, -Infinity, 0, -2])
            expect(
                weaponGainEp(1, weights(['dungeon-long', ap]), 'dungeon-long')
            ).toBeNull()
    })

    test('the plan emits weapon gain_ep and retains gain_dps', () => {
        const weapon: DbItem = {
            id: 70_101,
            name: 'Reference Axe',
            type: 13,
            weaponType: 1,
            handType: 4,
            weaponSpeed: 3.5,
            quality: 3,
            reqLvl: 25,
            sources: [{ drop: { otherName: 'Some Boss' } }],
            scalingOptions: {
                '0': { ilvl: 35, unroundedDps: 30 },
            },
        }
        const character = {
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
        const plan = planMaxDamage(
            character,
            syntheticDb([weapon]),
            new Map<Stat, number>(),
            new Map([[weapon.id, 2.345]]),
            weights(['dungeon-long', 2])
        )
        const alternative = plan.slots
            .find((slot) => slot.slot === 'main_hand')!
            .alternatives.find((entry) => entry.item.item_id === weapon.id)!
        expect(alternative.gain_ep).toBe(1.17)
        expect(alternative.gain_dps).toBe(2.3)
    })
})

function attackCharacter(level: number, deficit: number, hit: number) {
    return {
        level,
        weapon_skill_deficit: deficit,
        sheet: { melee_hit_pct: hit },
    } as Pick<Character, 'level' | 'weapon_skill_deficit' | 'sheet'>
}

describe('melee_miss_pct', () => {
    test('matches native attack-table cases at multiple target levels, weapon skills and hit values', () => {
        const cases: [
            level: number,
            target: number,
            deficit: number,
            hit: number,
            dualWield: boolean,
            expected: number,
        ][] = [
            [30, 30, 0, 0, false, 5],
            [30, 31, 0, 0, false, 5.5],
            [30, 32, 0, 0, false, 6],
            [30, 33, 0, 0, false, 8],
            [30, 33, 0, 3, false, 5],
            [30, 33, 0, 9, false, 0],
            [30, 33, 0, -2, false, 8],
            [30, 30, 5, 0, false, 5.5],
            [30, 33, -5, 0, false, 6],
            [32, 34, 7, 1.5, false, 6.9],
            [30, 45, 0, 0, false, 15],
            [30, 25, 0, 0, false, 2.5],
            [30, 33, 0, 0, true, 27],
        ]
        for (const [level, target, deficit, hit, dualWield, expected] of cases)
            expect({
                level,
                target,
                deficit,
                hit,
                dualWield,
                miss: meleeMissPct(
                    attackCharacter(level, deficit, hit),
                    target,
                    dualWield
                ),
            }).toEqual({
                level,
                target,
                deficit,
                hit,
                dualWield,
                miss: expected,
            })
    })
})

describe('character.professions', () => {
    test('emits every supported primary and secondary profession in contract order', () => {
        const names = [
            'Alchemy',
            'Blacksmithing',
            'Enchanting',
            'Engineering',
            'Herbalism',
            'Jewelcrafting',
            'Leatherworking',
            'Mining',
            'Skinning',
            'Tailoring',
            'First Aid',
            'Cooking',
            'Fishing',
        ]
        const rows = [...names].reverse().map((name, index) => ({
            name,
            rank: index + 1,
            maxRank: 300,
            modifier: 0,
        }))
        expect(parseProfessions(rows)).toEqual(
            names
                .map((name) => ({ name, skill: 0, max: 0 }))
                .map((profession, index) => ({
                    ...profession,
                    skill: names.length - index,
                    max: 300,
                }))
        )
    })

    test('adds modifiers, deduplicates by name keeping the higher skill, and excludes non-profession skills', () => {
        expect(
            parseProfessions([
                {
                    name: 'Leatherworking',
                    rank: 140,
                    maxRank: 150,
                    modifier: 0,
                },
                {
                    name: 'Leatherworking',
                    rank: 150,
                    maxRank: 225,
                    modifier: 20,
                },
                {
                    name: 'Leatherworking',
                    rank: 160,
                    maxRank: 225,
                    modifier: 5,
                },
                { name: 'Cooking', rank: 150, maxRank: 225, modifier: -10 },
                { name: 'Cooking', rank: 100, maxRank: 150, modifier: 0 },
                { name: 'Axes', rank: 150, maxRank: 150, modifier: 0 },
                { name: 'Common', rank: 300, maxRank: 300, modifier: 0 },
                { name: 'Cloth', rank: 1, maxRank: 1, modifier: 0 },
                { name: 'Enhancement', rank: 1, maxRank: 1, modifier: 0 },
                { name: 'Defense', rank: 150, maxRank: 150, modifier: 0 },
                { name: 'Inscription', rank: 100, maxRank: 150, modifier: 0 },
            ])
        ).toEqual([
            { name: 'Leatherworking', skill: 170, max: 225 },
            { name: 'Cooking', skill: 140, max: 225 },
        ])
    })

    test('skips malformed rows and emits an empty list when no professions parse', () => {
        expect(
            parseProfessions([
                null,
                'Mining',
                { name: 'Alchemy', rank: '100', maxRank: 150, modifier: 0 },
                { name: 'Blacksmithing', rank: 100, modifier: 0 },
                { name: 'Engineering', rank: 100, maxRank: 150, modifier: '5' },
                { name: 'Herbalism', rank: 1.5, maxRank: 150, modifier: 0 },
                { name: 'Jewelcrafting', rank: NaN, maxRank: 150, modifier: 0 },
                { name: 'Tailoring', rank: 100, maxRank: -1, modifier: 0 },
                { name: 'First Aid', rank: 1, maxRank: 75, modifier: -2 },
                { name: 'Mining', rank: 75, maxRank: 150, modifier: 5 },
            ])
        ).toEqual([{ name: 'Mining', skill: 80, max: 150 }])
        expect(parseProfessions([])).toEqual([])
        expect(parseProfessions(undefined)).toEqual([])
        expect(
            parseProfessions([
                { name: 'Axes', rank: 150, maxRank: 150, modifier: 0 },
            ])
        ).toEqual([])
    })
})
