/**
 * The card on the right of the gear (below it under 90rem), holding what
 * the approved mockup keeps there: what the sim says, what to gear for (the
 * role sliders) and the Talents button. Before a file loads it shows the
 * same card dimmed, dashed and inert, with `These unlock once a character
 * is loaded.`
 */
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import type { Plan } from '../plans'
import type { ResultsFile } from '../results-file'
import { Readings } from './readings'

/**
 * The Talents button's words, as the mockup has them: `Talents: best
 * simmed, 21 points`, or `Talents: your build, 21 points` when the file has
 * no best build.
 *
 * @param talents - The file's talents.
 * @returns The words.
 */
export function talentsButtonText(talents: ResultsFile['talents']): string {
    const build = talents.best ? 'best simmed' : 'your build'
    return `Talents: ${build}, ${talents.points} points`
}

/**
 * The card with a file loaded.
 *
 * @param file - The loaded results file.
 * @param fightId - The fight the band is on.
 * @param plan - The plan the sliders pick, or null (no plans).
 * @param planShown - The gear shows the plan (its readings are drawn large).
 * @param sliders - The role sliders (when the file has plans).
 * @param onOpenTalents - Opens the talents dialog.
 */
export function SimPanel({
    file,
    fightId,
    plan,
    planShown,
    sliders,
    onOpenTalents,
}: {
    file: ResultsFile
    fightId: string
    plan: Plan | null
    planShown: boolean
    sliders?: ReactNode
    onOpenTalents: () => void
}) {
    const fight =
        file.fights.find((entry) => entry.fight_id === fightId) ??
        file.fights[0]
    return (
        <aside aria-label="The sim's numbers">
            <Card className="gap-0 rounded-2xl py-5">
                <CardContent className="flex flex-col gap-5 px-5">
                    {fight && (
                        <Readings
                            file={file}
                            fight={fight}
                            plan={plan}
                            planShown={planShown}
                        />
                    )}
                    {sliders && (
                        <>
                            <Separator />
                            {sliders}
                        </>
                    )}
                    <Separator />
                    <div>
                        <Button variant="outline" onClick={onOpenTalents}>
                            {talentsButtonText(file.talents)}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </aside>
    )
}

const PLACEHOLDER_READINGS = [
    'Solo DPS',
    'Dungeon DPS',
    'Out of mana at',
    'Health',
    'Armor',
    'Time to die',
]

const PLACEHOLDER_ROLES = ['Damage', 'Survival', 'Healing', 'Utility']

/**
 * The card before a file loads: dimmed, dashed and inert, showing where
 * the readings, the sliders and the Talents button will be. Only its first
 * line is read out; the rest is hidden from screen readers and can't be
 * focused.
 */
export function LockedSimPanel() {
    return (
        <section aria-label="What unlocks with a character">
            <Card className="gap-4 rounded-2xl border border-dashed bg-transparent py-5 shadow-none ring-0">
                <CardContent className="flex flex-col gap-5 px-5">
                    <p className="border-l-2 border-chart-2 py-0.5 pl-2.5 text-sm">
                        These unlock once a character is loaded.
                    </p>
                    <div
                        aria-hidden="true"
                        inert
                        data-slot="locked-body"
                        className="flex flex-col gap-5 opacity-40 saturate-50 select-none"
                    >
                        <div className="flex flex-col gap-2">
                            <p className="text-lg font-semibold">
                                What the sim says
                            </p>
                            <div className="grid grid-cols-2 border-t min-[30rem]:grid-cols-3">
                                {PLACEHOLDER_READINGS.map((label) => (
                                    <div
                                        key={label}
                                        className="flex flex-col gap-0.5 border-b py-2 pr-2"
                                    >
                                        <span className="min-h-8 text-xs text-muted-foreground">
                                            {label}
                                        </span>
                                        <span className="text-2xl font-semibold">
                                            –
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Separator />
                        <div className="flex flex-col gap-4">
                            <p className="text-lg font-semibold">
                                What to gear for
                            </p>
                            {PLACEHOLDER_ROLES.map((role) => (
                                <div key={role} className="flex flex-col gap-2">
                                    <span className="text-sm">{role}</span>
                                    <span className="relative h-1 rounded-full bg-muted">
                                        <span className="absolute top-1/2 left-0 size-3 -translate-y-1/2 rounded-full border border-ring bg-background" />
                                    </span>
                                </div>
                            ))}
                        </div>
                        <Separator />
                        <div>
                            <span className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm font-medium">
                                Talents
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
