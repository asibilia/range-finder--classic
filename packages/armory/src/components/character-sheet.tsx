/**
 * The character sheet under the figure (spec section 5): a compact grid of
 * the sheet's numbers, with their full names, and whether it was buffed.
 */
import type { ResultsFile } from '../results-file'

function percent(value: number): string {
    return `${value.toFixed(2)}%`
}

/**
 * The sheet.
 *
 * @param file - The loaded results file.
 */
export function CharacterSheet({ file }: { file: ResultsFile }) {
    const { sheet } = file
    const rows: [string, string][] = [
        ['Strength', String(sheet.strength)],
        ['Agility', String(sheet.agility)],
        ['Stamina', String(sheet.stamina)],
        ['Intellect', String(sheet.intellect)],
        ['Spirit', String(sheet.spirit)],
        ['Attack power', String(sheet.attack_power)],
        ['Armor', String(sheet.armor)],
        ['Health', String(sheet.health)],
        ['Mana', String(sheet.mana)],
        ['Melee crit', percent(sheet.melee_crit_pct)],
        ['Spell crit', percent(sheet.spell_crit_pct)],
        ['Dodge', percent(sheet.dodge_pct)],
        ['Hit', percent(sheet.melee_hit_pct)],
    ]
    return (
        <div className="flex w-full max-w-66 flex-col items-center gap-1.5">
            <dl
                aria-label="Character sheet"
                className="grid w-full grid-cols-[auto_auto_auto_auto] gap-x-2.5 gap-y-1 rounded-xl border bg-muted/40 px-2.5 py-2 text-[0.7rem]"
            >
                {rows.map(([name, value]) => (
                    <div key={name} className="contents">
                        <dt className="whitespace-nowrap text-muted-foreground">
                            {name}
                        </dt>
                        <dd className="text-right font-medium whitespace-nowrap tabular-nums">
                            {value}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="text-center text-xs text-muted-foreground">
                {file.sheet_buffed
                    ? 'Buffed sheet: as the game showed it at export, with the buffs you had up.'
                    : 'Unbuffed sheet.'}
            </p>
        </div>
    )
}
