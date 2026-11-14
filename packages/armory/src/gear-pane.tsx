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
    gainOf,
    gainSize,
    type Item,
    type SlotEntry,
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

type Plan = ResultsFile['plans'][number]

type Shown = {
    item: Item | null
    gain: Gain | null
    note: string | undefined
    sameAsWorn: boolean
}

/** What a slot shows in the worn view. */
function wornView(entry: SlotEntry | undefined): Shown {
    const worn = entry?.worn ?? null
    const best = bestUpgrade(entry)
    return {
        item: worn,
        gain: best?.gain ?? null,
        note: best ? `Best: ${best.item.name}` : worn?.source.text,
        sameAsWorn: false,
    }
}

/** What a slot shows in the plan view. */
function planView(
    entry: SlotEntry | undefined,
    planItemId: number | null
): Shown {
    const worn = entry?.worn ?? null
    if (planItemId === (worn?.item_id ?? null))
        return {
            item: worn,
            gain: null,
            note: worn ? 'Same as what you wear' : undefined,
            sameAsWorn: worn !== null,
        }
    const alternative = entry?.alternatives.find(
        (candidate) => candidate.item.item_id === planItemId
    )
    const gain = alternative ? gainOf(alternative) : null
    return {
        item: alternative?.item ?? null,
        gain: gain && gain.value > 0 ? gain : null,
        note: `Replaces ${worn ? worn.name : 'nothing'}`,
        sameAsWorn: false,
    }
}

function SlotButton({
    slot,
    file,
    plan,
    onOpen,
}: {
    slot: Slot
    file: ResultsFile | null
    plan: Plan | null
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
    const { item, gain, note, sameAsWorn } = plan
        ? planView(entry, plan.gear[slot])
        : wornView(entry)
    const name = item ? item.name : 'Nothing equipped'
    const suffix = sameAsWorn
        ? ', same as what you wear'
        : gain
          ? `, ${formatGain(gain)}`
          : ''
    return (
        <button
            type="button"
            className={item ? 'slot' : 'slot slot-empty'}
            data-quality={item?.quality}
            aria-label={`${label}: ${name}${suffix}`}
            onClick={() => onOpen(slot)}
        >
            <span className="slot-glyph" aria-hidden="true">
                {item ? QUALITY_GLYPHS[item.quality] : ''}
            </span>
            <span className="slot-label">{label}</span>
            <span className="slot-item">{name}</span>
            {gain && <GainBadge gain={gain} />}
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
    plan = null,
    top,
    onOpenSlot,
}: {
    file: ResultsFile | null
    /** The plan whose gear the slots show, or null for what you wear. */
    plan?: Plan | null
    top?: ReactNode
    onOpenSlot: (slot: Slot) => void
}) {
    const column = (slots: Slot[], className: string, after?: ReactNode) => (
        <div className={className}>
            {slots.map((slot) => (
                <SlotButton
                    key={slot}
                    slot={slot}
                    file={file}
                    plan={plan}
                    onOpen={onOpenSlot}
                />
            ))}
            {after}
        </div>
    )
    return (
        <section className="gear-pane" aria-label="Gear">
            {top && <div className="gear-top">{top}</div>}
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
