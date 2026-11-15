/**
 * The gear pane: its heading and the switch between what you wear and the
 * plan, every slot around the character (left, right, bottom), and the
 * middle with the figure and the character sheet. Before a file loads the
 * slots are disabled dashed outlines and the middle holds `middle` (the
 * new-visitor card).
 */
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { formatGain } from '../gains'
import { itemName } from '../item-name'
import type { Plan } from '../plans'
import type { ResultsFile, Slot } from '../results-file'
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS } from '../slot-labels'
import { emptySlot, slotShown, upgradeSummary } from '../slot-view'
import { CharacterSheet } from './character-sheet'
import { GainPill, SlotButton, type SlotSide } from './slot-button'

/** The placeholder figure (the approved mockup's own drawing). */
function Figure({ faded }: { faded: boolean }) {
    return (
        <figure className="flex flex-col items-center">
            <svg
                viewBox="0 0 150 190"
                aria-hidden="true"
                className={cn(
                    'h-60 w-48 text-foreground/80',
                    faded && 'opacity-30'
                )}
            >
                <ellipse
                    cx="75"
                    cy="178"
                    rx="46"
                    ry="6"
                    className="fill-muted stroke-border"
                />
                <g
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                >
                    <circle cx="75" cy="34" r="13" />
                    <path d="M52 56 Q75 46 98 56 L104 96 Q75 104 46 96 Z" />
                    <path d="M58 100 L56 170 L68 170 L75 112 L82 170 L94 170 L92 100" />
                    <path d="M52 60 L36 100" />
                    <path d="M98 60 L112 92" />
                </g>
                <g
                    fill="none"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="stroke-chart-1"
                >
                    <path d="M30 168 L118 22" />
                    <path
                        d="M108 20 Q130 26 126 48 Q114 40 102 36 Z"
                        className="fill-chart-1/25"
                    />
                </g>
            </svg>
            <figcaption className="text-xs text-muted-foreground">
                Character model goes here
            </figcaption>
        </figure>
    )
}

function BagUpgrades({ file }: { file: ResultsFile }) {
    if (file.bag_upgrades.length === 0) return null
    return (
        <ul className="flex flex-col gap-2 pt-1">
            {file.bag_upgrades.map((upgrade) => (
                <li
                    key={`${upgrade.slot}-${upgrade.item.item_id}`}
                    className="rounded-xl border border-dashed border-chart-2 bg-chart-2/5 px-3 py-2.5 text-sm"
                >
                    {`In your bags: ${itemName(upgrade.item, upgrade.slot, file.character.class)}, ${formatGain({ value: upgrade.gain_ep, unit: 'EP' })} over what you wear.`}
                </li>
            ))}
        </ul>
    )
}

/** The heading row: which gear is shown, and the button to switch. */
function GearHead({
    file,
    plan,
    planShown,
    switched,
    onShowPlan,
    onShowWorn,
}: {
    file: ResultsFile | null
    plan: Plan | null
    planShown: boolean
    switched: boolean
    onShowPlan: () => void
    onShowWorn: () => void
}) {
    if (!file)
        return (
            <div className="flex flex-col gap-1">
                <h2 className="text-xl font-semibold">Gear</h2>
                <p className="text-sm text-muted-foreground">
                    Every slot fills in from your results file.
                </p>
            </div>
        )
    const summary = upgradeSummary(file)
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold">
                    {planShown && plan
                        ? `Sim's plan: ${plan.label}`
                        : 'What you wear'}
                </h2>
                {plan &&
                    (planShown ? (
                        <Button
                            variant="outline"
                            className="ml-auto"
                            onClick={onShowWorn}
                        >
                            Show what I wear
                        </Button>
                    ) : (
                        <Button className="ml-auto" onClick={onShowPlan}>
                            Show the sim&apos;s plan
                        </Button>
                    ))}
            </div>
            {planShown ? (
                <p className="text-sm text-muted-foreground">
                    Labels show the gain over what you wear. Faded slots stay as
                    they are.
                </p>
            ) : (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    {summary.example ? (
                        <>
                            <GainPill gain={summary.example} />
                            {`is the best gain the sim found for that slot. ${bigUpgrades(summary.big)}`}
                        </>
                    ) : (
                        'The sim found no upgrade for any slot.'
                    )}
                </p>
            )}
            {planShown && switched && (
                <p className="border-l-2 border-chart-1 pl-2.5 text-sm">
                    Switched to the sim&apos;s plan for this mix.
                </p>
            )}
        </div>
    )
}

