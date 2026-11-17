/**
 * The Simulated Best icon (spec section 3): a five-point star inside a
 * ring, an original drawing. `best` (the sim's best, not owned) is orange
 * with a dashed ring; `owned` (you own the sim's best) is green with a
 * solid ring. Hidden from screen readers unless given a label.
 */
import { cn } from '@/lib/utils'

/** A five-point star around (12, 12), outer radius 6, inner 2.6. */
const STAR =
    'M12 6 L13.53 9.9 L17.71 10.15 L14.47 12.8 L15.53 16.85 L12 14.6 L8.47 16.85 L9.53 12.8 L6.29 10.15 L10.47 9.9 Z'

/**
 * The icon.
 *
 * @param variant - `best` or `owned`.
 * @param label - What it means, when no text beside it says so; it is then
 * an image named by it.
 * @param className - Extra classes (its size is 1em by default).
 */
export function SimBestIcon({
    variant,
    label,
    className,
}: {
    variant: 'best' | 'owned'
    label?: string
    className?: string
}) {
    const colour = variant === 'best' ? 'var(--primary)' : 'var(--owned)'
    const named = label
        ? ({ role: 'img', 'aria-label': label } as const)
        : ({ 'aria-hidden': true } as const)
    return (
        <svg
            viewBox="0 0 24 24"
            data-sim-best={variant}
            className={cn('inline-block size-[1em] shrink-0', className)}
            {...named}
        >
            <circle
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke={colour}
                strokeWidth="1.8"
                strokeDasharray={variant === 'best' ? '3 2.2' : undefined}
            />
            <path d={STAR} fill={colour} stroke={colour} strokeWidth="0.6" />
        </svg>
    )
}
