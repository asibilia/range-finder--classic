/**
 * One gear slot, as the mockup draws it: a compact button with the item's
 * tile, its slot label (with chips: `needs 33`, `better in bags`), the
 * item's name on one line (cut off with an ellipsis) and a note on the next
 * (`Best: Defender's Leather Helm`), and the gain pill on the edge facing
 * the figure. The full name is in the button's accessible name and in a
 * tooltip. The chips describe the button (`aria-describedby`) so the name
 * stays exact.
 */
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { formatGain, type Gain, gainSize } from '../gains'
import type { Slot } from '../results-file'
import type { SlotShown } from '../slot-view'
import { SlotTile } from './slot-tile'

/** Which side of the figure the slot sits on; the pill faces the figure. */
export type SlotSide = 'left' | 'right' | 'bottom'

/*
 * Where the pill sits. Around the figure (the gear pane's three-column
 * doll, `@min-[49rem]` of its container) it sits on the edge facing the
 * figure, in the gap between the columns; on a narrower doll it sits on
 * the slot's top edge, as the mockup does under 860 px.
 */
const PILL_PLACE: Record<SlotSide, string> = {
    left: '-top-2.75 right-2.5 @min-[49rem]/doll:top-1/2 @min-[49rem]/doll:-right-7 @min-[49rem]/doll:-translate-y-1/2',
    right: '-top-2.75 right-2.5 @min-[49rem]/doll:top-1/2 @min-[49rem]/doll:right-auto @min-[49rem]/doll:-left-7 @min-[49rem]/doll:-translate-y-1/2',
    bottom: '-top-3 right-3.5',
}

/** Room on the inner edge for the pill, so it never covers the name. */
const ROOM_FOR_PILL: Record<SlotSide, string> = {
    left: '@min-[49rem]/doll:pr-10.5',
    right: '@min-[49rem]/doll:pl-10.5',
    bottom: '',
}

/**
 * The gain pill: filled for a big upgrade, outlined for a small one; the
 * unit small after the number (`+16.7 EP`).
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
    const text = formatGain(gain)
    const unitAt = text.lastIndexOf(' ')
    return (
        <Badge
            data-size={size}
            variant={size === 'big' ? 'gain' : 'gain-outline'}
            className={cn(
                'h-auto items-baseline gap-0 rounded-full px-2.25 py-0.75 font-mono text-[0.8125rem] leading-tight font-bold shadow-[0_0_0_3px_var(--card)]',
                className
            )}
        >
            {text.slice(0, unitAt)}
            <small className="text-[0.625rem] font-bold opacity-75">
                {text.slice(unitAt)}
            </small>
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
    const { item, gain, note, chips, description } = shown
    const empty = onOpen === undefined
    const describedBy = [
        ...chips.map((_, index) => `${chipId}-${index}`),
        ...(description ? [`${chipId}-description`] : []),
    ]
    const button = (
        <button
            type="button"
            disabled={empty}
            aria-label={shown.name}
            aria-describedby={
                describedBy.length > 0 ? describedBy.join(' ') : undefined
            }
            data-quality={item?.quality}
            data-same={shown.sameAsWorn || undefined}
            onClick={() => onOpen?.(shown.slot)}
            className={cn(
                'relative grid min-h-14.5 w-full grid-cols-[2.375rem_minmax(0,1fr)] items-center gap-2.5 rounded-xl border bg-card py-1.75 pr-2.5 pl-2 text-left transition-[border-color,background-color,opacity] outline-none hover:border-ring/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                gain && ROOM_FOR_PILL[side],
                gain && gainSize(gain) === 'big' && 'border-gain/50',
                shown.sameAsWorn && 'opacity-60',
                empty && 'border-dashed bg-transparent',
                !item && !empty && 'border-dashed'
            )}
        >
            <SlotTile
                slot={shown.slot}
                quality={item?.quality ?? null}
                empty={empty}
            />
            <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-xs leading-tight text-muted-foreground">
                    {shown.label}
                    {chips.map((chip, index) => (
                        <Badge
                            key={chip}
                            id={`${chipId}-${index}`}
                            variant="outline"
                            className={cn(
                                'h-auto px-1.5 py-0 text-[0.65625rem] leading-normal font-normal',
                                chip.startsWith('needs')
                                    ? 'border-gain text-gain-text'
                                    : 'border-chart-2 text-chart-2-text'
                            )}
                        >
                            {chip}
                        </Badge>
                    ))}
                </span>
                <span
                    data-slot-name
                    className={cn(
                        'truncate text-sm leading-tight font-bold',
                        !item && 'font-normal text-muted-foreground italic',
                        empty && 'not-italic'
                    )}
                >
                    {shown.itemName ?? (empty ? 'Empty' : 'Nothing equipped')}
                </span>
                {note && (
                    <span
                        data-slot-note
                        className="truncate text-xs leading-tight text-muted-foreground"
                    >
                        {note}
                    </span>
                )}
                {description && (
                    <span id={`${chipId}-description`} className="sr-only">
                        {description}
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
    if (!shown.itemName) return button
    // A long name is cut off with an ellipsis: the tooltip (and the
    // accessible name) carry it whole.
    return (
        <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent>{shown.itemName}</TooltipContent>
        </Tooltip>
    )
}
