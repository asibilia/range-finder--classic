/**
 * The item picker (spec section 7): what you wear, then the slot's ranked
 * alternatives, each with its gain, source and a wishlist toggle. Also the
 * wishlist dialog, which lists what was added, keyed by item id.
 */
import { Dialog } from './dialog'
import { formatGain, gainOf, type Item, type SlotEntry } from './gains'
import type { Slot } from './results-file'
import { SLOT_LABELS } from './slot-labels'

export type WishlistEntry = { item: Item; slot: Slot }

/** The wishlist, keyed by item id, in the order items were added. */
export type Wishlist = Map<number, WishlistEntry>

function ClassicData({ item }: { item: Item }) {
    if (item.data !== 'classic') return null
    return (
        <p className="classic-data">
            <span>Classic data</span>{' '}
            <span className="note">Stats and source may predate Forever.</span>
        </p>
    )
}

export function ItemPicker({
    entry,
    slot,
    level,
    wishlist,
    onToggle,
    onClose,
}: {
    entry: SlotEntry | undefined
    slot: Slot
    level: number
    wishlist: Wishlist
    onToggle: (item: Item, slot: Slot) => void
    onClose: () => void
}) {
    const worn = entry?.worn ?? null
    const alternatives = (entry?.alternatives ?? []).filter(
        (alternative) => alternative.item.item_id !== worn?.item_id
    )
    return (
        <Dialog title={SLOT_LABELS[slot]} onClose={onClose}>
            <h3>What you wear</h3>
            {worn ? (
                <div className="picker-worn" data-quality={worn.quality}>
                    <p className="item-name">{worn.name}</p>
                    <p className="note">{worn.source.text}</p>
                    <ClassicData item={worn} />
                </div>
            ) : (
                <p>Nothing equipped</p>
            )}
            <h3>Better for you</h3>
            <ol className="picker-list">
                {alternatives.map((alternative) => {
                    const { item } = alternative
                    const gain = gainOf(alternative)
                    const listed = wishlist.has(item.item_id)
                    return (
                        <li
                            key={item.item_id}
                            className="picker-row"
                            data-quality={item.quality}
                        >
                            <p className="item-name">{item.name}</p>
                            {gain && <p className="gain">{formatGain(gain)}</p>}
                            <p className="note">{item.source.text}</p>
                            {item.required_level > level && (
                                <p className="needs-level">{`Needs level ${item.required_level}`}</p>
                            )}
                            <ClassicData item={item} />
                            <button
                                type="button"
                                aria-pressed={listed}
                                onClick={() => onToggle(item, slot)}
                            >
                                {listed
                                    ? 'On your wishlist'
                                    : 'Add to wishlist'}
                            </button>
                        </li>
                    )
                })}
            </ol>
        </Dialog>
    )
}

export function WishlistDialog({
    wishlist,
    onRemove,
    onClose,
}: {
    wishlist: Wishlist
    onRemove: (itemId: number) => void
    onClose: () => void
}) {
    const entries = [...wishlist.values()]
    return (
        <Dialog title="Wishlist" onClose={onClose}>
            {entries.length === 0 ? (
                <p>Nothing on your wishlist yet.</p>
            ) : (
                <ul className="wishlist">
                    {entries.map(({ item, slot }) => (
                        <li key={item.item_id} data-quality={item.quality}>
                            <p className="item-name">{item.name}</p>
                            <p className="note">{SLOT_LABELS[slot]}</p>
                            <p className="note">{item.source.text}</p>
                            <button
                                type="button"
                                onClick={() => onRemove(item.item_id)}
                            >
                                Remove
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Dialog>
    )
}
