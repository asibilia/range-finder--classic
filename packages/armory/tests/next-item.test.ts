/**
 * The `Next:` item (`src/next-item.ts`): the alternative with the lowest
 * required level above the character's, the biggest gain on a tie.
 */
import { describe, expect, test } from 'bun:test'

import type { Alternative, SlotEntry } from '../src/gains'
import { nextAlternative } from '../src/next-item'
import { readResultsFile } from '../src/results-file'
import sampleJson from '../src/sample-truncha.json'

const outcome = readResultsFile(sampleJson)
if (!outcome.ok) throw new Error('the sample no longer reads')
const sample = outcome.file
const someItem = sample.slots.find((slot) => slot.worn)!.worn!

function alternative(
    itemId: number,
    level: number,
    gainEp: number | null,
    gainDps: number | null = null
): Alternative {
    return {
        item: {
            ...someItem,
            item_id: itemId,
            name: `Item ${itemId}`,
            required_level: level,
        },
        gain_ep: gainEp,
        gain_dps: gainDps,
    }
}

function entry(alternatives: Alternative[]): SlotEntry {
    return { slot: 'trinket_1', worn: null, alternatives }
}

describe('nextAlternative', () => {
    test('picks the lowest required level above the character', () => {
        const next = nextAlternative(
            entry([
                alternative(1, 37, 40),
                alternative(2, 35, 12),
                alternative(3, 34, 50),
            ]),
            34
        )
        expect(next?.item.item_id).toBe(2)
    })

    test('on a tie, the biggest gain (EP, else DPS)', () => {
        expect(
            nextAlternative(
                entry([alternative(1, 36, 5), alternative(2, 36, 9)]),
                34
            )?.item.item_id
        ).toBe(2)
        expect(
            nextAlternative(
                entry([
                    alternative(1, 36, null, 1),
                    alternative(2, 36, null, 3),
                ]),
                34
            )?.item.item_id
        ).toBe(2)
    })

    test('nothing above the level, or no entry: null', () => {
        expect(
            nextAlternative(
                entry([alternative(1, 34, 5), alternative(2, 20, 9)]),
                34
            )
        ).toBeNull()
        expect(nextAlternative(entry([]), 34)).toBeNull()
        expect(nextAlternative(undefined, 34)).toBeNull()
    })
})
