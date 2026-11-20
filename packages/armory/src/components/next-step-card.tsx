/**
 * The callout card under the left slots (spec #109 section 8): the one best
 * next step `nextStep` picks. A bag upgrade (`Equip`, then `You wear ...
 * now.` and `Undo`), several of them (a row each, biggest first, and
 * `Equip all N`), a quick fix, the easiest gap to go get (`Add to
 * wishlist`, `Other options`), or every slot best-in-slot (green). Gains
 * read `+`: they are over what you wear.
 */
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatGain, type Item } from '../gains'
import { itemName, slotWord } from '../item-name'
import type { BagUpgrade, NextStep, QuickFix } from '../next-step'
import type { BagItemsOn } from '../planner-state'
import type { ResultsFile, Slot } from '../results-file'
import { slotLabel } from '../slot-labels'
import type { Wishlist } from './item-picker'
import { ItemLink } from './item-link'
import { SimBestIcon } from './sim-best-icon'

/** Rows shown before `Show N more`. */
const ROWS_FOLDED = 3

/** Plural slot words read `are in your bags`; the others `is`. */
const PLURAL_WORDS = /s$/

/** The owner's plain glass box: no dashed border, no tint. */
const CARD = 'glass rounded-lg px-2.5 py-2.5 text-base text-muted-foreground'

/** The owner's light pill. */
const BUTTON = 'mt-2.5 h-7.5 px-4 text-base'

