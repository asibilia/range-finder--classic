/**
 * Reading a `RaidSimResult`: the character's DPS, what its damage came
 * from, when it ran out of mana, and its mana at the end of a fight.
 */
import type { RaidSimResult } from '@goturbo/sim'

import { SCHOOLS, type ResultsFile } from '../results-file'
import { SPELL_NAMES } from './rotation'

type ActionMetrics = {
    id?: { spellId?: number; itemId?: number; otherId?: string | number }
    spellSchool?: number
    targets?: { damage?: number; casts?: number }[]
}

export type UnitMetrics = {
    name?: string
    dps?: { avg?: number }
    tto?: { avg?: number }
    secondsOomAvg?: number
    actions?: ActionMetrics[]
    pets?: UnitMetrics[]
    timeline?: { tS?: number; dps?: number; mana?: number }[]
}

type Timeline = ResultsFile['results'][number]['timeline']

/**
 * The sim's per-second series as the results file keeps it: DPS to two
 * decimals and whole mana, as the runner's `results.ts` does. Null when
 * the sim kept none.
 */
export function timelineOf(unit: UnitMetrics): Timeline {
    const points = unit.timeline ?? []
    if (points.length === 0) return null
    return points.map((p) => ({
        t_s: p.tS ?? 0,
        dps: Math.round((p.dps ?? 0) * 100) / 100,
        mana: Math.round(p.mana ?? 0),
    }))
}

type RaidMetrics = { parties?: { players?: UnitMetrics[] }[] }

type Split = ResultsFile['results'][number]['damage_split']
type School = Split[number]['school']
export type Parts = Map<string, { damage: number; school: School }>

/** The character's metrics: the first player of the first party. */
export function playerOf(result: RaidSimResult): UnitMetrics {
    const raid = result.raidMetrics as RaidMetrics | undefined
    const player = raid?.parties?.[0]?.players?.[0]
    if (!player) throw new Error('The sim gave no result for the character.')
    return player
}

export function dpsOf(result: RaidSimResult): number {
    return playerOf(result).dps?.avg ?? 0
}

/** The spell school of a WoW school mask, when it names one. */
function schoolOf(mask: number | undefined): School {
    const bits: Record<number, (typeof SCHOOLS)[number]> = {
        1: 'physical',
        2: 'holy',
        4: 'fire',
        8: 'nature',
        16: 'frost',
        32: 'shadow',
        64: 'arcane',
    }
    return mask === undefined ? null : (bits[mask] ?? null)
}

function actionName(
    action: ActionMetrics,
    itemNames: (id: number) => string | undefined
): string {
    const id = action.id ?? {}
    if (id.otherId === 'OtherActionAttack' || id.otherId === 3) return 'Melee'
    if (id.spellId) return SPELL_NAMES.get(id.spellId) ?? `Spell ${id.spellId}`
    if (id.itemId) return itemNames(id.itemId) ?? `Item ${id.itemId}`
    return 'Other'
}

function damageOf(action: ActionMetrics): number {
    return (action.targets ?? []).reduce((sum, t) => sum + (t.damage ?? 0), 0)
}

function add(into: Parts, name: string, damage: number, school: School) {
    const part = into.get(name)
    if (part) part.damage += damage
    else into.set(name, { damage, school })
}

/** Damage done per part (by name), and its school, pets included. */
export function damageByPart(
    unit: UnitMetrics,
    itemNames: (id: number) => string | undefined,
    into: Parts = new Map()
): Parts {
    for (const action of unit.actions ?? []) {
        const damage = damageOf(action)
        if (damage > 0)
            add(
                into,
                actionName(action, itemNames),
                damage,
                schoolOf(action.spellSchool)
            )
    }
    for (const pet of unit.pets ?? []) {
        const damage = (pet.actions ?? []).reduce(
            (sum, action) => sum + damageOf(action),
            0
        )
        if (damage > 0) add(into, pet.name || 'Pet', damage, null)
    }
    return into
}

/** The damage split, biggest first, in whole percent; tiny parts dropped. */
export function damageSplit(parts: Parts): Split {
    const total = [...parts.values()].reduce((sum, p) => sum + p.damage, 0)
    if (total <= 0) return []
    const byShare = (a: Split[number], b: Split[number]) =>
        b.share_pct - a.share_pct || a.name.localeCompare(b.name)
    return [...parts.entries()]
        .map(([name, part]) => ({
            name,
            share_pct: Math.round((part.damage / total) * 100),
            school: part.school,
        }))
        .filter((part) => part.share_pct > 0)
        .sort(byShare)
}

/**
 * Seconds to the first out of mana, or `never` when no iteration ran dry.
 * The sim's estimate past the fight's end counts as never.
 */
export function outOfMana(
    unit: UnitMetrics,
    duration: number
): number | 'never' {
    const tto = unit.tto?.avg ?? 0
    if ((unit.secondsOomAvg ?? 0) <= 0 || tto <= 0 || tto >= duration)
        return 'never'
    return Math.round(tto * 10) / 10
}

/** Casts of a spell per iteration. */
export function castsOf(
    unit: UnitMetrics,
    spellId: number,
    iterations: number
): number {
    const casts = (unit.actions ?? [])
        .filter((a) => a.id?.spellId === spellId)
        .flatMap((a) => a.targets ?? [])
        .reduce((sum, t) => sum + (t.casts ?? 0), 0)
    return iterations > 0 ? casts / iterations : 0
}

/** The mana at the end of the last timeline bucket, if the sim kept one. */
export function manaAtEnd(unit: UnitMetrics): number | null {
    const points = unit.timeline ?? []
    const last = points[points.length - 1]
    return last?.mana ?? null
}
