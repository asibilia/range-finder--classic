/**
 * Optional per-item and combined bag previews: eligibility, immutable gear
 * swaps, real sheets/fight results, and non-blocking preview failures.
 */
import { sheetFromSim, SimCancelled, type SimPool } from '@goturbo/sim'

import type { Check, ResultsFile } from '../results-file'
import { wornGear, type Character, type Gear } from './character'
import type { ItemDb } from './gear'
import type { GearPlan } from './plan'
import { buildRequest } from './request'
import {
    chainFor,
    DEFAULT_FIGHT,
    type FightOverride,
    scenariosFor,
} from './scenarios'
import {
    FIGHT_ITERATIONS,
    FIGHT_SEED,
    simAll,
    type FightResult,
} from './session'
import type { SpellNames } from './sim-result'

export const BAG_PREVIEW_FAILURE: Check = {
    name: 'bag_preview',
    passed: false,
    not_checked: true,
    detail: 'Not simmed: the bag preview failed; its Equip control is unavailable.',
}

export type BagPreviewWork = {
    upgrades: ResultsFile['bag_upgrades']
    combined: boolean
    calls: number
}

function gearCalls(level: number): number {
    return 1 + scenariosFor(level).length + chainFor(level).pulls
}

/** The eligible per-item previews and whether the combined preview applies. */
export function bagPreviewWork(
    planned: Pick<GearPlan, 'bag_upgrades' | 'left_out_items'>,
    level: number
): BagPreviewWork {
    const leftOut = new Set(planned.left_out_items.map((item) => item.item_id))
    const upgrades = planned.bag_upgrades.filter(
        (upgrade) => upgrade.gain_ep > 0 && !leftOut.has(upgrade.item.item_id)
    )
    const combined =
        upgrades.length === planned.bag_upgrades.length &&
        upgrades.length >= 2 &&
        new Set(upgrades.map((upgrade) => upgrade.slot)).size ===
            upgrades.length
    return {
        upgrades,
        combined,
        calls: (upgrades.length + (combined ? 1 : 0)) * gearCalls(level),
    }
}

/** The most preview calls a character can need before its plan is ranked. */
export function bagPreviewAllowance(character: Character): number {
    const items = new Set((character.bags ?? []).map((item) => item.id)).size
    return (items + (items >= 2 ? 1 : 0)) * gearCalls(character.level)
}

/** Worn gear with bag items on, without changing the source character. */
export function bagPreviewGear(
    character: Character,
    db: ItemDb,
    upgrades: ResultsFile['bag_upgrades']
): { character: Character; gear: Gear } {
    const gear = wornGear(character)
    const unknown: NonNullable<Character['unknown_gear']> = {
        ...character.unknown_gear,
    }
    for (const upgrade of upgrades) {
        const id = upgrade.item.item_id
        const bag = (character.bags ?? []).find((item) => item.id === id)
        if (!bag) throw new Error(`Bag item ${id} is missing from the export.`)
        gear[upgrade.slot] = { id }
        delete unknown[upgrade.slot]
        if (!db.items.has(id))
            unknown[upgrade.slot] = { id, name: bag.name, stats: bag.stats }
    }
    return { character: { ...character, unknown_gear: unknown }, gear }
}

type PreviewInput = {
    pool: SimPool
    character: Character
    db: ItemDb
    planned: Pick<GearPlan, 'bag_upgrades'>
    work: BagPreviewWork
    names: (id: number) => string | undefined
    spellNames: SpellNames
    fight?: FightOverride
}

/** Sims only the optional previews; a failure never discards the main run. */
export async function simBagPreviews({
    pool,
    character,
    db,
    planned,
    work,
    names,
    spellNames,
    fight,
}: PreviewInput): Promise<{
    bag_upgrades: ResultsFile['bag_upgrades']
    bag_upgrades_all: ResultsFile['bag_upgrades_all']
    checks: Check[]
}> {
    const checks: Check[] = []
    const run = async (
        selected: ResultsFile['bag_upgrades']
    ): Promise<FightResult[]> => {
        const preview = bagPreviewGear(character, db, selected)
        const sheet = sheetFromSim(
            await pool.sheet(
                buildRequest(preview.character, DEFAULT_FIGHT, {
                    seed: FIGHT_SEED,
                    iterations: FIGHT_ITERATIONS,
                    gear: preview.gear,
                }),
                character.profile
            )
        )
        const simmed = await simAll(
            pool,
            preview.character,
            preview.gear,
            sheet,
            names,
            spellNames,
            fight
        )
        return [...simmed.singles.map((single) => single.result), simmed.chain]
    }
    const optional = async (selected: ResultsFile['bag_upgrades']) => {
        try {
            return await run(selected)
        } catch (error) {
            if (error instanceof SimCancelled) throw error
            checks.push({ ...BAG_PREVIEW_FAILURE })
            return null
        }
    }

    const [perItem, combined] = await Promise.all([
        Promise.all(work.upgrades.map((upgrade) => optional([upgrade]))),
        work.combined ? optional(work.upgrades) : Promise.resolve(null),
    ])
    const results = new Map(
        work.upgrades.map((upgrade, index) => [
            upgrade.item.item_id,
            perItem[index],
        ])
    )
    return {
        bag_upgrades: planned.bag_upgrades.map((upgrade) => {
            if (!work.upgrades.includes(upgrade)) return { ...upgrade }
            return {
                ...upgrade,
                results: results.get(upgrade.item.item_id) ?? null,
            }
        }),
        bag_upgrades_all: combined ? { results: combined } : null,
        checks,
    }
}
