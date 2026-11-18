/**
 * The callout card under the left slots (spec #109 section 8): the one best
 * next step `nextStep` picks. A bag upgrade (`Equip`, then `You wear ...
 * now.` and `Undo`), several of them (a row each, biggest first), the
 * easiest gap to go get (`Add to wishlist`, `Other options`), or every
 * slot best-in-slot (green). Gains read `+`: they are over what you wear.
 */
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatGain, type Item } from '../gains'
import { itemName, slotWord } from '../item-name'
import type { BagUpgrade, NextStep } from '../next-step'
import type { ResultsFile, Slot } from '../results-file'
import { slotLabel } from '../slot-labels'
import type { Wishlist } from './item-picker'
import { SimBestIcon } from './sim-best-icon'

/** Rows shown before `Show N more`. */
const ROWS_FOLDED = 3

/** Plural slot words read `are in your bags`; the others `is`. */
const PLURAL_WORDS = /s$/

const CARD =
    'mt-auto rounded-xl border border-dashed px-3 py-2.5 text-[0.84375rem] text-muted-foreground'

const BUTTON =
    'mt-2 h-auto rounded-full px-3 py-1.25 text-[0.84375rem] font-normal'

function Gain({ value, unit }: { value: number; unit: 'EP' | 'DPS' }) {
    return (
        <span className="font-bold whitespace-nowrap text-gain-text">
            {formatGain({ value, unit })}
        </span>
    )
}

/**
 * One bag upgrade: `Berylline Pads are in your bags, +7.0 EP over the
 * shoulders you wear. No dungeon needed.` and `Equip` (only when the file
 * has its results); once worn, `You wear Berylline Pads now. Serpent's
 * Shoulders went to your bags.` and `Undo`.
 */
function BagOne({
    file,
    upgrade,
    bagWorn,
    onWear,
    onUndo,
}: {
    file: ResultsFile
    upgrade: BagUpgrade
    bagWorn: number | null
    onWear: (itemId: number) => void
    onUndo: () => void
}) {
    const named = (item: Item) =>
        itemName(item, upgrade.slot, file.character.class)
    const worn =
        file.slots.find((entry) => entry.slot === upgrade.slot)?.worn ?? null
    const word = slotWord(upgrade.slot, file.character.class)
    const name = named(upgrade.item)
    const on = bagWorn === upgrade.item.item_id
    return (
        <div
            aria-live="polite"
            className={cn(CARD, 'border-chart-2 bg-chart-2/5')}
        >
            {on ? (
                <p>
                    You wear <b className="text-foreground">{name}</b> now.
                    {worn ? ` ${named(worn)} went to your bags.` : ''}
                </p>
            ) : (
                <p>
                    <b className="text-foreground">{name}</b>
                    {` ${PLURAL_WORDS.test(word) ? 'are' : 'is'} in your bags, `}
                    <Gain value={upgrade.gain_ep} unit="EP" />
                    {` over the ${word} you wear. No dungeon needed.`}
                </p>
            )}
            {(on || upgrade.results) && (
                <Button
                    variant="outline"
                    className={BUTTON}
                    onClick={() =>
                        on ? onUndo() : onWear(upgrade.item.item_id)
                    }
                >
                    {on ? 'Undo' : 'Equip'}
                </Button>
            )}
        </div>
    )
}

/**
 * Several bag upgrades: `3 items in your bags beat what you wear, +24.6 EP
 * together.`, then `Glinting Helm · Head +10.1 EP` rows, biggest first,
 * three of them until `Show N more` is pressed.
 */
function BagMany({
    file,
    upgrades,
    total,
}: {
    file: ResultsFile
    upgrades: BagUpgrade[]
    total: number
}) {
    const [open, setOpen] = useState(false)
    const hidden = upgrades.length - ROWS_FOLDED
    const rows = open ? upgrades : upgrades.slice(0, ROWS_FOLDED)
    return (
        <div className={cn(CARD, 'border-chart-2 bg-chart-2/5')}>
            <p>
                {`${upgrades.length} items in your bags beat what you wear, `}
                <Gain value={total} unit="EP" />
                {' together.'}
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
                {rows.map((upgrade) => (
                    <li key={upgrade.item.item_id}>
                        <b className="text-foreground">
                            {itemName(
                                upgrade.item,
                                upgrade.slot,
                                file.character.class
                            )}
                        </b>
                        {` · ${slotLabel(upgrade.slot, file)} `}
                        <Gain value={upgrade.gain_ep} unit="EP" />
                    </li>
                ))}
            </ul>
            {hidden > 0 && (
                <Button
                    variant="link"
                    className="mt-1 h-auto p-0 text-[0.84375rem] font-normal"
                    aria-expanded={open}
                    onClick={() => setOpen((was) => !was)}
                >
                    {open ? 'Show fewer' : `Show ${hidden} more`}
                </Button>
            )}
        </div>
    )
}

