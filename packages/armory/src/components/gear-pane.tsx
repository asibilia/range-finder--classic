/**
 * The gear pane, as the approved mockup lays it out: its heading row
 * (the character, which gear is shown, the switch between what you wear and the
 * plan) and the line under it, every slot around the character (six on the
 * left with the callout card under them, eight on the right, the weapons along
 * the bottom), and the middle with the figure and the character sheet.
 * Before a file loads the slots are disabled dashed outlines and the
 * middle holds `middle` (the new-visitor card).
 */
import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'

import type { Item } from '../gains'
import { nextStep } from '../next-step'
import type { BagItemsOn } from '../planner-state'
import type { Plan } from '../plans'
import type { ResultsFile, Slot } from '../results-file'
import { bottomSlots, LEFT_SLOTS, RIGHT_SLOTS } from '../slot-labels'
import { emptySlot, gapTotal, type GapTotal, slotShown } from '../slot-view'
import { CharacterSheet } from './character-sheet'
import { InfoButton } from './info'
import type { Wishlist } from './item-picker'
import { NextStepCard } from './next-step-card'
import { Segmented } from './segmented'
import { SimBestIcon } from './sim-best-icon'
import { SlotButton, type SlotSide } from './slot-button'
import { TalentsPill } from './talents-pill'

/** The placeholder figure (the approved mockup's own drawing). */
function Figure({ faded }: { faded: boolean }) {
    return (
        <figure className="flex flex-col items-center">
            <svg
                viewBox="0 0 150 190"
                aria-hidden="true"
                className={cn(
                    'mt-1 h-67.5 w-52.5 text-foreground/80',
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
            <figcaption className="-mt-0.5 text-[0.71875rem] text-muted-foreground">
                Character model goes here
            </figcaption>
        </figure>
    )
}

/** A chestpiece outline (an original drawing), for the switch's `Current`. */
function ChestIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="inline-block size-[1em] shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
        >
            <path d="M8 3 L4 5 L2.5 11 L6 12 L6.5 21 L17.5 21 L18 12 L21.5 11 L20 5 L16 3 Q12 6.5 8 3 Z" />
            <path d="M9 13 L15 13" />
        </svg>
    )
}

/**
 * The heading row, as the owner's design draws it: the character's name
 * (or `Gear` before a file loads) and `Level 30 Enhancement Shaman` on one
 * line, the Current/BIS switch on its right; then the total line under it.
 * Which gear shows is said in words too (for screen readers in the Current
 * view, where the switch already shows it).
 */
function GearHead({
    file,
    plan,
    planShown,
    bagOn,
    headingRef,
    onShowPlan,
    onShowWorn,
}: {
    file: ResultsFile | null
    plan: Plan | null
    planShown: boolean
    bagOn: BagItemsOn
    headingRef?: RefObject<HTMLHeadingElement | null>
    onShowPlan: () => void
    onShowWorn: () => void
}) {
    const status = !file ? (
        'No character loaded yet.'
    ) : planShown && plan ? (
        <>
            <b className="font-bold text-foreground">The sim&apos;s plan</b>
            {` for your mix: ${plan.label.toLowerCase()}`}
        </>
    ) : (
        <b className="font-bold">What you wear</b>
    )
    const quiet = file !== null && !(planShown && plan)
    return (
        <div>
            <div className="flex min-h-10 flex-wrap items-center gap-x-3.5 gap-y-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3.5 gap-y-0.5">
                    <h2
                        id="gear-heading"
                        ref={headingRef}
                        tabIndex={-1}
                        className="text-xl outline-none"
                    >
                        {file ? file.character.name : 'Gear'}
                    </h2>
                    {file && (
                        <p className="text-base text-muted-foreground">
                            Level{' '}
                            <b className="font-bold text-foreground">
                                {file.character.level}
                            </b>{' '}
                            {`${file.character.spec} ${file.character.class}`}
                        </p>
                    )}
                </div>
                <span
                    aria-live="polite"
                    className={cn(
                        'text-sm text-muted-foreground',
                        quiet && 'sr-only'
                    )}
                >
                    {status}
                </span>
                {file && plan && (
                    <div className="ml-auto">
                        <Segmented
                            legend="View"
                            hideLegend
                            value={planShown ? 'bis' : 'current'}
                            onChange={(value) =>
                                value === 'bis' ? onShowPlan() : onShowWorn()
                            }
                            options={[
                                {
                                    value: 'current',
                                    label: 'Current',
                                    icon: <ChestIcon />,
                                },
                                {
                                    value: 'bis',
                                    label: 'BIS',
                                    icon: <SimBestIcon variant="best" />,
                                },
                            ]}
                        />
                    </div>
                )}
            </div>
            <p className="mt-1.5 mb-3.5 flex min-h-6 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                {!file ? (
                    'Every slot fills in from your export.'
                ) : planShown ? (
                    'Faded slots stay as they are.'
                ) : plan ? (
                    <TotalLine total={gapTotal(file, plan, bagOn)} />
                ) : (
                    'The sim found no upgrade for any slot.'
                )}
            </p>
        </div>
    )
}

