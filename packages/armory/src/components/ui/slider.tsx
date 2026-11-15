import { Slider as SliderPrimitive } from '@base-ui/react/slider'
import { cn } from 'cn'

function Slider({
    className,
    defaultValue,
    value,
    min = 0,
    max = 100,
    thumbProps,
    reach,
    ...props
}: SliderPrimitive.Root.Props & {
    // Ours: thumbProps is ours, not shadcn's: props for every thumb.
    /** Passed to each thumb, whose hidden range input carries the name and value text. */
    thumbProps?: SliderPrimitive.Thumb.Props
    // Ours: reach is ours, not shadcn's.
    /** How far the slider can go (between min and max): the track past it is hatched, as the mockup draws it. */
    reach?: number
}) {
    const reachAt =
        reach === undefined || reach >= max
            ? null
            : `${((Math.max(reach, min) - min) / (max - min)) * 100}%`
    const _values = Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max]

    return (
        <SliderPrimitive.Root
            className={cn(
                'data-horizontal:w-full data-vertical:h-full',
                className
            )}
            data-slot="slider"
            defaultValue={defaultValue}
            value={value}
            min={min}
            max={max}
            // Ours: Base UI's default "center", not shadcn's "edge", which hides the
            // thumb until it is measured (and adds an inline script before hydration).
            thumbAlignment="center"
            {...props}
        >
            <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
                {/* Ours: an 8 px track (shadcn's is 4 px), as the mockup draws it. */}
                <SliderPrimitive.Track
                    data-slot="slider-track"
                    className="relative grow overflow-hidden rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)] select-none data-horizontal:h-2 data-horizontal:w-full data-vertical:h-full data-vertical:w-2"
                >
                    {/* Ours: the part out of reach, hatched. */}
                    {reachAt !== null && (
                        <span
                            data-slot="slider-out-of-reach"
                            aria-hidden="true"
                            className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_6px)] opacity-40"
                            style={{ left: reachAt }}
                        />
                    )}
                    <SliderPrimitive.Indicator
                        data-slot="slider-range"
                        className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
                    />
                </SliderPrimitive.Track>
                {Array.from({ length: _values.length }, (_, index) => (
                    // Ours: an 18 px thumb ringed in the background, as the mockup draws it.
                    <SliderPrimitive.Thumb
                        data-slot="slider-thumb"
                        key={index}
                        {...thumbProps}
                        className="relative block size-4.5 shrink-0 rounded-full border-3 border-background bg-foreground shadow-[0_0_0_1px_var(--ring)] ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50"
                    />
                ))}
            </SliderPrimitive.Control>
        </SliderPrimitive.Root>
    )
}

export { Slider }
