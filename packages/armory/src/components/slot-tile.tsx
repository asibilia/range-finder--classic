/**
 * An item's tile on a slot: our own line glyph for the slot (no game art),
 * on a tile ringed in the item's quality colour.
 */
import { cn } from '@/lib/utils'

import type { Item } from '../gains'
import type { Slot } from '../results-file'

/** 24×24 line glyphs, one per slot (the approved mockup's own drawings). */
const GLYPHS: Record<Slot, string> = {
    head: 'M5 16a7 7 0 0 1 14 0v3H5zM12 9V6',
    neck: 'M6 4c0 7 12 7 12 0M10 13l2 5 2-5-2-2z',
    shoulder: 'M3 16c2-6 6-9 9-9s7 3 9 9l-4 1-5-4-5 4z',
    back: 'M7 4h10l2 16-7-3-7 3z',
    chest: 'M8 4l4 2 4-2 4 3-2 3v10H8V10L4 7z',
    wrist: 'M6 8h12v8H6zM6 12h12',
    hands: 'M7 20V10h10v10zM9 10V5M12 10V4M15 10V5',
    waist: 'M3 10h18v4H3zM10 9h4v6h-4z',
    legs: 'M7 4h10l-1 16h-3l-1-10-1 10H8z',
    feet: 'M8 4h4v10l7 2v4H8z',
    finger_1: 'M12 9a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM12 3l2 3-2 2-2-2z',
    finger_2: 'M12 9a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM12 3l2 3-2 2-2-2z',
    trinket_1: 'M12 4l6 8-6 8-6-8zM12 9v6',
    trinket_2: 'M12 4l6 8-6 8-6-8zM12 9v6',
    main_hand: 'M5 20L18 5M14 4c4 0 6 3 5 7-2-2-4-3-6-3z',
    off_hand: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
    relic: 'M9 4h6v16H9zM6 9h12M9 14h6',
}

const QUALITY_RING: Record<Item['quality'], string> = {
    poor: 'border-quality-poor',
    common: 'border-quality-common',
    uncommon: 'border-quality-uncommon',
    rare: 'border-quality-rare',
    epic: 'border-quality-epic',
    legendary: 'border-quality-legendary',
}

/**
 * The tile.
 *
 * @param slot - The slot, for its glyph.
 * @param quality - The item's quality, or null for an empty slot.
 * @param empty - Before a file loads: a faint dashed tile.
 */
export function SlotTile({
    slot,
    quality,
    empty,
}: {
    slot: Slot
    quality: Item['quality'] | null
    empty?: boolean
}) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'grid size-10 place-items-center rounded-lg border-2 bg-muted',
                quality ? QUALITY_RING[quality] : 'border-dashed border-border',
                empty && 'bg-transparent'
            )}
        >
            <svg
                viewBox="0 0 24 24"
                className={cn(
                    'size-5 fill-none stroke-current stroke-[1.5]',
                    !quality && 'opacity-45'
                )}
                strokeLinejoin="round"
                strokeLinecap="round"
            >
                <path d={GLYPHS[slot]} />
            </svg>
        </span>
    )
}
