/**
 * The browser sim at work: the progress bar (`Sim progress`, `N of M sims`)
 * and `Cancel`, used while an export sims and while Refine runs; the
 * simming card that holds them in place of the new-visitor card; and the
 * lines the page says about the sim (the credit, the phone note).
 */
import { Button } from '@/components/ui/button'

/** The credit line (spec section 2): plain text, no link. */
export const SIM_CREDIT =
    'Sim: WoWSims Forever (MIT), changed to sim levels below 60. Item and spell data: World of Warcraft game data, as WoWSims packages it.'

/** Said on a phone, in the new-visitor and simming states. */
export const PHONE_NOTE =
    'This works best on a computer. On a phone the sim is slow and may run out of memory.'

/** A coarse pointer on a narrow screen: a phone. */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 768px)'

/** How far a run is: `done` of `planned` sims. */
export type SimCount = { done: number; planned: number }

/**
 * The progress bar and Cancel.
 *
 * @param count - Sims done and planned.
 * @param onCancel - Stops the run.
 */
export function SimProgress({
    count,
    onCancel,
}: {
    count: SimCount
    onCancel: () => void
}) {
    const { done, planned } = count
    const text = `${done} of ${planned} sims`
    const share = planned > 0 ? Math.min(1, done / planned) : 0
    return (
        <div className="flex flex-col gap-1.5">
            <div
                role="progressbar"
                aria-label="Sim progress"
                aria-valuemin={0}
                aria-valuemax={planned}
                aria-valuenow={done}
                aria-valuetext={text}
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
                <div
                    className="h-full rounded-full bg-chart-2"
                    style={{ width: `${share * 100}%` }}
                />
            </div>
            <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                <span className="tabular-nums">{text}</span>
                <Button variant="outline" size="sm" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </div>
    )
}

/**
 * The card shown while an export sims, where the new-visitor card was.
 *
 * @param count - Sims done and planned.
 * @param phone - Whether to say it works best on a computer.
 * @param onCancel - Stops the sim and goes back to the new-visitor card.
 */
export function Simming({
    count,
    phone,
    onCancel,
}: {
    count: SimCount
    phone: boolean
    onCancel: () => void
}) {
    return (
        <section
            aria-labelledby="simming-heading"
            className="mt-3 w-full rounded-[0.875rem] border border-ring/60 bg-card px-4 py-3.5 shadow-lg"
        >
            <h2 id="simming-heading" className="mb-2 text-xl leading-tight">
                Simming your character
            </h2>
            <p role="status" className="mb-2 text-sm">
                Simming your character on this computer.
            </p>
            {phone && (
                <p className="mb-2 text-[0.8125rem] text-muted-foreground">
                    {PHONE_NOTE}
                </p>
            )}
            <SimProgress count={count} onCancel={onCancel} />
        </section>
    )
}
