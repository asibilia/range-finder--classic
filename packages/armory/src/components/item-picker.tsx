/**
 * The item picker (spec section 7), as the mockup lays it out: what is in
 * the slot now, then the slot's ranked alternatives. Each row has a quality
 * marker, the name and its flags (`in your bags`, `needs level 33`,
 * Classic data), the gain large on the right, the source, and a wishlist
 * toggle. A slot with nothing to rank says why.
 */
import { useRef } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatGain, gainOf, type Item, type SlotEntry } from '../gains'
import { itemName } from '../item-name'
import type { Slot } from '../results-file'
import { SLOT_LABELS } from '../slot-labels'
import { ItemLink } from './item-link'
import { PlannerDialog } from './planner-dialog'
import { QualityGem } from './quality-gem'
import { Provisional } from './readings'

/** One wishlist entry: the item and the slot it was first added from. */
export type WishlistEntry = { item: Item; slot: Slot }

/** The wishlist, keyed by item id, in the order items were added. */
export type Wishlist = Map<number, WishlistEntry>

function ClassicData({ item }: { item: Item }) {
    if (item.data !== 'classic') return null
    return (
        <p className="text-xs text-muted-foreground">
            <Badge
                variant="outline"
                className="mr-1.5 h-4 px-1.5 text-[0.65rem]"
            >
                Classic data
            </Badge>
            <span>Stats and source may predate Forever.</span>
        </p>
    )
}

/**
 * The picker.
 *
 * @param entry - The slot's entry in the file.
 * @param slot - The slot.
 * @param focusItemId - The item whose row takes focus on open, if any.
 * @param level - The character's level (for `Needs level`).
 * @param characterClass - The character's class (names unnamed items).
 * @param bagItemIds - Items in the bags that beat what is worn here.
 * @param wishlist - The wishlist.
 * @param onToggle - Adds an item to the wishlist, or takes it off.
 * @param onClose - Closes the picker.
 */
