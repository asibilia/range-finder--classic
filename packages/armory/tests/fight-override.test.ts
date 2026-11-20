/**
 * Run Simulator's fight settings in the browser sim (`scenariosFor`,
 * `chainFor`, `fightEntry`, `buildRequest`): with them, the long dungeon
 * fight takes the enemy level, the length and the starting mana, and the
 * chain the gap between pulls; without them, the fixed fights are as they
 * were, so the default run's numbers don't change.
 */
import { describe, expect, test } from 'bun:test'

import { testcharCharacter } from '../../sim/tests/helpers/testchar'
import {
    buildRequest,
    chainFor,
    scenariosFor,
    type Character,
} from '../src/browser-sim'
import { fightEntry } from '../src/browser-sim/scenarios'
import { recordedPool } from './helpers/recorded-pool'

const OVERRIDE = {
    target_level: 36,
    duration_s: 60,
    starting_mana_pct: 50,
}

describe('the fight settings in the browser sim', () => {
    test('without settings the fights are the fixed ones; with them only the long dungeon fight changes', () => {
        const fixed = scenariosFor(30)
        expect(scenariosFor(30, undefined)).toEqual(fixed)
        const set = scenariosFor(30, OVERRIDE)
        expect(set.map((s) => s.fight_id)).toEqual(fixed.map((s) => s.fight_id))
        expect(set.filter((s) => s.fight_id !== 'dungeon-long')).toEqual(
            fixed.filter((s) => s.fight_id !== 'dungeon-long')
        )
        const long = set.find((s) => s.fight_id === 'dungeon-long')!
        expect(long).toMatchObject({
            label: 'Dungeon, 1 min vs level 36',
            target_level: 36,
            duration_s: 60,
            starting_mana_pct: 50,
            being_hit: false,
            totems: true,
        })
        expect(fightEntry(long).setup?.starting_mana_pct).toBe(50)
        expect(fixed.every((s) => s.starting_mana_pct === undefined)).toBe(true)
        expect(fightEntry(fixed[2]!).setup?.starting_mana_pct).toBe(100)
        expect(scenariosFor(30, { ...OVERRIDE, chain_only: true })).toEqual(
            fixed
        )
    })

    test('full mana is no share; the chain takes a gap, and keeps 12 s without one', () => {
        const long = scenariosFor(30, {
            ...OVERRIDE,
            starting_mana_pct: 100,
        }).find((s) => s.fight_id === 'dungeon-long')!
        expect(long.starting_mana_pct).toBeUndefined()
        expect(chainFor(30).gap_s).toBe(12)
        expect(chainFor(30).label).toBe(
            'Chain, 10 pulls 12 s apart vs level 30'
        )
        expect(chainFor(30, 20)).toMatchObject({
            gap_s: 20,
            label: 'Chain, 10 pulls 20 s apart vs level 30',
        })
    })

    test("the long fight's request: the level, the length and startingManaPercent; the fixed one has no startingManaPercent", async () => {
        const character = (await testcharCharacter(recordedPool())) as Character
        const player = (request: ReturnType<typeof buildRequest>) =>
            (
                request.raid as {
                    parties: { players: Record<string, unknown>[] }[]
                }
            ).parties[0]!.players[0]!
        const settings = { seed: 1, iterations: 1 }
        const fixed = buildRequest(character, 'dungeon-long', settings)
        expect('startingManaPercent' in player(fixed)).toBe(false)
        const long = scenariosFor(character.level, OVERRIDE).find(
            (s) => s.fight_id === 'dungeon-long'
        )!
        const request = buildRequest(character, long, settings)
        expect(player(request).startingManaPercent).toBe(50)
        const encounter = request.encounter as {
            duration: number
            targets: { level: number }[]
        }
        expect(encounter.duration).toBe(60)
        expect(encounter.targets[0]!.level).toBe(36)
        // A chain's later pull keeps its own share.
        expect(
            player(
                buildRequest(character, long, {
                    ...settings,
                    startingManaPct: 20,
                })
            ).startingManaPercent
        ).toBe(20)
    })
})
