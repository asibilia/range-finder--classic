/**
 * Where the damage comes from (spec section 9), as the mockup draws it:
 * one 100% stacked bar of what you wear's split, and a two-column legend
 * of each part's name and share (`Melee 33%`) in the bar's order, with no
 * colour squares (the owner's design). Coloured by spell
 * school when the file has one for every part (and says so), else by
 * order.
 */
import { splitHasSchools, splitParts } from '../chart-data'
import type { ResultsFile } from '../results-file'

type Result = ResultsFile['results'][number]

/** The split bar's accessible name. */
export const SPLIT_CHART_NAME = 'Damage split'

/**
 * The damage split.
 *
 * @param worn - What you wear's result on the fight it is for.
 * @param fightLabel - That fight in words, for the note under the heading.
 */
export function DamageSplit({
    worn,
    fightLabel,
}: {
    worn: Result
    fightLabel?: string
}) {
    const parts = splitParts(worn)
    return (
        <section>
            <h2 className="mb-1.5 text-xl leading-tight">
                Where the damage comes from
            </h2>
            <p className="text-[0.78125rem] text-muted-foreground">
                {fightLabel
                    ? `${fightLabel}, what you wear.`
                    : 'What you wear, in this fight.'}
                {splitHasSchools(worn) && ' Colour is the spell school.'}
            </p>
            <div
                role="img"
                aria-label={SPLIT_CHART_NAME}
                className="mt-2 mb-2.5 flex h-3.5 gap-0.5 overflow-hidden rounded-full"
            >
                {/* Keys by place: the contract doesn't forbid two parts
                    with one name. */}
                {parts.map((part, index) => (
                    <span
                        key={`${index}-${part.name}`}
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
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.75 text-[0.8125rem]">
                {parts.map((part, index) => (
                    // The owner's design: no colour squares; the legend
                    // reads in the bar's order.
                    <li
                        key={`${index}-${part.name}`}
                        className="flex items-center gap-1.75"
                    >
                        {part.name}
                        <span className="ml-auto text-muted-foreground tabular-nums">
                            <span className="sr-only"> </span>
                            {`${Math.round(part.share_pct)}%`}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}