/** No wishlist given: nothing is on it. */
const NO_WISHLIST: Wishlist = new Map()

/** No bag items given: none is on. */
const NO_BAG_ITEMS: BagItemsOn = []

/** `12 slots`, `1 slot`. */
function slotCount(count: number): string {
    return count === 1 ? '1 slot' : `${count} slots`
}

/**
 * The total line (spec section 4), as the owner's design draws it: the gap
 * in an orange badge, `[↓ 195.2 EP]`, then `in total below the sim's best
 * set, across 12 slots, plus 6.0 DPS on weapons.`, and an "i" saying it is
 * an estimate.
 */
function TotalLine({ total }: { total: GapTotal }) {
    const badge = (value: number, unit: 'EP' | 'DPS') => (
        <span
            data-total-badge
            className="inline-flex items-center rounded-sm bg-primary px-1.5 py-px font-mono text-sm font-bold text-primary-foreground"
        >
            {`↓ ${value.toFixed(1)} ${unit}`}
        </span>
    )
    const hasEp = total.epSlots > 0
    const hasDps = total.dpsSlots > 0
    const line = hasEp ? (
        <>
            {badge(total.ep, 'EP')}{' '}
            <span>
                {`in total below the sim's best set, across ${slotCount(total.epSlots)}`}
                {hasDps
                    ? `, plus ${total.dps.toFixed(1)} DPS on weapons.`
                    : '.'}
            </span>
        </>
    ) : hasDps ? (
        <>
            {badge(total.dps, 'DPS')}{' '}
            <span>below the sim&apos;s best set, on weapons.</span>
        </>
    ) : (
        <span>Every slot matches the sim&apos;s best set.</span>
    )
    return (
        <>
            {line}
            <InfoButton
                label="the total"
                text="An estimate: the slot gaps added up. The DPS readings hold the exact numbers."
            />
        </>
    )
}

/**
 * The gear pane.
 *
 * @param file - The loaded file, or null before one loads.
 * @param plan - The plan the sliders pick, or null.
 * @param planShown - True to show the plan's gear instead of what you wear.
 * @param bagOn - The bag upgrades put on with Equip or Equip all.
 * @param wishlist - The wishlist, for the callout card's `On wishlist`.
 * @param middle - What sits in the middle before a file loads.
 * @param headingRef - The heading (`gear-heading`), focused when a picked
 * file loads.
 * @param onOpenTalents - Opens the talents dialog (the pill on the figure).
 * @param onWearBag - Equip: puts a bag upgrade on.
 * @param onWearAllBags - Equip all: puts every bag upgrade on.
 * @param onUndoBag - Undo: takes them off again.
 * @param onToggleWishlist - Add to wishlist (or take off) from the card.
 */
