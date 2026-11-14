/**
 * The gear pane: every slot around the character, the middle with the model
 * placeholder and the character sheet. With no file, every slot is an empty
 * outline.
 */
import type { ResultsFile, Slot } from './results-file'
import {
    BOTTOM_SLOTS,
    LEFT_SLOTS,
    RIGHT_SLOTS,
    SLOT_LABELS,
} from './slot-labels'

type Item = NonNullable<ResultsFile['slots'][number]['worn']>

const QUALITY_GLYPHS: Record<Item['quality'], string> = {
    poor: '·',
    common: '○',
    uncommon: '◇',
    rare: '◆',
    epic: '★',
    legendary: '✦',
}

function SlotButton({ slot, file }: { slot: Slot; file: ResultsFile | null }) {
    const label = SLOT_LABELS[slot]
    if (!file) {
        return (
            <button
                type="button"
                className="slot slot-empty"
                aria-label={`${label}: Empty`}
            >
                <span className="slot-label">{label}</span>
                <span className="slot-item">Empty</span>
            </button>
        )
    }
    const worn = file.slots.find((entry) => entry.slot === slot)?.worn ?? null
    if (!worn) {
        return (
            <button
                type="button"
                className="slot slot-empty"
                aria-label={`${label}: Nothing equipped`}
            >
                <span className="slot-label">{label}</span>
                <span className="slot-item">Nothing equipped</span>
            </button>
        )
    }
    return (
        <button
            type="button"
            className="slot"
            data-quality={worn.quality}
            aria-label={`${label}: ${worn.name}`}
        >
            <span className="slot-glyph" aria-hidden="true">
                {QUALITY_GLYPHS[worn.quality]}
            </span>
            <span className="slot-label">{label}</span>
            <span className="slot-item">{worn.name}</span>
            <span className="slot-note">{worn.source.text}</span>
        </button>
    )
}

function percent(value: number): string {
    return `${value.toFixed(2)}%`
}

function CharacterSheet({ file }: { file: ResultsFile }) {
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
        <>
            <dl className="sheet">
                {rows.map(([name, value]) => (
                    <div key={name} className="sheet-row">
                        <dt>{name}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
            <p className="sheet-note">
                {file.sheet_buffed
                    ? 'Buffed sheet: as the game showed it at export, with the buffs you had up.'
                    : 'Unbuffed sheet.'}
            </p>
        </>
    )
}

export function GearPane({ file }: { file: ResultsFile | null }) {
    const column = (slots: Slot[], className: string) => (
        <div className={className}>
            {slots.map((slot) => (
                <SlotButton key={slot} slot={slot} file={file} />
            ))}
        </div>
    )
    return (
        <section className="gear-pane" aria-label="Gear">
            {column(LEFT_SLOTS, 'gear-left')}
            <div className="gear-middle">
                <figure className="model">
                    <div className="model-figure" aria-hidden="true" />
                    <figcaption>Character model goes here</figcaption>
                </figure>
                {file && <CharacterSheet file={file} />}
            </div>
            {column(RIGHT_SLOTS, 'gear-right')}
            {column(BOTTOM_SLOTS, 'gear-bottom')}
        </section>
    )
}
