/** How the page reads an alternative's gain (spec section 6). */
import type { ResultsFile } from './results-file'

export type SlotEntry = ResultsFile['slots'][number]
export type Item = NonNullable<SlotEntry['worn']>
export type Alternative = SlotEntry['alternatives'][number]

export type Gain = { value: number; unit: 'EP' | 'DPS' }

/** The gain the sim used: DPS when it has one, else EP; null when neither. */
export function gainOf(alternative: Alternative): Gain | null {
    if (alternative.gain_dps !== null)
        return { value: alternative.gain_dps, unit: 'DPS' }
    if (alternative.gain_ep !== null)
        return { value: alternative.gain_ep, unit: 'EP' }
    return null
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

/** The slot's best upgrade: its first alternative, when it gains anything. */
export function bestUpgrade(
    entry: SlotEntry | undefined
): { item: Item; gain: Gain } | null {
    const first = entry?.alternatives[0]
    if (!first) return null
    const gain = gainOf(first)
    if (!isUpgrade(gain)) return null
    return { item: first.item, gain }
}
