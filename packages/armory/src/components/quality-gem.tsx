/** A small diamond in an item's quality colour, for lists of items. */
import { cn } from '@/lib/utils'

import type { Item } from '../gains'

const QUALITY_FILL: Record<Item['quality'], string> = {
    poor: 'bg-quality-poor',
    common: 'bg-quality-common',
    uncommon: 'bg-quality-uncommon',
    rare: 'bg-quality-rare',
    epic: 'bg-quality-epic',
    legendary: 'bg-quality-legendary',
}

/**
 * The gem.
 *
 * @param quality - The item's quality, or null for nothing (an outline).
 */
export function QualityGem({ quality }: { quality: Item['quality'] | null }) {
    return (
        <span
            aria-hidden="true"
            data-quality={quality ?? undefined}
            className={cn(
                'mx-1 inline-block size-3 shrink-0 rotate-45 rounded-[2px]',
                quality ? QUALITY_FILL[quality] : 'ring-1 ring-border'
            )}
        />
    )
}
