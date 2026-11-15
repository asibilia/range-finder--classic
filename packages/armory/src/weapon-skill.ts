/**
 * The weapon skill's short name on the character sheet. The file has the
 * game's skill name (`sheet.weapon_skill.weapon_type`: "Two-Handed Axes");
 * the sheet says it short, as the mockup does ("Axe skill 148/150").
 */

/** The game's weapon skill names, lower case, and their short names. */
const SHORT_NAMES = new Map<string, string>([
    ['axes', 'Axe'],
    ['one-handed axes', 'Axe'],
    ['two-handed axes', 'Axe'],
    ['maces', 'Mace'],
    ['one-handed maces', 'Mace'],
    ['two-handed maces', 'Mace'],
    ['swords', 'Sword'],
    ['one-handed swords', 'Sword'],
    ['two-handed swords', 'Sword'],
    ['staves', 'Staff'],
    ['daggers', 'Dagger'],
    ['fist weapons', 'Fist'],
    ['polearms', 'Polearm'],
    ['bows', 'Bow'],
    ['guns', 'Gun'],
    ['crossbows', 'Crossbow'],
    ['thrown', 'Thrown'],
    ['wands', 'Wand'],
    ['unarmed', 'Unarmed'],
])

/**
 * The short name the sheet puts before "skill".
 *
 * @param weaponType - The game's skill name, as the file has it.
 * @returns Its short name (case and outer spaces don't matter); a name the
 * table doesn't know is used as given, trimmed; a blank one is `Weapon`.
 *
 * @example
 * ```typescript
 * weaponSkillLabel('Two-Handed Axes') // 'Axe'
 * weaponSkillLabel('Fishing Poles') // 'Fishing Poles'
 * ```
 */
export function weaponSkillLabel(weaponType: string): string {
    const name = weaponType.trim()
    if (name === '') return 'Weapon'
    return SHORT_NAMES.get(name.toLowerCase()) ?? name
}