function bigUpgrades(count: number): string {
    const slots = count === 1 ? '1 slot has' : `${count} slots have`
    return `${slots} a big upgrade (15 EP or 3 DPS and up).`
}

/**
 * The gear pane.
 *
 * @param file - The loaded file, or null before one loads.
 * @param plan - The plan the sliders pick, or null.
 * @param planShown - True to show the plan's gear instead of what you wear.
 * @param switched - A slider move switched to the plan (says so).
 * @param middle - What sits in the middle before a file loads.
 */
export function GearPane({
    file,
    plan,
    planShown,
    switched,
    middle,
    onShowPlan,
    onShowWorn,
    onOpenSlot,
}: {
    file: ResultsFile | null
    plan: Plan | null
    planShown: boolean
    switched: boolean
    middle?: ReactNode
    onShowPlan: () => void
    onShowWorn: () => void
    onOpenSlot: (slot: Slot) => void
}) {
    const shownPlan = planShown ? plan : null
    const slot = (name: Slot, side: SlotSide) => (
        <SlotButton
            key={name}
            side={side}
            shown={file ? slotShown(file, name, shownPlan) : emptySlot(name)}
            onOpen={file ? onOpenSlot : undefined}
        />
    )
    return (
        <Card
            role="region"
            aria-label="Gear"
            className="gap-5 rounded-2xl px-5 py-5"
        >
            <GearHead
                file={file}
                plan={plan}
                planShown={planShown && plan !== null}
                switched={switched}
                onShowPlan={onShowPlan}
                onShowWorn={onShowWorn}
            />
            {/* Ours: the doll lays out by the pane's own width (a container
                query), not the window's: three columns around the figure
                from 49rem (two 14-20rem slot columns, 2.25rem gaps for the
                pills, a middle of at least 16.5rem for the sheet), two
                columns under the figure from 30rem, else one. */}
            <div className="@container/doll">
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 @min-[30rem]/doll:grid-cols-2 @min-[49rem]/doll:grid-cols-[minmax(14rem,20rem)_minmax(16.5rem,1fr)_minmax(14rem,20rem)] @min-[49rem]/doll:gap-x-9">
                    <div
                        data-slot="slots-left"
                        className="flex flex-col gap-3 @min-[30rem]/doll:col-start-1 @min-[30rem]/doll:row-start-2 @min-[49rem]/doll:row-start-1"
                    >
                        {LEFT_SLOTS.map((name) => slot(name, 'left'))}
                        {file && <BagUpgrades file={file} />}
                    </div>
                    <div
                        data-slot="doll-middle"
                        className="order-first flex min-w-0 flex-col items-center gap-3 @min-[30rem]/doll:col-span-2 @min-[30rem]/doll:row-start-1 @min-[49rem]/doll:col-span-1 @min-[49rem]/doll:col-start-2"
                    >
                        <Figure faded={file === null} />
                        {file ? <CharacterSheet file={file} /> : middle}
                    </div>
                    <div
                        data-slot="slots-right"
                        className="flex flex-col gap-3 @min-[30rem]/doll:col-start-2 @min-[30rem]/doll:row-start-2 @min-[49rem]/doll:col-start-3 @min-[49rem]/doll:row-start-1"
                    >
                        {RIGHT_SLOTS.map((name) => slot(name, 'right'))}
                    </div>
                    <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-4 @min-[30rem]/doll:col-span-2 @min-[49rem]/doll:col-span-3 [&>*]:w-full @min-[30rem]/doll:[&>*]:w-64">
                        {BOTTOM_SLOTS.map((name) => slot(name, 'bottom'))}
                    </div>
                </div>
            </div>
        </Card>
    )
}
