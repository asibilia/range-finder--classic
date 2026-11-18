/**
 * The gear pane, as the approved mockup lays it out: its heading row
 * (the character, which gear is shown, the switch between what you wear and the
 * plan) and the line under it, every slot around the character (six on the
 * left with the callout card under them, eight on the right, the weapons along
 * the bottom), and the middle with the talents pill and the character sheet
 * at its foot. The character art, when the manifest has a picture for the
 * character's race and class, fills the card behind the tiles; else the
 * card stays plain.
 * Before a file loads the slots are disabled dashed outlines and the
 * middle holds `middle` (the new-visitor card).
 */
import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'

import { characterArt } from '../character-art'
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
            <p className="mt-3.5 mb-3.5 flex min-h-6 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
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
 * @param onOpenTalents - Opens the talents dialog (the pill on the sheet).
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
    const art = file
        ? characterArt(
              file.character.race,
              file.character.class,
              file.character.gender
          )
        : null
    return (
        <section
            aria-labelledby="gear-heading"
            data-slot="gear-pane"
            className="relative isolate overflow-hidden rounded-[1.125rem] border bg-card px-5.5 pt-5 pb-4.5 text-card-foreground"
        >
            {/* The owner's design: the art fills the card, centred and
                cropped to it, behind the tiles' glass. Decorative; its
                size from the manifest, so nothing shifts as it loads. */}
            {art && (
                <img
                    data-slot="character-art"
                    src={art.url}
                    width={art.width}
                    height={art.height}
                    alt=""
                    decoding="async"
                    className="pointer-events-none absolute inset-0 -z-10 size-full object-cover"
                />
            )}
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
                query), not the window's: the owner's design's three columns
                around the middle (two 16.75rem slot columns, 0.875rem gaps)
                from 49rem, two columns under the middle from 30rem, else
                one. */}
            <div className="@container/doll">
                <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 @min-[30rem]/doll:grid-cols-2 @min-[49rem]/doll:grid-cols-[16.75rem_minmax(0,1fr)_16.75rem] @min-[49rem]/doll:gap-y-0">
                    <div
                        data-slot="slots-left"
                        className="flex flex-col gap-3 @min-[30rem]/doll:col-start-1 @min-[30rem]/doll:row-start-2 @min-[49rem]/doll:row-start-1"
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
                        className={cn(
                            'order-first flex min-w-0 flex-col items-center @min-[30rem]/doll:col-span-2 @min-[30rem]/doll:row-start-1 @min-[49rem]/doll:col-span-1 @min-[49rem]/doll:col-start-2',
                            file ? 'justify-end' : 'justify-center'
                        )}
                    >
                        {file ? (
                            <div className="flex w-full max-w-76 flex-col">
                                <TalentsPill
                                    talents={file.talents}
                                    onOpen={onOpenTalents}
                                />
                                <CharacterSheet file={file} />
                            </div>
                        ) : (
                            middle
                        )}
                    </div>
                    <div
                        data-slot="slots-right"
                        className="flex flex-col gap-3 @min-[30rem]/doll:col-start-2 @min-[30rem]/doll:row-start-2 @min-[49rem]/doll:col-start-3 @min-[49rem]/doll:row-start-1"
                    >
                        {RIGHT_SLOTS.map((name) => slot(name, 'right'))}
                    </div>
                    <div
                        data-slot="slots-bottom"
                        className="mt-6 flex flex-wrap justify-center gap-x-7.5 gap-y-4 @min-[30rem]/doll:col-span-2 @min-[49rem]/doll:col-span-3 @min-[49rem]/doll:flex-nowrap [&>*]:w-full [&>*]:min-w-0 @min-[30rem]/doll:[&>*]:w-67 @min-[49rem]/doll:[&>*]:shrink"
                    >
                        {bottomSlots(file).map((name) => slot(name, 'bottom'))}
                    </div>
                </div>
            </div>
        </section>
    )
}