export function GearPane({
    file,
    plan,
    planShown,
    bagOn = NO_BAG_ITEMS,
    wishlist = NO_WISHLIST,
    middle,
    headingRef,
    onShowPlan,
    onShowWorn,
    onOpenSlot,
    onOpenTalents = () => {},
    onWearBag = () => {},
    onWearAllBags = () => {},
    onUndoBag = () => {},
    onToggleWishlist = () => {},
}: {
    file: ResultsFile | null
    plan: Plan | null
    planShown: boolean
    bagOn?: BagItemsOn
    wishlist?: Wishlist
    middle?: ReactNode
    headingRef?: RefObject<HTMLHeadingElement | null>
    onShowPlan: () => void
    onShowWorn: () => void
    onOpenSlot: (slot: Slot, focusItemId?: number) => void
    onOpenTalents?: () => void
    onWearBag?: (itemId: number) => void
    onWearAllBags?: () => void
    onUndoBag?: () => void
    onToggleWishlist?: (item: Item, slot: Slot) => void
}) {
    // The callout card: in the Current view only.
    const step = file && !planShown ? nextStep(file, plan, bagOn) : null
    const slot = (name: Slot, side: SlotSide) => (
        <SlotButton
            key={name}
            side={side}
            shown={
                file
                    ? slotShown(file, name, plan, planShown, bagOn)
                    : emptySlot(name)
            }
            onOpen={file ? onOpenSlot : undefined}
        />
    )
    return (
        <section
            aria-labelledby="gear-heading"
            data-slot="gear-pane"
            className="rounded-[1.125rem] border bg-card px-5.5 pt-4 pb-4.5 text-card-foreground"
        >
            <GearHead
                file={file}
                plan={plan}
                planShown={planShown && plan !== null}
                bagOn={bagOn}
                headingRef={headingRef}
                onShowPlan={onShowPlan}
                onShowWorn={onShowWorn}
            />
            {/* Ours: the doll lays out by the pane's own width (a container
                query), not the window's: the mockup's three columns around
                the figure (two 16.75rem slot columns, 2.125rem gaps for the
                pills) from 49rem, two columns under the figure from 30rem,
                else one. */}
            <div className="@container/doll">
                <div className="grid grid-cols-1 gap-x-3.5 gap-y-2.5 @min-[30rem]/doll:grid-cols-2 @min-[49rem]/doll:grid-cols-[16.75rem_minmax(0,1fr)_16.75rem] @min-[49rem]/doll:gap-x-8.5 @min-[49rem]/doll:gap-y-0">
                    <div
                        data-slot="slots-left"
                        className="flex flex-col gap-2 @min-[30rem]/doll:col-start-1 @min-[30rem]/doll:row-start-2 @min-[49rem]/doll:row-start-1"
                    >
                        {LEFT_SLOTS.map((name) => slot(name, 'left'))}
                        {file && step && (
                            <NextStepCard
                                file={file}
                                step={step}
                                bagOn={bagOn}
                                wishlist={wishlist}
                                onWearBag={onWearBag}
                                onWearAllBags={onWearAllBags}
                                onUndoBag={onUndoBag}
                                onToggleWishlist={onToggleWishlist}
                                onOpenSlot={onOpenSlot}
                            />
                        )}
                    </div>
                    <div
                        data-slot="doll-middle"
                        className="order-first flex min-w-0 flex-col items-center @min-[30rem]/doll:col-span-2 @min-[30rem]/doll:row-start-1 @min-[49rem]/doll:col-span-1 @min-[49rem]/doll:col-start-2"
                    >
                        <Figure faded={file === null} />
                        {file && (
                            <TalentsPill
                                talents={file.talents}
                                onOpen={onOpenTalents}
                            />
                        )}
                        {file ? <CharacterSheet file={file} /> : middle}
                    </div>
                    <div
                        data-slot="slots-right"
                        className="flex flex-col gap-2 @min-[30rem]/doll:col-start-2 @min-[30rem]/doll:row-start-2 @min-[49rem]/doll:col-start-3 @min-[49rem]/doll:row-start-1"
                    >
                        {RIGHT_SLOTS.map((name) => slot(name, 'right'))}
                    </div>
                    <div
                        data-slot="slots-bottom"
                        className="mt-5 flex flex-wrap justify-center gap-x-7.5 gap-y-4 @min-[30rem]/doll:col-span-2 @min-[49rem]/doll:col-span-3 @min-[49rem]/doll:flex-nowrap [&>*]:w-full [&>*]:min-w-0 @min-[30rem]/doll:[&>*]:w-67 @min-[49rem]/doll:[&>*]:shrink"
                    >
                        {bottomSlots(file).map((name) => slot(name, 'bottom'))}
                    </div>
                </div>
            </div>
        </section>
    )
}
