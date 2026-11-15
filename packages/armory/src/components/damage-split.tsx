/**
 * Where the damage comes from (spec section 9): one 100% stacked bar of
 * what you wear's split, and a legend with each part's swatch and share
 * (`Melee 33%`). Parts are coloured by order: the file has no spell school.
 */
import { splitParts } from '../chart-data'
import type { ResultsFile } from '../results-file'

type Result = ResultsFile['results'][number]

/** The split bar's accessible name. */
export const SPLIT_CHART_NAME = 'Damage split'

/**
 * The damage split.
 *
 * @param worn - What you wear's result on the fight the card is on.
 */
export function DamageSplit({ worn }: { worn: Result }) {
    const parts = splitParts(worn)
    return (
        <section className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">
                Where the damage comes from
            </h2>
            <p className="text-xs text-muted-foreground">
                What you wear, in this fight.
            </p>
            <div
                role="img"
                aria-label={SPLIT_CHART_NAME}
                className="flex h-3.5 gap-0.5 overflow-hidden rounded-full"
            >
                {parts.map((part) => (
                    <span
                        key={part.name}
                        data-part={part.name}
                        className="h-full"
                        style={{
                            flexGrow: part.share_pct,
                            flexBasis: 0,
                            background: part.color,
                        }}
                    />
                ))}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {parts.map((part) => (
                    <li key={part.name} className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-[3px]"
                            style={{ background: part.color }}
                        />
                        {part.text}
                    </li>
                ))}
            </ul>
        </section>
    )
}
