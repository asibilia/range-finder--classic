/** The weapon skill's short name on the sheet (`src/weapon-skill.ts`). */
import { describe, expect, test } from 'bun:test'

import { weaponSkillLabel } from '../src/weapon-skill'

describe("the sheet's weapon skill name", () => {
    test("maps the game's skill names to the mockup's short form", () => {
        const table: [string, string][] = [
            ['Axes', 'Axe'],
            ['Two-Handed Axes', 'Axe'],
            ['One-Handed Axes', 'Axe'],
            ['Maces', 'Mace'],
            ['Two-Handed Maces', 'Mace'],
            ['One-Handed Maces', 'Mace'],
            ['Swords', 'Sword'],
            ['Two-Handed Swords', 'Sword'],
            ['One-Handed Swords', 'Sword'],
            ['Staves', 'Staff'],
            ['Daggers', 'Dagger'],
            ['Fist Weapons', 'Fist'],
            ['Polearms', 'Polearm'],
            ['Bows', 'Bow'],
            ['Guns', 'Gun'],
            ['Crossbows', 'Crossbow'],
            ['Thrown', 'Thrown'],
            ['Wands', 'Wand'],
            ['Unarmed', 'Unarmed'],
        ]
        for (const [name, label] of table)
            expect(weaponSkillLabel(name)).toBe(label)
    })

    test('ignores case and stray spaces', () => {
        expect(weaponSkillLabel('  two-handed axes ')).toBe('Axe')
    })

    test('an unknown name is used as given, trimmed; a blank one reads Weapon', () => {
        expect(weaponSkillLabel('Axe')).toBe('Axe')
        expect(weaponSkillLabel(' Fishing Poles ')).toBe('Fishing Poles')
        expect(weaponSkillLabel('   ')).toBe('Weapon')
    })
})
