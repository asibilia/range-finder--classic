/**
 * The gear pane: every slot around the character, the middle with the model
 * placeholder and the character sheet. With no file, every slot is an empty
 * outline.
 */
import type { ReactNode } from 'react'

import {
    bestUpgrade,
    formatGain,
    type Gain,
    gainSize,
    type Item,
} from './gains'
import type { ResultsFile, Slot } from './results-file'
import {
    BOTTOM_SLOTS,
    LEFT_SLOTS,
    RIGHT_SLOTS,
    SLOT_LABELS,
} from './slot-labels'

const QUALITY_GLYPHS: Record<Item['quality'], string> = {
    poor: '·',
    common: '○',
    uncommon: '◇',
    rare: '◆',
    epic: '★',
    legendary: '✦',
}

function GainBadge({ gain }: { gain: Gain }) {
    return (
        <span className="slot-gain" data-size={gainSize(gain)}>
            {formatGain(gain)}
        </span>
    )
}

function SlotButton({
    slot,
    file,
    onOpen,
}: {
    slot: Slot
    file: ResultsFile | null
    onOpen: (slot: Slot) => void
}) {
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
    const entry = file.slots.find((candidate) => candidate.slot === slot)
    const worn = entry?.worn ?? null
    const best = bestUpgrade(entry)
    const gainText = best ? `, ${formatGain(best.gain)}` : ''
    const note = best ? `Best: ${best.item.name}` : worn?.source.text
    return (
        <button
            type="button"
            className={worn ? 'slot' : 'slot slot-empty'}
            data-quality={worn?.quality}
            aria-label={`${label}: ${worn ? worn.name : 'Nothing equipped'}${gainText}`}
            onClick={() => onOpen(slot)}
        >
            <span className="slot-glyph" aria-hidden="true">
                {worn ? QUALITY_GLYPHS[worn.quality] : ''}
            </span>
            <span className="slot-label">{label}</span>
            <span className="slot-item">
                {worn ? worn.name : 'Nothing equipped'}
            </span>
            {best && <GainBadge gain={best.gain} />}
            {note && <span className="slot-note">{note}</span>}
        </button>
    )
}

function BagUpgrades({ file }: { file: ResultsFile }) {
    if (file.bag_upgrades.length === 0) return null
    return (
        <ul className="bag-upgrades">
            {file.bag_upgrades.map((upgrade) => (
                <li key={`${upgrade.slot}-${upgrade.item.item_id}`}>
                    {`In your bags: ${upgrade.item.name}, ${formatGain({ value: upgrade.gain_ep, unit: 'EP' })} over what you wear.`}
                </li>
            ))}
        </ul>
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

export function GearPane({
    file,
    onOpenSlot,
}: {
    file: ResultsFile | null
    onOpenSlot: (slot: Slot) => void
}) {
    const column = (slots: Slot[], className: string, after?: ReactNode) => (
        <div className={className}>
            {slots.map((slot) => (
                <SlotButton
                    key={slot}
                    slot={slot}
                    file={file}
                    onOpen={onOpenSlot}
                />
            ))}
            {after}
        </div>
    )
    return (
        <section className="gear-pane" aria-label="Gear">
            {column(
                LEFT_SLOTS,
                'gear-left',
                file && <BagUpgrades file={file} />
            )}
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
