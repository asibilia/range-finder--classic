/** The bottom row's labels, read from the file (`src/slot-labels.ts`). */
import { describe, expect, test } from 'bun:test'

import { readResultsFile, type ResultsFile } from '../src/results-file'
import sampleJson from '../src/sample-truncha.json'
import { bottomSlots, holdsTwoHander, slotLabel } from '../src/slot-labels'

const outcome = readResultsFile(sampleJson)
if (!outcome.ok) throw new Error('the sample no longer reads')
const sample: ResultsFile = outcome.file

describe('the bottom row', () => {
    test('a shaman with nothing in the off hand reads Two-hand and Totem, as the mockup', () => {
        expect(holdsTwoHander(sample)).toBe(true)
        expect(bottomSlots(sample)).toEqual(['main_hand', 'relic'])
        expect(slotLabel('main_hand', sample)).toBe('Two-hand')
        expect(slotLabel('relic', sample)).toBe('Totem')
    })

    test('anything for the off hand keeps Main hand and Off hand', () => {
        const withOffHand: ResultsFile = {
            ...sample,
            slots: sample.slots.map((entry) =>
                entry.slot === 'off_hand'
                    ? {
                          ...entry,
                          worn:
                              sample.slots.find((s) => s.slot === 'main_hand')
                                  ?.worn ?? null,
                      }
                    : entry
            ),
        }
        expect(holdsTwoHander(withOffHand)).toBe(false)
        expect(bottomSlots(withOffHand)).toEqual([
            'main_hand',
            'off_hand',
            'relic',
        ])
        expect(slotLabel('main_hand', withOffHand)).toBe('Main hand')
    })

    test('other classes name the relic slot their way; before a file loads it is Relic', () => {
        const paladin = {
            ...sample,
            character: { ...sample.character, class: 'Paladin' },
        }
        expect(slotLabel('relic', paladin)).toBe('Libram')
        expect(
            slotLabel('relic', {
                ...sample,
                character: { ...sample.character, class: 'Warrior' },
            })
        ).toBe('Relic')
        expect(slotLabel('relic', null)).toBe('Relic')
        expect(bottomSlots(null)).toEqual(['main_hand', 'off_hand', 'relic'])
    })
})
