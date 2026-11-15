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
