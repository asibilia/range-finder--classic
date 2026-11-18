/**
 * One gear slot, as the owner's design draws it: a dark glass tile that is
 * one button, with the item's icon square, then three lines: the slot label
 * (with its chips inline: `Feet · better in bags`), the item's name (bold,
 * cut off with an ellipsis), and either `Best: <item>` (a slot with a gap),
 * `Next: <item> at level N` (a slot that is the sim's best for now, or
 * empty, with an item to come at a higher level; muted) or the first part
 * of the worn item's source. The gap or `BIS` badge sits
 * inside the tile, on the edge facing the figure. The `Best:` (or `Next:`) item is a
 * link-styled button laid over the third line from outside the slot's
 * button, opening the picker on that item. The full name is in the
 * button's accessible name and in a tooltip. The chips describe the button
 * (`aria-describedby`) so the name stays exact.
 */
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { formatGap, gainSize, type SlotGap } from '../gains'
import type { Slot } from '../results-file'
import type { SlotShown } from '../slot-view'
import { SimBestIcon } from './sim-best-icon'
import { SlotTile } from './slot-tile'

/** Which side of the figure the slot sits on; the badge faces the figure. */
export type SlotSide = 'left' | 'right' | 'bottom'

/*
 * The tile's inner layout, as the owner's design draws it: 10 px in, the
 * 38 px icon square, 10 px, then the three lines. The badge sits inside the
 * tile, in a 60 px slot on the edge facing the figure: the right on the
 * left column and the bottom row, the left (before the icon) on the right
 * column, mirrored.
 */
const BADGE_PLACE: Record<SlotSide, string> = {
    left: 'right-2.5',
    right: 'left-2.5',
    bottom: 'right-2.5',
}

/** Room for the badge, so it never covers the name (wider for `DPS`). */
function badgeRoom(side: SlotSide, gap: SlotGap): string {
    const wide = gap.kind === 'gap' && gap.gain.unit === 'DPS'
    if (side === 'right') return 'pl-20'
    return wide ? 'pr-25' : 'pr-20'
}

/**
 * Where the `Best:` line sits over the tile's third line: from the text
 * column's left edge to its right edge (past the badge's slot).
 */
function bestPlace(side: SlotSide, gap: SlotGap | null): string {
    if (!gap) return 'left-14.5 right-2.5'
    if (side === 'right') return 'left-32 right-2.5'
    const wide = gap.kind === 'gap' && gap.gain.unit === 'DPS'
    return cn('left-14.5', wide ? 'right-25' : 'right-20')
}

const BADGE =
    'h-5.5 items-center gap-0 rounded-sm px-2 py-0 font-mono text-xs leading-none font-bold'

/**
 * The slot's badge: the gap to the plan's item (`↓ 16.7`, `↓ 6.0 DPS`) in
 * JetBrains Mono, filled orange for a big one and outlined for a small one;
 * or a green outlined `BIS` with the `owned` icon when you wear the plan's
 * item. A small rounded rectangle inside the tile.
 *
 * @param gap - The gap, or `bis`.
 * @param className - Placement.
 */
export function GapBadge({
    gap,
    className,
}: {
    gap: SlotGap
    className?: string
}) {
    if (gap.kind === 'bis')
        return (
            <Badge
                variant="outline"
                data-bis
                className={cn(
                    BADGE,
                    'gap-1 border-owned-border bg-transparent text-owned',
                    className
                )}
            >
                <SimBestIcon variant="owned" />
                BIS
            </Badge>
        )
    const size = gainSize(gap.gain)
    return (
        <Badge
            data-size={size}
            variant={size === 'big' ? 'gain' : 'gain-outline'}
            className={cn(
                BADGE,
                size === 'small' && 'bg-transparent',
                className
            )}
        >
            <span aria-hidden="true">↓&nbsp;</span>
            {formatGap(gap.gain)}
            {gap.gain.unit === 'DPS' && (
                <small className="text-[0.625rem] font-bold opacity-75">
                    {' DPS'}
                </small>
            )}
        </Badge>
    )
}

