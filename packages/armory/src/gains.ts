/** How the page reads an alternative's gain (spec section 6). */
import type { ResultsFile } from './results-file'

export type SlotEntry = ResultsFile['slots'][number]
export type Item = NonNullable<SlotEntry['worn']>
export type Alternative = SlotEntry['alternatives'][number]

export type Gain = { value: number; unit: 'EP' | 'DPS' }

/** The gain the page shows: EP when it has one, else DPS; null when neither. */
export function gainOf(alternative: Alternative): Gain | null {
    if (alternative.gain_ep !== null)
        return { value: alternative.gain_ep, unit: 'EP' }
    if (alternative.gain_dps !== null)
        return { value: alternative.gain_dps, unit: 'DPS' }
    return null
}

/**
 * How far a slot is below the plan's item (and that item), or that it
 * wears it.
 */
export type SlotGap = { kind: 'gap'; gain: Gain; item: Item } | { kind: 'bis' }

/**
 * A slot's gap to the plan (spec section 4): the gain of the alternative
 * the plan puts in the slot, when it shows above 0.0; `bis` when the slot
 * has a worn item and alternatives and the plan keeps the worn item; null
 * otherwise (no plan, the plan's item not listed, no gain, no alternatives).
 *
 * @param entry - The slot as `slotEntry` gives it (a bag item put on counts
 * as worn).
 * @param plan - The plan, or null.
 * @returns The gap, `bis`, or null.
 */
export function slotGap(
    entry: SlotEntry | undefined,
    plan: Pick<ResultsFile['plans'][number], 'gear'> | null
): SlotGap | null {
    if (!entry || !plan || entry.alternatives.length === 0) return null
    const planItemId = plan.gear[entry.slot]
    if (entry.worn && planItemId === entry.worn.item_id) return { kind: 'bis' }
    const alternative = entry.alternatives.find(
        (candidate) => candidate.item.item_id === planItemId
    )
    if (!alternative) return null
    const gain = gainOf(alternative)
    return isUpgrade(gain)
        ? { kind: 'gap', gain, item: alternative.item }
        : null
}

/** `16.7`: a gap's shown value, one decimal, no sign. */
export function formatGap(gain: Gain): string {
    return Math.abs(shownValue(gain)).toFixed(1)
}

/**
 * The gain as the page shows it: rounded to one decimal, half away from
 * zero. Big or small and whether it is an upgrade at all are decided on this
 * value, so the badge never disagrees with its own number.
 */
export function shownValue(gain: Gain): number {
    const tenths = Math.round(Math.abs(gain.value) * 10)
    return tenths === 0 ? 0 : (Math.sign(gain.value) * tenths) / 10
}

/** `+6.0 DPS`, `-1.7 EP`: one decimal, always signed; never `-0.0`. */
export function formatGain(gain: Gain): string {
    const shown = shownValue(gain)
    const sign = shown < 0 ? '-' : '+'
    return `${sign}${Math.abs(shown).toFixed(1)} ${gain.unit}`
}

/** A big upgrade shows at least +15.0 EP or +3.0 DPS. */
export function gainSize(gain: Gain): 'big' | 'small' {
    const big = gain.unit === 'DPS' ? 3 : 15
    return shownValue(gain) >= big ? 'big' : 'small'
}

/** An upgrade shows a gain above +0.0. */
export function isUpgrade(gain: Gain | null): gain is Gain {
    return gain !== null && shownValue(gain) > 0
}
