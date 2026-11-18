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

/**
 * The months as the owner's design writes them: short with a full stop
 * (`Nov.`), the short months (March to July) in full, as AP style does.
 */
const MONTHS = [
    'Jan.',
    'Feb.',
    'March',
    'April',
    'May',
    'June',
    'July',
    'Aug.',
    'Sept.',
    'Oct.',
    'Nov.',
    'Dec.',
]

/**
 * A day, as the owner's design writes it: `Nov. 13`. Used for every date the
 * page shows (the export's day, the day a file was made). Read from the
 * timestamp's own date (as written in the file), so it doesn't move with
 * the reader's time zone.
 *
 * @param iso - An ISO 8601 datetime (`export_saved_at`, `made_at`).
 * @returns The month and day.
 *
 * @example
 * exportDay('2026-11-13T17:24:14Z') // 'Nov. 13'
 * exportDay('2026-05-02T08:00:00Z') // 'May 2'
 */
export function exportDay(iso: string): string {
    const [, month, day] = iso.slice(0, 10).split('-').map(Number)
    return `${MONTHS[(month ?? 1) - 1] ?? ''} ${day ?? ''}`
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
/**
 * The fight's kind and its mob, with the level said once:
 * `Dungeon vs a level 36 mob (+2)`, `Solo vs a level 34 mob (your level)`.
 *
 * @param fight - The fight.
 * @param level - The character's level.
 * @returns The words.
 */
export function mobWords(fight: Fight, level: number): string {
    const difference = fight.target_level - level
    const relative =
        difference === 0
            ? 'your level'
            : `${difference > 0 ? '+' : '-'}${Math.abs(difference)}`
    return `${shortLabel(fight)} vs a level ${fight.target_level} mob (${relative})`
}

export function fightDetail(fight: Fight, level: number): string {
    const parts = [mobWords(fight, level)]
    if (fight.setup)
        parts.push(fight.setup.being_hit ? 'mob hitting you' : 'behind a tank')
    parts.push(
        fight.kind === 'chain' && fight.setup
            ? `${fight.setup.pulls} pulls of ${shortLength(fight.duration_s)}, ${fight.setup.gap_s} s apart`
            : shortLength(fight.duration_s)
    )
    return parts.join(', ')
}

/** A reading that shows its gap from the sim's plan (every reading). */
export type GapReading = 'dps' | 'resource' | 'lifespan' | 'health' | 'armor'

/**
 * The decimals each reading is written with, its gap too (owner decision
 * B: Resource Empty and Lifespan in hundredths, `15.20 sec`, `↓ 5.80`).
 */
export const READING_DECIMALS: Record<GapReading, number> = {
    dps: 1,
    resource: 2,
    lifespan: 2,
    health: 0,
    armor: 0,
}

/**
 * How far what you wear is from the plan on a reading (owner decision A):
 * the plan's value minus what you wear's, rounded to the reading's
 * decimals. Above zero, what you wear is below the plan (`↓ 14.7`); under
 * zero, it beats the plan (`+ 32.8`). Every reading is better higher: more
 * DPS, mana for longer, more health and armor, a longer life.
 *
 * @param kind - The reading.
 * @param worn - What you wear's result.
 * @param plan - The plan's result on the same fight.
 * @returns The signed gap, or null when it rounds to zero, or either side
 * is null or `never` (no number to subtract).
 *
 * @example
 * readingGap('dps', worn, plan) // 14.7: what you wear is 14.7 DPS below
 * readingGap('health', worn, plan) // -33: what you wear has 33 more health
 */
export function readingGap(
    kind: GapReading,
    worn: Result,
    plan: Result
): number | null {
    let a: number | null
    let b: number | null
    if (kind === 'dps') [a, b] = [plan.dps, worn.dps]
    else if (kind === 'health') [a, b] = [plan.health, worn.health]
    else if (kind === 'armor') [a, b] = [plan.armor, worn.armor]
    else if (kind === 'resource') {
        a = typeof plan.out_of_mana_s === 'number' ? plan.out_of_mana_s : null
        b = typeof worn.out_of_mana_s === 'number' ? worn.out_of_mana_s : null
    } else [a, b] = [plan.time_to_die_s, worn.time_to_die_s]
    if (a === null || b === null) return null
    const gap = Number((a - b).toFixed(READING_DECIMALS[kind]))
    return gap === 0 ? null : gap
}