/**
 * A slot button.
 *
 * @param shown - What the slot shows.
 * @param side - Where it sits around the figure.
 * @param onOpen - Opens the slot's item picker, with the item to focus when
 * opened from the `Best:` link; absent before a file loads (the slot is
 * then a disabled, dashed outline).
 */
export function SlotButton({
    shown,
    side,
    onOpen,
}: {
    shown: SlotShown
    side: SlotSide
    onOpen?: (slot: Slot, focusItemId?: number) => void
}) {
    const chipId = useId()
    const { item, gap, note, chips, description, best, next } = shown
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
                'glass relative grid min-h-15 w-full grid-cols-[2.375rem_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-1.25 text-left transition-[background-color,opacity] outline-none hover:bg-raised/70 focus-visible:ring-3 focus-visible:ring-ring/50',
                gap && badgeRoom(side, gap),
                shown.sameAsWorn && 'opacity-60',
                empty &&
                    'border border-dashed border-border bg-transparent shadow-none backdrop-blur-none'
            )}
        >
            <SlotTile quality={item?.quality ?? null} empty={empty} />
            <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs leading-4 text-muted-foreground">
                    {shown.label}
                    {chips.map((chip, index) => (
                        <span key={chip}>
                            <span aria-hidden="true">{' · '}</span>
                            <span
                                id={`${chipId}-${index}`}
                                data-chip
                                className={
                                    chip.startsWith('needs')
                                        ? 'text-gain-text'
                                        : 'text-chart-2-text'
                                }
                            >
                                {chip}
                            </span>
                        </span>
                    ))}
                </span>
                <span
                    data-slot-name
                    className={cn(
                        'truncate text-base leading-4.75 font-bold',
                        !item && 'font-normal text-muted-foreground italic',
                        empty && 'not-italic'
                    )}
                >
                    {shown.itemName ?? (empty ? 'Empty' : 'Nothing equipped')}
                </span>
                {(best || next) && onOpen ? (
                    // Room for the `Best:` or `Next:` line, laid over it
                    // from outside the button (a button can't hold a
                    // button).
                    <span aria-hidden="true" className="h-4" />
                ) : (
                    note && (
                        <span
                            data-slot-note
                            className="truncate text-xs leading-4 text-muted-foreground"
                        >
                            {note}
                        </span>
                    )
                )}
                {description && (
                    <span id={`${chipId}-description`} className="sr-only">
                        {description}
                    </span>
                )}
            </span>
            {gap && (
                <GapBadge
                    gap={gap}
                    className={cn(
                        'absolute top-1/2 -translate-y-1/2',
                        BADGE_PLACE[side]
                    )}
                />
            )}
        </button>
    )
    // A long name is cut off with an ellipsis: the tooltip (and the
    // accessible name) carry it whole.
    const withTooltip = shown.itemName ? (
        <Tooltip>
            <TooltipTrigger render={button} />
            <TooltipContent>{shown.itemName}</TooltipContent>
        </Tooltip>
    ) : (
        button
    )
    if (!onOpen || !(best || next)) return withTooltip
    // The `Best:` (or `Next:`) line is the tile's third line, but not inside
    // the slot's button: a sibling laid over it, so both are focusable in
    // order and the slot's name stays its own. Only the link takes clicks;
    // the rest of the line clicks through to the slot.
    const link = best ?? next
    if (!link) return withTooltip
    return (
        <div className="relative min-w-0">
            {withTooltip}
            <p
                data-best-line={best ? '' : undefined}
                data-next-line={best ? undefined : ''}
                className={cn(
                    'pointer-events-none absolute bottom-1.25 flex min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground',
                    bestPlace(side, gap)
                )}
            >
                <span className="shrink-0">{best ? 'Best:' : 'Next:'}</span>
                <button
                    type="button"
                    onClick={() => onOpen(shown.slot, link.itemId)}
                    className="pointer-events-auto min-w-0 truncate rounded-sm text-left text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    {link.name}
                </button>
                {!best && next && (
                    <span className="shrink-0">{`at level ${next.level}`}</span>
                )}
            </p>
        </div>
    )
}
