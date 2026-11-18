/**
 * The talents pill (spec #109 section 7): the owner's light pill at the
 * character sheet's top right, a target-and-arrow icon and `<points> pts`,
 * opening the talents dialog. When the file's best
 * build is 3.0 DPS or more up (as shown, one decimal), the pill gets an
 * orange dot and `↓ N DPS` sits before it.
 */
import { Button } from '@/components/ui/button'

import { shownValue } from '../gains'
import type { ResultsFile } from '../results-file'

/** A better build shows from this DPS gain (the shown, one-decimal value). */
const BETTER_FROM = 3

/** The target-and-arrow icon: an original drawing. */
function TargetIcon() {
    return (
        <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="7" cy="9" r="5.5" />
            <circle cx="7" cy="9" r="2.5" />
            <path d="M7 9 L14 2" />
            <path d="M11.5 2 L14 2 L14 4.5" />
        </svg>
    )
}

/**
 * The best build's DPS gain as shown, when it is big enough for the dot;
 * else null.
 *
 * @param talents - The file's talents.
 * @returns The shown gain, or null.
 */
export function betterBuildGain(
    talents: ResultsFile['talents']
): number | null {
    if (!talents.best) return null
    const shown = shownValue({ value: talents.best.dps_gain, unit: 'DPS' })
    return shown >= BETTER_FROM ? shown : null
}

/**
 * The pill.
 *
 * @param talents - The file's talents.
 * @param onOpen - Opens the talents dialog.
 */
export function TalentsPill({
    talents,
    onOpen,
}: {
    talents: ResultsFile['talents']
    onOpen: () => void
}) {
    const better = betterBuildGain(talents)
    const gain = better === null ? null : better.toFixed(1)
    const name =
        gain === null
            ? `Talents, ${talents.points} points`
            : `Talents, ${talents.points} points, a better build is ${gain} DPS up`
    return (
        <div
            data-slot="talents-pill"
            className="mb-2.5 flex items-center justify-end gap-2"
        >
            {gain !== null && (
                <span
                    aria-hidden="true"
                    className="font-mono text-sm text-primary"
                >
                    {`↓ ${gain} DPS`}
                </span>
            )}
            <Button
                variant="pill"
                aria-label={name}
                data-better={gain === null ? undefined : 'true'}
                onClick={onOpen}
                className="relative h-8 gap-1.5 px-3.5 text-sm"
            >
                <TargetIcon />
                <span className="font-mono">{`${talents.points} pts`}</span>
                {gain !== null && (
                    <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary"
                    />
                )}
            </Button>
        </div>
    )
}
