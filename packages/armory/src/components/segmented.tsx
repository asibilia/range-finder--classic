/**
 * A segmented control, as the owner's design draws one (`Current | BIS`,
 * `31 | 32 | 33`, `PvE | PvP`): a radio group of native radios inside a fieldset with its legend,
 * so arrow keys move between the options and a screen reader hears a group.
 */
import { type ReactNode, useId } from 'react'

import { cn } from '@/lib/utils'

/** One option; `icon` is drawn before the label, hidden from screen readers. */
export type SegmentOption = {
    value: string
    label: string
    icon?: ReactNode
    disabled?: boolean
}

/**
 * The control.
 *
 * @param legend - The group's name, shown above it.
 * @param options - The options, in order.
 * @param value - The option picked.
 * @param onChange - Another option was picked.
 * @param describedBy - The id of a line that explains the group.
 * @param hideLegend - Keep the legend for screen readers only.
 */
export function Segmented({
    legend,
    options,
    value,
    onChange,
    describedBy,
    hideLegend = false,
}: {
    legend: string
    options: SegmentOption[]
    value: string
    onChange: (value: string) => void
    describedBy?: string
    hideLegend?: boolean
}) {
    const name = useId()
    return (
        <fieldset aria-describedby={describedBy} className="min-w-0">
            <legend className={hideLegend ? 'sr-only' : 'mb-1 text-sm'}>
                {legend}
            </legend>
            {/* The owner's design: 38px tall, the picked option a raised
                dark pill (no outline), the others muted text. */}
            <div className="inline-flex h-9.5 items-center rounded-full border bg-background p-0.75">
                {options.map((option) => {
                    const id = `${name}-${option.value}`
                    return (
                        <span key={option.value} className="contents">
                            <input
                                type="radio"
                                id={id}
                                name={name}
                                value={option.value}
                                checked={value === option.value}
                                disabled={option.disabled}
                                onChange={() => onChange(option.value)}
                                className="peer sr-only"
                            />
                            <label
                                htmlFor={id}
                                className={cn(
                                    'inline-flex h-full cursor-pointer items-center rounded-full px-3.25 text-[0.9375rem] text-muted-foreground peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50',
                                    option.icon && 'gap-2 px-3',
                                    value === option.value &&
                                        'bg-secondary text-foreground',
                                    option.disabled &&
                                        'cursor-not-allowed opacity-50'
                                )}
                            >
                                {option.icon && (
                                    <span
                                        aria-hidden="true"
                                        className="inline-flex"
                                    >
                                        {option.icon}
                                    </span>
                                )}
                                {option.label}
                            </label>
                        </span>
                    )
                })}
            </div>
        </fieldset>
    )
}
