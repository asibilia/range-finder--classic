/**
 * How a gain reads: one decimal, and big or small decided on that shown
 * value, so a gain shown as +15.0 EP is never drawn small. A gain that shows
 * as +0.0 or less is no upgrade.
 */
import { describe, expect, test } from 'bun:test'

import {
    type Alternative,
    formatGain,
    type Gain,
    gainSize,
    type SlotEntry,
    slotGap,
} from '../src/gains'

const ep = (value: number): Gain => ({ value, unit: 'EP' })
const dps = (value: number): Gain => ({ value, unit: 'DPS' })

/** A plan that puts the test ring (item 1) in `finger_1`. */
const planWithRing = { gear: { finger_1: 1 } } as unknown as Parameters<
    typeof slotGap
>[1]

/** A slot whose one alternative, the plan's item, gains `gain_ep`. */
function slotGaining(gain_ep: number | null, gain_dps: number | null = null) {
    const item = {
        item_id: 1,
        name: 'Test Ring',
        quality: 'uncommon',
        item_level: null,
        required_level: 1,
        source: { kind: 'unknown', text: 'Source unknown' },
        data: 'forever',
    } as Alternative['item']
    return {
        slot: 'finger_1',
        worn: null,
        alternatives: [{ item, gain_ep, gain_dps }],
    } as SlotEntry
}

describe('big and small gains', () => {
    test('15.0 EP is big, 14.96 EP shows +15.0 EP and is big, 14.94 EP is small', () => {
        expect(gainSize(ep(15))).toBe('big')
        expect(formatGain(ep(14.96))).toBe('+15.0 EP')
        expect(gainSize(ep(14.96))).toBe('big')
        expect(formatGain(ep(14.94))).toBe('+14.9 EP')
        expect(gainSize(ep(14.94))).toBe('small')
    })

    test('3.0 DPS is big, 2.96 DPS is big, 2.94 DPS is small', () => {
        expect(gainSize(dps(3))).toBe('big')
        expect(formatGain(dps(2.96))).toBe('+3.0 DPS')
        expect(gainSize(dps(2.96))).toBe('big')
        expect(gainSize(dps(2.94))).toBe('small')
    })
})

describe('what counts as an upgrade', () => {
    test('a gain of 0.04 EP shows as +0.0, so it is no upgrade', () => {
        expect(slotGap(slotGaining(0.04), planWithRing)).toBeNull()
    })

    test('a gain of 0.05 EP is an upgrade of +0.1 EP, drawn small', () => {
        const gap = slotGap(slotGaining(0.05), planWithRing)
        expect(gap?.kind).toBe('gap')
        if (gap?.kind !== 'gap') return
        expect(formatGain(gap.gain)).toBe('+0.1 EP')
        expect(gainSize(gap.gain)).toBe('small')
    })

    test('a gain of -0.04 EP shows +0.0 EP, not -0.0', () => {
        expect(formatGain(ep(-0.04))).toBe('+0.0 EP')
    })

    test('an alternative with gain_ep and gain_dps both null is no upgrade', () => {
        expect(slotGap(slotGaining(null, null), planWithRing)).toBeNull()
    })
})
