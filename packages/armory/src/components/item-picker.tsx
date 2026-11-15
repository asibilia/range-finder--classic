/**
 * The item picker (spec section 7): what you wear, then the slot's ranked
 * alternatives. Each row has a quality marker, the name and its flags (in
 * your bags, needs level, Classic data), the gain large on the right, the
 * source, and a wishlist toggle.
 */
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatGain, gainOf, type Item, type SlotEntry } from '../gains'
import { itemName } from '../item-name'
import type { Slot } from '../results-file'
import { SLOT_LABELS } from '../slot-labels'
import { PlannerDialog } from './planner-dialog'
import { QualityGem } from './quality-gem'

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
    level,
    characterClass,
    bagItemIds,
    wishlist,
    onToggle,
    onClose,
}: {
    entry: SlotEntry | undefined
    slot: Slot
    level: number
    characterClass: string
    bagItemIds: number[]
    wishlist: Wishlist
    onToggle: (item: Item, slot: Slot) => void
    onClose: () => void
}) {
    const worn = entry?.worn ?? null
    const alternatives = (entry?.alternatives ?? []).filter(
        (alternative) => alternative.item.item_id !== worn?.item_id
    )
    return (
        <PlannerDialog
            title={SLOT_LABELS[slot]}
            description="Gains are over what you wear, best first."
            onClose={onClose}
        >
            <div className="flex flex-col gap-4">
                <section className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-muted-foreground">
                        What you wear
                    </h3>
                    <div className="flex items-start gap-3 rounded-xl border border-dashed px-3 py-2.5">
                        <span className="pt-1.5">
                            <QualityGem quality={worn?.quality ?? null} />
                        </span>
                        {worn ? (
                            <div className="flex flex-col gap-0.5">
                                <p className="font-semibold">
                                    {itemName(worn, slot, characterClass)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {worn.source.text}
                                </p>
                                <ClassicData item={worn} />
                            </div>
                        ) : (
                            <p className="text-muted-foreground italic">
                                Nothing equipped
                            </p>
                        )}
                    </div>
                </section>
                <section className="flex flex-col gap-1">
                    <h3 className="text-sm font-medium text-muted-foreground">
                        Better for you
                    </h3>
                    <ol className="flex flex-col">
                        {alternatives.map((alternative) => {
                            const { item } = alternative
                            const gain = gainOf(alternative)
                            const listed = wishlist.has(item.item_id)
                            return (
                                <li
                                    key={item.item_id}
                                    data-quality={item.quality}
                                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t py-3"
                                >
                                    <QualityGem quality={item.quality} />
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <p className="font-semibold">
                                            {itemName(
                                                item,
                                                slot,
                                                characterClass
                                            )}
                                        </p>
                                        {bagItemIds.includes(item.item_id) && (
                                            <Badge
                                                variant="outline"
                                                className="h-4 border-chart-2 px-1.5 text-[0.65rem] text-chart-2-text"
                                            >
                                                In your bags
                                            </Badge>
                                        )}
                                        {item.required_level > level && (
                                            <Badge
                                                variant="outline"
                                                className="h-4 border-gain px-1.5 text-[0.65rem] text-gain-text"
                                            >
                                                {`Needs level ${item.required_level}`}
                                            </Badge>
                                        )}
                                    </div>
                                    {gain ? (
                                        <p
                                            className={cn(
                                                'text-right text-xl font-semibold tabular-nums',
                                                gain.value > 0
                                                    ? 'text-gain-text'
                                                    : 'text-muted-foreground'
                                            )}
                                        >
                                            {formatGain(gain)}
                                        </p>
                                    ) : (
                                        <span />
                                    )}
                                    <div className="col-start-2 flex flex-col gap-0.5">
                                        <p className="text-xs text-muted-foreground">
                                            {item.source.text}
                                        </p>
                                        <ClassicData item={item} />
                                    </div>
                                    <div className="col-start-3 flex justify-end">
                                        <Button
                                            variant={
                                                listed ? 'secondary' : 'outline'
                                            }
                                            size="sm"
                                            aria-pressed={listed}
                                            onClick={() => onToggle(item, slot)}
                                        >
                                            {listed
                                                ? 'On your wishlist'
                                                : 'Add to wishlist'}
                                        </Button>
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                </section>
            </div>
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
                                    {itemName(item, slot, characterClass)}
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
