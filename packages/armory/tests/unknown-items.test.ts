/**
 * Worn and bag items the sim's item data lacks never stop the run (the
 * runner's `bonusStats` on `Character`, `wearing()` in `emit.ts` and
 * `ITEM_MOD_TO_STAT` in `export.ts`): a worn one is left out of the
 * request's equipment and its game stats become bonus stats, a bag one is
 * compared by its game stats, and an unknown main hand is a clear stop.
 * Checked from outside: the character an export reads into, the requests
 * the pool is sent, the plan and the stop's words.
 */
import { describe, expect, test } from 'bun:test'

import type { Character } from '../src/browser-sim'
import type { DbItem } from '../src/browser-sim/gear'
import { planMaxDamage } from '../src/browser-sim/plan'
import { STAT_STEPS } from '../src/browser-sim/weights'
import { stopLines } from '../src/components/bring-in'
import type { Stat } from '../src/results-file'
import { syntheticDb } from './helpers/synthetic-db'

/** The made-up main hand of the stop. */
const UNKNOWN_MAIN_HAND = 999_999

describe('an unknown main hand', () => {
    test("the page words the unknown_main_hand stop for 999999 as The sim doesn't know your main-hand weapon (item 999999).", () => {
        expect(
            stopLines({ kind: 'unknown_main_hand', item_id: UNKNOWN_MAIN_HAND })
        ).toEqual(["The sim doesn't know your main-hand weapon (item 999999)."])
    })
})

/** Every weighed stat worth 1 EP. */
const EP = new Map<Stat, number>(STAT_STEPS.map((step) => [step.stat, 1]))

describe('a bag item the sim lacks', () => {
    test("a bag helm the sim lacks, 20 EP by its game stats over a worn 5 EP helm, is in bag_upgrades for the head at +15 EP with the game's name; one worth less than the worn helm is not", () => {
        const wornHelm: DbItem = {
            id: 70_101,
            name: 'Worn Helm',
            type: 1,
            armorType: 2,
            quality: 2,
            reqLvl: 20,
            sources: [{ drop: { otherName: 'Some Boss' } }],
            scalingOptions: { '0': { stats: { '0': 5 }, ilvl: 25 } },
        }
        const bagItem = (
            id: number,
            name: string,
            stats: Record<string, number>
        ) => ({
            id,
            name,
            quality: 2,
            item_level: 30,
            required_level: 25,
            equip_loc: 'INVTYPE_HEAD',
            stats,
        })
        const character = {
            name: 'Levelling',
            level: 30,
            race: 'Orc',
            class: 'Shaman',
            talents: '',
            gear: { head: { id: wornHelm.id } },
            bags: [
                bagItem(999_999_201, 'Odd Helm', {
                    ITEM_MOD_STRENGTH_SHORT: 12,
                    ITEM_MOD_AGILITY_SHORT: 8,
                }),
                bagItem(999_999_202, 'Weak Helm', {
                    ITEM_MOD_STRENGTH_SHORT: 2,
                }),
            ],
            imbue: null,
            known_spells: [],
            export_saved_at: '2026-11-16T00:00:00Z',
            game_build: '1.15.8',
        } as unknown as Character

        const plan = planMaxDamage(
            character,
            syntheticDb([wornHelm]),
            EP,
            new Map()
        )
        const upgrades = plan.bag_upgrades.map((upgrade) => ({
            slot: upgrade.slot,
            item_id: upgrade.item.item_id,
            name: upgrade.item.name,
            gain_ep: upgrade.gain_ep,
        }))
        expect(upgrades).toContainEqual({
            slot: 'head',
            item_id: 999_999_201,
            name: 'Odd Helm',
            gain_ep: 15,
        })
        expect(upgrades.map((upgrade) => upgrade.item_id)).not.toContain(
            999_999_202
        )
    })
})