export function ItemPicker({
    entry,
    slot,
    focusItemId,
    label,
    provisional = false,
    level,
    characterClass,
    bagItemIds,
    wishlist,
    onToggle,
    onClose,
}: {
    entry: SlotEntry | undefined
    slot: Slot
    /**
     * An item whose row is focused and scrolled into view on open (from a
     * `Best:` link); otherwise `Close` takes focus.
     */
    focusItemId?: number
    /** The slot's label as the page shows it (`Two-hand`, `Totem`). */
    label?: string
    provisional?: boolean
    level: number
    characterClass: string
    bagItemIds: number[]
    wishlist: Wishlist
    onToggle: (item: Item, slot: Slot) => void
    onClose: () => void
}) {
    const focusRef = useRef<HTMLLIElement>(null)
    const worn = entry?.worn ?? null
    const alternatives = (entry?.alternatives ?? []).filter(
        (alternative) => alternative.item.item_id !== worn?.item_id
    )
    const title = label ?? SLOT_LABELS[slot]
    const units = new Set(
        alternatives.map((alternative) => gainOf(alternative)?.unit)
    )
    const scores = units.has('DPS')
        ? 'Scores are DPS from the sim.'
        : 'Scores are EP, attack power = 1.'
    const isTrinket = slot === 'trinket_1' || slot === 'trinket_2'
    return (
        <PlannerDialog
            title={title}
            focusOnOpen={focusRef}
            description={
                <>
                    {`Comparing with what you wear. ${scores} `}
                    {provisional && <Provisional />}
                </>
            }
            onClose={onClose}
            overPane
        >
            <div className="flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5">
                <QualityGem quality={worn?.quality ?? null} />
                <div className="flex flex-col">
                    <p className="text-[0.78125rem] text-muted-foreground">
                        In this slot now
                    </p>
                    <p className="font-bold">
                        {worn ? (
                            <ItemLink
                                itemId={worn.item_id}
                                name={itemName(worn, slot, characterClass)}
                                allowTooltip={worn.data === 'forever'}
                            />
                        ) : (
                            'Nothing equipped'
                        )}
                    </p>
                    {worn && <ClassicData item={worn} />}
                </div>
            </div>
            {alternatives.length === 0 ? (
                <p className="py-3.5 text-muted-foreground">
                    {isTrinket
                        ? 'No trinkets in the data yet. Once the export sees one in your bags, or the sim learns one, it shows up here.'
                        : `No ${title.toLowerCase()}s in the sim data yet, so there's nothing to rank. Your current one stays.`}
                </p>
            ) : (
                <ol aria-label="Better for you" className="flex flex-col">
                    {alternatives.map((alternative) => {
                        const { item } = alternative
                        const gain = gainOf(alternative)
                        const listed = wishlist.has(item.item_id)
                        const text = gain ? formatGain(gain) : null
                        const unitAt = text ? text.lastIndexOf(' ') : -1
                        return (
                            <li
                                key={item.item_id}
                                ref={
                                    item.item_id === focusItemId
                                        ? focusRef
                                        : undefined
                                }
                                tabIndex={-1}
                                data-quality={item.quality}
                                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t px-0.5 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                                <QualityGem quality={item.quality} />
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="font-bold">
                                        <ItemLink
                                            itemId={item.item_id}
                                            name={itemName(
                                                item,
                                                slot,
                                                characterClass
                                            )}
                                            allowTooltip={
                                                item.data === 'forever'
                                            }
                                        />
                                    </p>
                                    {bagItemIds.includes(item.item_id) && (
                                        <Badge
                                            variant="outline"
                                            className="h-auto border-chart-2 px-1.5 py-0 text-[0.71875rem] font-normal text-chart-2-text"
                                        >
                                            in your bags
                                        </Badge>
                                    )}
                                    {item.required_level > level && (
                                        <Badge
                                            variant="outline"
                                            className="h-auto border-muted-foreground px-1.5 py-0 text-[0.71875rem] font-normal"
                                        >
                                            {`needs level ${item.required_level}`}
                                        </Badge>
                                    )}
                                </div>
                                {text ? (
                                    <p
                                        className={cn(
                                            'text-right text-xl leading-none tabular-nums',
                                            gain && gain.value > 0
                                                ? 'text-gain-text'
                                                : 'text-muted-foreground'
                                        )}
                                    >
                                        {text.slice(0, unitAt)}
                                        <span className="text-[0.78125rem] text-muted-foreground">
                                            {text.slice(unitAt)}
                                        </span>
                                    </p>
                                ) : (
                                    <span />
                                )}
                                <div className="col-start-2 flex flex-col gap-0.5">
                                    <p className="text-[0.78125rem] text-muted-foreground">
                                        {item.source.text}
                                    </p>
                                    <ClassicData item={item} />
                                </div>
                                <div className="col-span-2 col-start-2 flex justify-end">
                                    <Button
                                        variant="outline"
                                        className="h-auto rounded-full px-3 py-1.25 text-[0.84375rem] font-normal aria-pressed:border-chart-2 aria-pressed:text-chart-2-text"
                                        aria-pressed={listed}
                                        onClick={() => onToggle(item, slot)}
                                    >
                                        {listed
                                            ? 'On wishlist'
                                            : 'Add to wishlist'}
                                    </Button>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            )}
        </PlannerDialog>
    )
}

/**
 * The wishlist dialog: each item with the slot it was first added from, its
 * source and `Remove`.
 *
 * @param wishlist - The wishlist.
 * @param characterClass - The character's class (names unnamed items).
 * @param onRemove - Takes an item off.
 * @param onClose - Closes the dialog.
 */
export function WishlistDialog({
    wishlist,
    characterClass,
    onRemove,
    onClose,
}: {
    wishlist: Wishlist
    characterClass: string
    onRemove: (itemId: number) => void
    onClose: () => void
}) {
    const entries = [...wishlist.values()]
    return (
        <PlannerDialog title="Wishlist" onClose={onClose}>
            {entries.length === 0 ? (
                <p className="text-muted-foreground">
                    Nothing on your wishlist yet.
                </p>
            ) : (
                <ul className="flex flex-col">
                    {entries.map(({ item, slot }) => (
                        <li
                            key={item.item_id}
                            data-quality={item.quality}
                            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-t py-3"
                        >
                            <QualityGem quality={item.quality} />
                            <div className="flex flex-col gap-0.5">
                                <p className="font-semibold">
                                    <ItemLink
                                        itemId={item.item_id}
                                        name={itemName(
                                            item,
                                            slot,
                                            characterClass
                                        )}
                                        allowTooltip={item.data === 'forever'}
                                    />
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {SLOT_LABELS[slot]}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {item.source.text}
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onRemove(item.item_id)}
                            >
                                Remove
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </PlannerDialog>
    )
}