function Gain({ value, unit }: { value: number; unit: 'EP' | 'DPS' }) {
    return (
        <span className="font-mono font-bold whitespace-nowrap text-gain-text">
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
    bagOn,
    onWear,
    onUndo,
}: {
    file: ResultsFile
    upgrade: BagUpgrade
    bagOn: BagItemsOn
    onWear: (itemId: number) => void
    onUndo: () => void
}) {
    const named = (item: Item) =>
        itemName(item, upgrade.slot, file.character.class)
    const worn =
        file.slots.find((entry) => entry.slot === upgrade.slot)?.worn ?? null
    const word = slotWord(upgrade.slot, file.character.class)
    const name = (
        <ItemLink
            itemId={upgrade.item.item_id}
            name={named(upgrade.item)}
            allowTooltip={upgrade.item.data === 'forever'}
        />
    )
    const on = bagOn.includes(upgrade.item.item_id)
    return (
        <div aria-live="polite" className={CARD}>
            {on ? (
                <p>
                    You wear <b className="font-bold text-foreground">{name}</b>{' '}
                    now.
                    {worn ? ` ${named(worn)} went to your bags.` : ''}
                </p>
            ) : (
                <p>
                    <b className="font-bold text-foreground">{name}</b>
                    {` ${PLURAL_WORDS.test(word) ? 'are' : 'is'} in your bags, `}
                    <Gain value={upgrade.gain_ep} unit="EP" />
                    {` over the ${word} you wear. No dungeon needed.`}
                </p>
            )}
            {(on || upgrade.results) && (
                <Button
                    variant="pill"
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
 * three of them until `Show N more` is pressed. With their combined results
 * in the file, `Equip all 3`; once worn, `You wear 3 bag items now. What
 * they replaced went to your bags.` and `Undo`.
 */
function BagMany({
    file,
    step,
    onWearAll,
    onUndo,
}: {
    file: ResultsFile
    step: Extract<NextStep, { kind: 'bag_many' }>
    onWearAll: () => void
    onUndo: () => void
}) {
    const { upgrades, total, canWearAll, allOn } = step
    const [open, setOpen] = useState(false)
    const hidden = upgrades.length - ROWS_FOLDED
    const rows = open ? upgrades : upgrades.slice(0, ROWS_FOLDED)
    return (
        <div aria-live="polite" className={CARD}>
            {allOn ? (
                <p>
                    {`You wear ${upgrades.length} bag items now. What they replaced went to your bags.`}
                </p>
            ) : (
                <p>
                    {`${upgrades.length} items in your bags beat what you wear, `}
                    <Gain value={total} unit="EP" />
                    {' together.'}
                </p>
            )}
            <ul className="mt-1.5 flex flex-col gap-0.5">
                {rows.map((upgrade) => (
                    <li key={upgrade.item.item_id}>
                        <b className="font-bold text-foreground">
                            <ItemLink
                                itemId={upgrade.item.item_id}
                                name={itemName(
                                    upgrade.item,
                                    upgrade.slot,
                                    file.character.class
                                )}
                                allowTooltip={upgrade.item.data === 'forever'}
                            />
                        </b>
                        {` · ${slotLabel(upgrade.slot, file)} `}
                        <Gain value={upgrade.gain_ep} unit="EP" />
                    </li>
                ))}
            </ul>
            {(hidden > 0 || allOn || canWearAll) && (
                <div className="flex flex-wrap gap-x-2">
                    {hidden > 0 && (
                        <Button
                            variant="pill"
                            className={BUTTON}
                            aria-expanded={open}
                            onClick={() => setOpen((was) => !was)}
                        >
                            {open ? 'Show fewer' : `Show ${hidden} more`}
                        </Button>
                    )}
                    {(allOn || canWearAll) && (
                        <Button
                            variant="pill"
                            className={BUTTON}
                            onClick={() => (allOn ? onUndo() : onWearAll())}
                        >
                            {allOn ? 'Undo' : `Equip all ${upgrades.length}`}
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

/** What fixing each kind of quick fix is worth, before the number. */
const FIX_WORTH: Record<QuickFix['kind'], string> = {
    imbue: 'Putting it back is worth about',
    empty_slot: 'Filling it is worth about',
    weapon_skill: 'Training it up is worth about',
}

/**
 * A quick fix, no new gear: `Windfury Weapon wasn't on your weapon at
 * export. Putting it back is worth about +18.2 DPS.`, then the others worth
 * 3.0 DPS or more: `Also: Your off hand is empty. (+4.0 DPS).` No button.
 */
function QuickFixes({
    step,
}: {
    step: Extract<NextStep, { kind: 'quick_fix' }>
}) {
    const { fix, also } = step
    const worth = (other: QuickFix) =>
        formatGain({ value: other.dps_gain, unit: 'DPS' })
    const others = also
        .map((other) => `${other.text} (${worth(other)})`)
        .join('; ')
    return (
        <div className={CARD}>
            <p>
                {`${fix.text} ${FIX_WORTH[fix.kind]} `}
                <Gain value={fix.dps_gain} unit="DPS" />.
            </p>
            {others && <p className="mt-1">{`Also: ${others}.`}</p>}
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
    const { item, slot, gain, madeWith } = step
    const source =
        item.source.kind === 'unknown' ? '' : ` (${item.source.text})`
    const name = (
        <b className="font-bold text-foreground">
            <ItemLink
                itemId={item.item_id}
                name={itemName(item, slot, file.character.class)}
                allowTooltip={item.data === 'forever'}
            />
        </b>
    )
    return (
        <div className={CARD}>
            <p>
                {madeWith === null ? (
                    <>
                        {name}
                        {`${source}, `}
                    </>
                ) : (
                    <>
                        {'You can make '}
                        {name}
                        {` with your ${madeWith}, `}
                    </>
                )}
                <Gain value={gain.value} unit={gain.unit} />
                {` on your ${slotWord(slot, file.character.class)}.`}
            </p>
            <div className="flex flex-wrap gap-x-2">
                <Button
                    variant="pill"
                    className={cn(BUTTON, 'aria-pressed:font-bold')}
                    aria-pressed={listed}
                    onClick={() => onToggleWishlist(item, slot)}
                >
                    {listed ? 'On wishlist' : 'Add to wishlist'}
                </Button>
                <Button
                    variant="pill"
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
        <div className={CARD}>
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
 * @param bagOn - The bag upgrades put on with Equip or Equip all.
 * @param wishlist - The wishlist (`On wishlist` for an item on it).
 */
export function NextStepCard({
    file,
    step,
    bagOn,
    wishlist,
    onWearBag,
    onWearAllBags,
    onUndoBag,
    onToggleWishlist,
    onOpenSlot,
}: {
    file: ResultsFile
    step: NextStep
    bagOn: BagItemsOn
    wishlist: Wishlist
    onWearBag: (itemId: number) => void
    onWearAllBags: () => void
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
                    bagOn={bagOn}
                    onWear={onWearBag}
                    onUndo={onUndoBag}
                />
            )
        case 'bag_many':
            return (
                <BagMany
                    file={file}
                    step={step}
                    onWearAll={onWearAllBags}
                    onUndo={onUndoBag}
                />
            )
        case 'quick_fix':
            return <QuickFixes step={step} />
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
