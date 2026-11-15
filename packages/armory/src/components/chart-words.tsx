/**
 * Small pieces the fight and pull charts share outside their lazily loaded
 * drawings: a sentence with its times coloured, and the placeholder that
 * holds a drawing's place (same height) while its code loads.
 */
import { cn } from '@/lib/utils'

const TIME = /(\d+:\d{2})/

/**
 * A sentence with each `m:ss` time in it coloured, as the mockup's headline
 * colours them (`... run out of mana at 0:48.`).
 *
 * @param text - The sentence.
 * @param className - The times' colour class.
 */
export function TimedWords({
    text,
    className,
}: {
    text: string
    className: string
}) {
    return (
        <span>
            {text.split(TIME).map((part, index) =>
                index % 2 === 1 ? (
                    <span key={index} className={className}>
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </span>
    )
}

/**
 * Holds a chart drawing's place while its code loads: the drawing's height
 * (`h-65`, 260 px), so nothing below it moves when it arrives.
 *
 * @param className - Extra classes.
 */
export function ChartPlaceholder({ className }: { className?: string }) {
    return (
        <div
            data-chart-loading
            aria-hidden="true"
            className={cn('h-65 w-full rounded-lg bg-muted/40', className)}
        />
    )
}
