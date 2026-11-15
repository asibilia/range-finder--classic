/**
 * One gear slot: a button with the item's tile, its slot label, name and a
 * note, the gain pill on the edge facing the figure, and chips (`Needs
 * level 33`, `Better in bags`). The button's accessible name is spelled out
 * (spec section 5); the chips describe it (`aria-describedby`) so the name
 * stays exact.
 */
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { formatGain, type Gain, gainSize } from '../gains'
import type { Slot } from '../results-file'
import type { SlotShown } from '../slot-view'
import { SlotTile } from './slot-tile'

/** Which side of the figure the slot sits on; the pill faces the figure. */
export type SlotSide = 'left' | 'right' | 'bottom'

const PILL_PLACE: Record<SlotSide, string> = {
    left: 'top-1/2 -right-8 -translate-y-1/2',
    right: 'top-1/2 -left-8 -translate-y-1/2',
    bottom: '-top-2.5 right-4',
}

const ROOM_FOR_PILL: Record<SlotSide, string> = {
    left: 'pr-11',
    right: 'pl-11',
    bottom: '',
}

/**
 * The gain pill: filled for a big upgrade, outlined for a small one.
 *
 * @param gain - The gain to show.
 * @param className - Placement.
 */
export function GainPill({
    gain,
    className,
}: {
    gain: Gain
    className?: string
}) {
    const size = gainSize(gain)
    return (
        <Badge
            data-size={size}
            variant={size === 'big' ? 'gain' : 'gain-outline'}
            className={cn('h-6 px-2 text-xs shadow-sm', className)}
        >
            {formatGain(gain)}
        </Badge>
    )
}

/**
 * A slot button.
 *
 * @param shown - What the slot shows.
 * @param side - Where it sits around the figure.
 * @param onOpen - Opens the slot's item picker; absent before a file loads
 * (the slot is then a disabled, dashed outline).
 */
export function SlotButton({
    shown,
    side,
    onOpen,
}: {
    shown: SlotShown
    side: SlotSide
    onOpen?: (slot: Slot) => void
}) {
    const chipId = useId()
    const { item, gain, note, chips } = shown
    const empty = onOpen === undefined
    return (
        <button
            type="button"
            disabled={empty}
            aria-label={shown.name}
            aria-describedby={
                chips.length > 0
                    ? chips.map((_, index) => `${chipId}-${index}`).join(' ')
                    : undefined
            }
            data-quality={item?.quality}
            data-same={shown.sameAsWorn || undefined}
            onClick={() => onOpen?.(shown.slot)}
            className={cn(
                'relative grid min-h-16 w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-xl border bg-card py-2 pr-3 pl-2 text-left shadow-xs transition-[border-color,background-color,opacity] outline-none hover:border-ring/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                gain && ROOM_FOR_PILL[side],
                gain && gainSize(gain) === 'big' && 'border-gain/50',
                shown.sameAsWorn && 'opacity-55',
                empty && 'border-dashed bg-transparent shadow-none',
                !item && !empty && 'border-dashed'
            )}
        >
            <SlotTile
                slot={shown.slot}
                quality={item?.quality ?? null}
                empty={empty}
            />
            <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {shown.label}
                    {chips.map((chip, index) => (
                        <Badge
                            key={chip}
                            id={`${chipId}-${index}`}
                            variant="outline"
                            className="h-4 border-gain px-1.5 text-[0.65rem] font-normal text-gain"
                        >
                            {chip}
                        </Badge>
                    ))}
                </span>
                <span
                    className={cn(
                        'truncate text-sm font-semibold',
                        !item && 'font-normal text-muted-foreground italic',
                        empty && 'not-italic'
                    )}
                >
                    {item ? item.name : empty ? 'Empty' : 'Nothing equipped'}
                </span>
                {note && (
                    <span className="truncate text-xs text-muted-foreground">
                        {note}
                    </span>
                )}
            </span>
            {gain && (
                <GainPill
                    gain={gain}
                    className={cn('absolute', PILL_PLACE[side])}
                />
            )}
        </button>
    )
}
