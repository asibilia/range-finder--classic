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

/** `+6.0 DPS`, `-1.7 EP`: one decimal, always signed. */
export function formatGain(gain: Gain): string {
    const sign = gain.value < 0 ? '-' : '+'
    return `${sign}${Math.abs(gain.value).toFixed(1)} ${gain.unit}`
}

/** A big upgrade is at least 15 EP or 3 DPS. */
export function gainSize(gain: Gain): 'big' | 'small' {
    const big = gain.unit === 'DPS' ? 3 : 15
    return gain.value >= big ? 'big' : 'small'
}

/** The slot's best upgrade: its first alternative, when it gains anything. */
export function bestUpgrade(
    entry: SlotEntry | undefined
): { item: Item; gain: Gain } | null {
    const first = entry?.alternatives[0]
    if (!first) return null
    const gain = gainOf(first)
    if (!gain || gain.value <= 0) return null
    return { item: first.item, gain }
}