/**
 * The easiest gap to go get: `Hunting Pants (Vendor: Harggan, The
 * Hinterlands), +5.0 EP on your leggings.`, with `Add to wishlist` and
 * `Other options` (the slot's picker).
 */
function GoGet({
    file,
    step,
    listed,
    onToggleWishlist,
    onOpenSlot,
}: {
    file: ResultsFile
    step: Extract<NextStep, { kind: 'go_get' }>
    listed: boolean
    onToggleWishlist: (item: Item, slot: Slot) => void
    onOpenSlot: (slot: Slot) => void
}) {
    const { item, slot, gain } = step
    const source =
        item.source.kind === 'unknown' ? '' : ` (${item.source.text})`
    return (
        <div className={cn(CARD, 'border-primary/60 bg-primary/5')}>
            <p>
                <b className="text-foreground">
                    {itemName(item, slot, file.character.class)}
                </b>
                {`${source}, `}
                <Gain value={gain.value} unit={gain.unit} />
                {` on your ${slotWord(slot, file.character.class)}.`}
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="outline"
                    className={cn(
                        BUTTON,
                        'aria-pressed:border-chart-2 aria-pressed:text-chart-2-text'
                    )}
                    aria-pressed={listed}
                    onClick={() => onToggleWishlist(item, slot)}
                >
                    {listed ? 'On wishlist' : 'Add to wishlist'}
                </Button>
                <Button
                    variant="outline"
                    className={BUTTON}
                    aria-haspopup="dialog"
                    onClick={() => onOpenSlot(slot)}
                >
                    Other options
                </Button>
            </div>
        </div>
    )
}

/**
 * Every slot best-in-slot: `Best-in-slot for level 33`, `Every slot
 * matches the sim's best set you can get now.` and, when some alternative
 * needs a higher level, `Next upgrades open at level 35.`
 */
function AllBis({ step }: { step: Extract<NextStep, { kind: 'all_bis' }> }) {
    return (
        <div className={cn(CARD, 'border-solid border-owned/60 bg-owned/5')}>
            <p className="flex items-center gap-1.5 font-bold text-owned">
                <SimBestIcon variant="owned" />
                {`Best-in-slot for level ${step.level}`}
            </p>
            <p className="mt-1">
                Every slot matches the sim&apos;s best set you can get now.
                {step.nextLevel !== null &&
                    ` Next upgrades open at level ${step.nextLevel}.`}
            </p>
        </div>
    )
}

/**
 * The card.
 *
 * @param step - What `nextStep` picked (not null).
 * @param bagWorn - The bag upgrade put on with Equip, or null.
 * @param wishlist - The wishlist (`On wishlist` for an item on it).
 */
export function NextStepCard({
    file,
    step,
    bagWorn,
    wishlist,
    onWearBag,
    onUndoBag,
    onToggleWishlist,
    onOpenSlot,
}: {
    file: ResultsFile
    step: NextStep
    bagWorn: number | null
    wishlist: Wishlist
    onWearBag: (itemId: number) => void
    onUndoBag: () => void
    onToggleWishlist: (item: Item, slot: Slot) => void
    onOpenSlot: (slot: Slot) => void
}) {
    switch (step.kind) {
        case 'bag_one':
            return (
                <BagOne
                    file={file}
                    upgrade={step.upgrade}
                    bagWorn={bagWorn}
                    onWear={onWearBag}
                    onUndo={onUndoBag}
                />
            )
        case 'bag_many':
            return (
                <BagMany
                    file={file}
                    upgrades={step.upgrades}
                    total={step.total}
                />
            )
        case 'go_get':
            return (
                <GoGet
                    file={file}
                    step={step}
                    listed={wishlist.has(step.item.item_id)}
                    onToggleWishlist={onToggleWishlist}
                    onOpenSlot={onOpenSlot}
                />
            )
        case 'all_bis':
            return <AllBis step={step} />
    }
}
