/**
 * How hard an enemy is for the character, in the game's colours (the "con"
 * colour of a mob's level): the Blizzard UI's `GetQuestDifficultyColor` rule,
 * as Classic has it. The fight settings colour each enemy level by it.
 *
 * The level difference (enemy − player) picks the colour:
 * - +5 or more: red
 * - +3 or +4: orange
 * - −2 to +2: yellow
 * - further below, green while within the "green range" (the levels that
 *   still give experience), else grey.
 *
 * The green range (Classic's `GetQuestGreenRange`): 5 at level 5 and below,
 * `floor(level / 10) + 5` from 6 to 39, `floor(level / 5) + 1` from 40 to
 * 59, 9 from 60.
 */

/** The five con colours, named as the theme's `--con-*` tokens. */
export const CON_COLOURS = ['red', 'orange', 'yellow', 'green', 'grey'] as const

/** One con colour. */
export type ConColour = (typeof CON_COLOURS)[number]

/**
 * How many levels below the player still read green (Classic).
 *
 * @param playerLevel - The character's level.
 * @returns The green range, in levels.
 *
 * @example
 * ```ts
 * greenRange(33) // 8: levels 25 to 30 are green at 33
 * ```
 */
export function greenRange(playerLevel: number): number {
    if (playerLevel <= 5) return 5
    if (playerLevel <= 39) return Math.floor(playerLevel / 10) + 5
    if (playerLevel <= 59) return Math.floor(playerLevel / 5) + 1
    return 9
}

/**
 * The con colour of an enemy's level for a character, the game's rule.
 *
 * @param enemyLevel - The enemy's level.
 * @param playerLevel - The character's level.
 * @returns The colour's name.
 *
 * @example
 * ```ts
 * conColour(35, 33) // 'yellow'
 * conColour(36, 33) // 'orange'
 * conColour(38, 33) // 'red'
 * conColour(25, 33) // 'green'
 * conColour(20, 33) // 'grey'
 * ```
 */
export function conColour(enemyLevel: number, playerLevel: number): ConColour {
    const diff = enemyLevel - playerLevel
    if (diff >= 5) return 'red'
    if (diff >= 3) return 'orange'
    if (diff >= -2) return 'yellow'
    if (-diff <= greenRange(playerLevel)) return 'green'
    return 'grey'
}
