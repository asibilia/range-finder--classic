/**
 * The Simulator Data card's words, as pure functions in `src/format.ts`:
 * a fight's detail sentence (the readings' "i"), a short fight length, and
 * how far what you wear is below the sim's plan on a reading; and the day
 * every date on the page is written as.
 */
import { describe, expect, test } from 'bun:test'

import { exportDay, fightDetail, readingGap, shortLength } from '../src/format'
import type { Fight, Result } from '../src/results-file'
import sample from '../src/sample-truncha.json'

/** A single fight, changed by `change`. */
function fight(change: Partial<Fight> = {}): Fight {
    return {
        fight_id: 'test',
        label: 'Solo, 30 s vs level 30',
        kind: 'single',
        target_level: 30,
        duration_s: 30,
        setup: {
            starting_mana_pct: 100,
            being_hit: true,
            pulls: 1,
            gap_s: 0,
            drinks: false,
            target_armor: 1100,
        },
        ...change,
    }
}

/** The sample's worn result on the 2-minute fight, changed by `change`. */
function result(change: Partial<Result>): Result {
    const base = (sample.results as unknown as Result[]).find(
        (entry) => entry.gear === 'worn' && entry.fight_id === 'dungeon-long'
    )
    if (!base) throw new Error('the sample changed')
    return { ...structuredClone(base), ...change }
}

describe('fightDetail', () => {
    test('says (your level) when the mob is your level, (-1) one below, and leaves out the hitting part with no setup', () => {
        expect(fightDetail(fight(), 30)).toBe(
            'Solo vs a level 30 mob (your level), mob hitting you, 30 s'
        )
        expect(
            fightDetail(
                fight({
                    label: 'Dungeon, 2 min vs level 29',
                    target_level: 29,
                    duration_s: 120,
                    setup: {
                        starting_mana_pct: 100,
                        being_hit: false,
                        pulls: 1,
                        gap_s: 0,
                        drinks: false,
                        target_armor: 1100,
                    },
                }),
                30
            )
        ).toBe('Dungeon vs a level 29 mob (-1), behind a tank, 2 min')
        // No setup: no hitting part, and the label's first word.
        expect(
            fightDetail(
                fight({
                    label: 'Raid, 90 s vs level 31',
                    target_level: 31,
                    duration_s: 90,
                    setup: undefined,
                }),
                30
            )
        ).toBe('Raid vs a level 31 mob (+1), 1:30')
    })
})

describe('shortLength', () => {
    test('reads 30 s under a minute, 2 min for whole minutes, else m:ss', () => {
        expect(shortLength(30)).toBe('30 s')
        expect(shortLength(120)).toBe('2 min')
        expect(shortLength(90)).toBe('1:30')
    })
})

describe('readingGap (signed: above zero, what you wear is below the plan)', () => {
    test('lifespan: what you wear lasting longer than the plan is a gap under zero, in hundredths', () => {
        expect(
            readingGap(
                'lifespan',
                result({ time_to_die_s: 34 }),
                result({ time_to_die_s: 31 })
            )
        ).toBe(-3)
        expect(
            readingGap(
                'lifespan',
                result({ time_to_die_s: 31.4 }),
                result({ time_to_die_s: 33.6 })
            )
        ).toBe(2.2)
    })

    test('dps subtracts then rounds to one decimal; resource to two; never or null is no gap', () => {
        expect(
            readingGap('dps', result({ dps: 103.7 }), result({ dps: 118.4 }))
        ).toBe(14.7)
        expect(
            readingGap(
                'resource',
                result({ out_of_mana_s: 48.9 }),
                result({ out_of_mana_s: 57.2 })
            )
        ).toBe(8.3)
        expect(
            readingGap(
                'resource',
                result({ out_of_mana_s: 'never' }),
                result({ out_of_mana_s: 57 })
            )
        ).toBeNull()
        expect(
            readingGap(
                'resource',
                result({ out_of_mana_s: 48 }),
                result({ out_of_mana_s: null })
            )
        ).toBeNull()
    })

    test('health and armor: whole numbers, either sign; the same is no gap', () => {
        expect(
            readingGap(
                'health',
                result({ health: 1375 }),
                result({ health: 1310 })
            )
        ).toBe(-65)
        expect(
            readingGap('armor', result({ armor: 952 }), result({ armor: 1010 }))
        ).toBe(58)
        expect(
            readingGap('armor', result({ armor: 952 }), result({ armor: 952 }))
        ).toBeNull()
    })
})

describe('exportDay (the owner\'s design: "Nov. 17")', () => {
    test('writes the short month with a full stop, then the day', () => {
        expect(exportDay('2026-11-13T17:24:14Z')).toBe('Nov. 13')
        expect(exportDay('2026-01-02T00:00:00Z')).toBe('Jan. 2')
        expect(exportDay('2026-09-30T12:00:00Z')).toBe('Sept. 30')
    })

    test('writes March to July in full, as AP style does', () => {
        expect(exportDay('2026-03-01T00:00:00Z')).toBe('March 1')
        expect(exportDay('2026-05-17T00:00:00Z')).toBe('May 17')
        expect(exportDay('2026-07-04T00:00:00Z')).toBe('July 4')
    })

    test("reads the timestamp's own date, not the reader's time zone", () => {
        expect(exportDay('2026-11-17T23:59:59-08:00')).toBe('Nov. 17')
    })
})
