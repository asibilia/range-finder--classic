/**
 * The "i": a small info icon (an original drawing), and the `About <x>`
 * button that shows a short text in a popover. The popover opens on hover,
 * on click or tap, and on Enter or Space once the button has focus; Escape
 * closes it and focus goes back to the button (Base UI's `Popover` with
 * `openOnHover`, as a tooltip doesn't open on click).
 */
import { cn } from '@/lib/utils'

import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

/**
 * The info icon: an "i" in a ring. Decorative.
 *
 * @param className - Extra classes (1em square by default).
 */
export function InfoIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={cn('inline-block size-[1em] shrink-0', className)}
        >
            <circle
                cx="8"
                cy="8"
                r="6.75"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
            />
            <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
            <path
                d="M8 7.2 V11.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </svg>
    )
}

/**
 * The `About <label>` button and its popover.
 *
 * @param label - What it is about (`Solo`); the button is named `About
 * <label>`.
 * @param text - What the popover says.
 */
export function InfoButton({ label, text }: { label: string; text: string }) {
    return (
        <Popover>
            <PopoverTrigger
                openOnHover
                aria-label={`About ${label}`}
                className="inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
                <InfoIcon className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-xs text-[0.8125rem]">
                {text}
            </PopoverContent>
        </Popover>
    )
}
