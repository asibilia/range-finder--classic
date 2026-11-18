/**
 * The character sheet (spec section 5), as the owner's design lays it out:
 * a borderless glass panel, two pairs to a row (`Str 73  Agi 96`), short
 * names with their full names in `abbr` (`Sp. Crit`; the weapon skill last
 * as `Wp. Skill 148/150`, whatever the weapon, its full name saying which:
 * `Axe skill` for the game's Two-Handed Axes), the values in JetBrains Mono
 * set right, nothing wrapping; and under it `Data exported Nov. 17, as
 * worn.`
 */
import type { ReactNode } from 'react'

import { exportDay } from '../format'
import type { ResultsFile } from '../results-file'
import { weaponSkillLabel } from '../weapon-skill'

/** `11.95%`, `0%`: at most two decimals, no trailing zeros. */
function percent(value: number): string {
    return `${Number(value.toFixed(2))}%`
}

function short(abbr: string, full: string): ReactNode {
    return (
        <abbr title={full} className="no-underline">
            {abbr}
        </abbr>
    )
}

/**
 * The sheet's rows, in the mockup's order.
 *
 * @param sheet - The file's sheet.
 * @returns Each line's name (as shown) and value.
 */
export function sheetRows(
    sheet: ResultsFile['sheet']
): { key: string; name: ReactNode; value: string }[] {
    const rows = [
        {
            key: 'Strength',
            name: short('Str', 'Strength'),
            value: String(sheet.strength),
        },
        {
            key: 'Agility',
            name: short('Agi', 'Agility'),
            value: String(sheet.agility),
        },
        {
            key: 'Stamina',
            name: short('Sta', 'Stamina'),
            value: String(sheet.stamina),
        },
        {
            key: 'Intellect',
            name: short('Int', 'Intellect'),
            value: String(sheet.intellect),
        },
        {
            key: 'Spirit',
            name: short('Spi', 'Spirit'),
            value: String(sheet.spirit),
        },
        {
            key: 'Attack power',
            name: short('AP', 'Attack power'),
            value: String(sheet.attack_power),
        },
        { key: 'Crit', name: 'Crit', value: percent(sheet.melee_crit_pct) },
        {
            key: 'Spell crit',
            name: short('Sp. Crit', 'Spell crit'),
            value: percent(sheet.spell_crit_pct),
        },
        { key: 'Dodge', name: 'Dodge', value: percent(sheet.dodge_pct) },
        { key: 'Hit', name: 'Hit', value: percent(sheet.melee_hit_pct) },
        { key: 'Armor', name: 'Armor', value: String(sheet.armor) },
    ]
    const skill = sheet.weapon_skill
    if (skill)
        rows.push({
            key: 'Weapon skill',
            name: short(
                'Wp. Skill',
                `${weaponSkillLabel(skill.weapon_type)} skill`
            ),
            value: `${skill.current}/${skill.max}`,
        })
    return rows
}

/**
 * The sheet.
 *
 * @param file - The loaded results file.
 */
export function CharacterSheet({ file }: { file: ResultsFile }) {
    const buffs = file.sheet_buffed ? ', with the buffs you had up' : ''
    return (
        <div className="flex w-full flex-col items-center">
            {/* Never wider than the middle column: names stay on one line,
                so on the narrowest three-column doll (the middle under
                about 17rem) the sheet is set a size smaller. */}
            <dl
                aria-label="Character sheet"
                className="glass grid w-full max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 gap-y-1.25 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground @min-[49rem]/doll:@max-[52rem]/doll:gap-x-2 @min-[49rem]/doll:@max-[52rem]/doll:px-2 @min-[49rem]/doll:@max-[52rem]/doll:text-xs"
            >
                {sheetRows(file.sheet).map((row) => (
                    <div key={row.key} className="contents">
                        <dt>{row.name}</dt>
                        <dd className="text-right font-mono text-foreground tabular-nums">
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="mt-2.5 text-center text-xs text-subtle-foreground">
                Data exported{' '}
                <b className="font-bold text-muted-foreground">
                    {exportDay(file.export_saved_at)}
                </b>
                {`, as worn${buffs}.`}
            </p>
        </div>
    )
}
