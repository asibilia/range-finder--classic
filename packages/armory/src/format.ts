/** How the page writes times and numbers (spec section 5). */
import type { Fight, Result } from './results-file'

/**
 * `m:ss`, whole seconds rounded down.
 *
 * @param seconds - A time in seconds.
 * @returns The time as minutes and seconds.
 *
 * @example
 * minutesSeconds(47.6) // '0:47'
 */
export function minutesSeconds(seconds: number): string {
    const whole = Math.floor(seconds)
    const rest = whole % 60
    return `${Math.floor(whole / 60)}:${rest < 10 ? '0' : ''}${rest}`
}

/**
 * A change, always signed, never `-0`: `+8.7`, `-65`, `+0:09`.
 *
 * @param change - The difference (plan minus what you wear).
 * @param decimals - Decimal places.
 * @returns The signed text, or null when it rounds to nothing.
 */
export function signed(change: number, decimals: number): string | null {
    const shown = Number(change.toFixed(decimals))
    if (shown === 0) return null
    return `${shown > 0 ? '+' : '-'}${Math.abs(shown).toFixed(decimals)}`
}

const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

/**
 * The day an export was saved, as the mockup writes it: `13 November`. Read
 * from the timestamp's own date (as written in the file), so it doesn't move
 * with the reader's time zone.
 *
 * @param iso - An ISO 8601 datetime (`export_saved_at`).
 * @returns The day and month.
 *
 * @example
 * exportDay('2026-11-13T17:24:14Z') // '13 November'
 */
export function exportDay(iso: string): string {
    const [, month, day] = iso.slice(0, 10).split('-').map(Number)
    return `${day ?? ''} ${MONTHS[(month ?? 1) - 1] ?? ''}`
}

/**
 * A fight's length in words, as the mockup writes it: `30 seconds`, `1
 * minute`, `2 minutes`, `1:30`.
 *
 * @param seconds - The length in seconds.
 * @returns The words.
 */
export function lengthWords(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`
    if (seconds % 60 !== 0) return minutesSeconds(seconds)
    const minutes = seconds / 60
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

/**
 * Words with `a` or `an` before them: `an` before a vowel.
 *
 * @param words - The words, e.g. `Enhancement Shaman`.
 * @returns The words with their article.
 *
 * @example
 * withArticle('Enhancement Shaman') // 'an Enhancement Shaman'
 */
export function withArticle(words: string): string {
    return `${/^[aeiou]/i.test(words) ? 'an' : 'a'} ${words}`
}

/**
 * A fight's length, short: `30 s` under a minute, `2 min` for whole
 * minutes, else `m:ss`.
 *
 * @param seconds - The length in seconds.
 * @returns The short length.
 *
 * @example
 * shortLength(90) // '1:30'
 */
export function shortLength(seconds: number): string {
    if (seconds < 60) return `${seconds} s`
    if (seconds % 60 === 0) return `${seconds / 60} min`
    return minutesSeconds(seconds)
}

/**
 * A fight's short name on the readings (spec section 2): `Chain` on a chain
 * fight; else `Solo` when the mob hits you, `Dungeon` when it doesn't; with
 * no setup, the first word of the fight's label, letters only.
 *
 * @param fight - The fight.
 * @returns The short label.
 */
export function shortLabel(fight: Fight): string {
    if (fight.kind === 'chain') return 'Chain'
    if (fight.setup) return fight.setup.being_hit ? 'Solo' : 'Dungeon'
    const first = fight.label.trim().split(/\s+/)[0] ?? ''
    return first.replace(/[^\p{L}]/gu, '')
}

/**
 * The full detail behind a fight's short label (the readings' "i"):
 * `Solo vs a level 33 mob (your level), mob hitting you, 30 s`.
 *
 * @param fight - The fight.
 * @param level - The character's level.
 * @returns The sentence.
 */
export function fightDetail(fight: Fight, level: number): string {
    const difference = fight.target_level - level
    const relative =
        difference === 0
            ? 'your level'
            : `${difference > 0 ? '+' : '-'}${Math.abs(difference)}`
    const parts = [
        `${shortLabel(fight)} vs a level ${fight.target_level} mob (${relative})`,
    ]
    if (fight.setup)
        parts.push(fight.setup.being_hit ? 'mob hitting you' : 'behind a tank')
    parts.push(
        fight.kind === 'chain' && fight.setup
            ? `${fight.setup.pulls} pulls of ${shortLength(fight.duration_s)}, ${fight.setup.gap_s} s apart`
            : shortLength(fight.duration_s)
    )
    return parts.join(', ')
}

/** A reading that has a gap below the sim's plan. */
export type GapReading = 'dps' | 'resource' | 'lifespan'

/**
 * How far what you wear is below the plan on a reading, when it is: DPS
 * subtracts, then rounds to one decimal; `resource` (out of mana) rounds
 * each down, then subtracts; `lifespan` (time to die) rounds each to the
 * nearest second, then subtracts.
 *
 * @param kind - The reading.
 * @param worn - What you wear's result.
 * @param plan - The plan's result on the same fight.
 * @returns The gap above zero, else null (also when either side is null
 * or `never`).
 */
export function readingGap(
    kind: GapReading,
    worn: Result,
    plan: Result
): number | null {
    let gap: number
    if (kind === 'dps') gap = Number((plan.dps - worn.dps).toFixed(1))
    else if (kind === 'resource') {
        const a = plan.out_of_mana_s
        const b = worn.out_of_mana_s
        if (typeof a !== 'number' || typeof b !== 'number') return null
        gap = Math.floor(a) - Math.floor(b)
    } else {
        const a = plan.time_to_die_s
        const b = worn.time_to_die_s
        if (a === null || b === null) return null
        gap = Math.round(a) - Math.round(b)
    }
    return gap > 0 ? gap : null
}
