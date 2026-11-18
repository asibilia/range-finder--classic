/**
 * An item's icon square on a slot, as the owner's design draws it (owner
 * decision F): an empty rounded square bordered in the item's quality colour
 * (green uncommon, blue rare...), faintly tinted with it, and no glyph,
 * until the page has real item icons. An empty slot is a dashed square.
 */
import { cn } from '@/lib/utils'

import type { Item } from '../gains'

/** The border and faint fill for each quality. */
const QUALITY_SQUARE: Record<Item['quality'], string> = {
    poor: 'border-quality-poor bg-quality-poor/10',
    common: 'border-quality-common bg-quality-common/10',
    uncommon: 'border-quality-uncommon bg-quality-uncommon/15',
    rare: 'border-quality-rare bg-quality-rare/15',
    epic: 'border-quality-epic bg-quality-epic/15',
    legendary: 'border-quality-legendary bg-quality-legendary/15',
}

/**
 * The square.
 *
 * @param quality - The item's quality, or null for an empty slot (dashed).
 * @param empty - Before a file loads: fainter still.
 */
export function SlotTile({
    quality,
    empty,
}: {
    quality: Item['quality'] | null
    empty?: boolean
}) {
    return (
        <span
            aria-hidden="true"
            data-icon-square
            className={cn(
                'block size-9.5 rounded-lg border-[1.5px]',
                quality
                    ? QUALITY_SQUARE[quality]
                    : 'border-dashed border-border-strong',
                empty && 'opacity-60'
            )}
        />
    )
}
