/** How the page writes times and numbers (spec section 5). */

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
