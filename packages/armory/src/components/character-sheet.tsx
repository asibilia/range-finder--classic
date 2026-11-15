/**
 * The character sheet under the figure (spec section 5), as the mockup lays
 * it out: two pairs to a row (`Str 73  Agi 96`), short names with their
 * full names in `abbr`, the weapon skill last, said short (`Axe skill
 * 148/150` for the game's Two-Handed Axes, when the file has it), and a
 * caption saying which export it is from.
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
            name: 'Spell crit',
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
            name: `${weaponSkillLabel(skill.weapon_type)} skill`,
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
            {/* At most the middle column's width: a name too long for it
                wraps (at a space or hyphen) rather than widening the sheet
                under the slots and their gain pills. */}
            <dl
                aria-label="Character sheet"
                className="mt-3.5 grid max-w-full min-w-0 grid-cols-[auto_auto_auto_auto] gap-x-2 gap-y-0.75 rounded-xl border bg-muted/40 px-2.5 py-2.5 text-[0.78125rem] text-muted-foreground"
            >
                {sheetRows(file.sheet).map((row) => (
                    <div key={row.key} className="contents">
                        <dt className="break-words">{row.name}</dt>
                        <dd className="text-right whitespace-nowrap text-foreground tabular-nums">
                            {row.value}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="mt-1.5 text-center text-[0.71875rem] text-muted-foreground">
                {`Sheet from your export of ${exportDay(file.export_saved_at)}, as worn${buffs}.`}
            </p>
        </div>
    )
}
