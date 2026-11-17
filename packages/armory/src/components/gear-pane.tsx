/**
 * The gear pane, as the approved mockup lays it out: its heading row
 * (the character, which gear is shown, the switch between what you wear and the
 * plan) and the line under it, every slot around the character (six on the
 * left with the bag card under them, eight on the right, the weapons along
 * the bottom), and the middle with the figure and the character sheet.
 * Before a file loads the slots are disabled dashed outlines and the
 * middle holds `middle` (the new-visitor card).
 */
import type { ReactNode, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { formatGain } from '../gains'
import { exportDay } from '../format'
import { itemName } from '../item-name'
import type { Plan } from '../plans'
import type { ResultsFile, Slot } from '../results-file'
import { bottomSlots, LEFT_SLOTS, RIGHT_SLOTS } from '../slot-labels'
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

/** Plural slot words read `are in your bags`; the others `is`. */
const PLURAL_WORDS = /s$/

/**
 * The bag card under the left column, in the mockup's words: `Berylline
 * Pads are in your bags, +7.0 EP over the shoulders you wear. No dungeon
 * needed.` and `Wear them`; once worn, `You wear Berylline Pads now.
 * Serpent's Shoulders went to your bags.` and `Undo`. `Wear them` shows
 * only when the file has the bag item's results (`bag_upgrades[].results`).
 */
function BagCard({
    file,
    bagWorn,
    onWear,
    onUndo,
}: {
    file: ResultsFile
    bagWorn: number | null
    onWear: (itemId: number) => void
    onUndo: () => void
}) {
    const upgrade =
        file.bag_upgrades.find(
            (candidate) => candidate.item.item_id === bagWorn
        ) ?? file.bag_upgrades[0]
    if (!upgrade) return null
    const named = (item: Parameters<typeof itemName>[0]) =>
        itemName(item, upgrade.slot, file.character.class)
    const worn =
        file.slots.find((entry) => entry.slot === upgrade.slot)?.worn ?? null
    const word = slotWord(upgrade.slot)
    const name = named(upgrade.item)
    const on = bagWorn === upgrade.item.item_id
    return (
        <div
            aria-live="polite"
            className="mt-auto rounded-xl border border-dashed border-chart-2 bg-chart-2/5 px-3 py-2.5 text-[0.84375rem] text-muted-foreground"
        >
            {on ? (
                <p>
                    You wear <b className="text-foreground">{name}</b> now.
                    {worn ? ` ${named(worn)} went to your bags.` : ''}
                </p>
            ) : (
                <p>
                    <b className="text-foreground">{name}</b>
                    {` ${PLURAL_WORDS.test(word) ? 'are' : 'is'} in your bags, `}
                    <span className="font-bold whitespace-nowrap text-gain-text">
                        {formatGain({ value: upgrade.gain_ep, unit: 'EP' })}
                    </span>
                    {` over the ${word} you wear. No dungeon needed.`}
                </p>
            )}
            {(on || upgrade.results) && (
                <Button
                    variant="outline"
                    className="mt-2 h-auto rounded-full px-3 py-1.25 text-[0.84375rem] font-normal"
                    onClick={() =>
                        on ? onUndo() : onWear(upgrade.item.item_id)
                    }
                >
                    {on ? 'Undo' : 'Wear them'}
                </Button>
            )}
        </div>
    )
}

/** What one item in a slot is called in the bag card (`the shoulders`). */
function slotWord(slot: Slot): string {
    const words: Partial<Record<Slot, string>> = {
        head: 'helm',
        neck: 'necklace',
        shoulder: 'shoulders',
        back: 'cloak',
        chest: 'chest piece',
        wrist: 'bracers',
        hands: 'gloves',
        waist: 'belt',
        legs: 'leggings',
        feet: 'boots',
        main_hand: 'weapon',
        off_hand: 'off hand',
    }
    return words[slot] ?? 'item'
}

/**
 * The weapon line under the character, as the mockup writes it:
 * `Guardian's Dualblade with Windfury Weapon.` The weapon is the main
 * hand's worn item; `with ...` is its imbue (`slots[].imbue`), left out
 * when the file has none.
 *
 * @param file - The loaded results file.
 * @returns The line, or null with no main hand worn.
 */
export function weaponLine(file: ResultsFile): string | null {
    const mainHand = file.slots.find((entry) => entry.slot === 'main_hand')
    if (!mainHand?.worn) return null
    const weapon = itemName(mainHand.worn, 'main_hand', file.character.class)
    const imbue = mainHand.imbue ? ` with ${mainHand.imbue}` : ''
    return `${weapon}${imbue}.`
}

/**
 * The heading row (the character's name, or `Gear` before a file loads;
 * then `Level 30 Enhancement Shaman` and the weapon line) and the line
 * under it.
 */
function GearHead({
    file,
    plan,
    planShown,
    headingRef,
    onShowPlan,
    onShowWorn,
}: {
    file: ResultsFile | null
    plan: Plan | null
    planShown: boolean
    headingRef?: RefObject<HTMLHeadingElement | null>
    onShowPlan: () => void
    onShowWorn: () => void
}) {
    const weapon = file ? weaponLine(file) : null
    const status = !file ? (
        'No character loaded yet.'
    ) : planShown && plan ? (
        <>
            <b className="font-bold text-foreground">The sim&apos;s plan</b>
            {` for your mix: ${plan.label.toLowerCase()}`}
        </>
    ) : (
        <>
            <b className="font-bold text-foreground">What you wear</b>
            {`, from your export of ${exportDay(file.export_saved_at)}`}
        </>
    )
    const summary = file ? upgradeSummary(file) : null
    return (
        <div>
            <div className="flex min-h-10 flex-wrap items-center gap-x-3.5 gap-y-1">
                <div className="min-w-0">
                    <h2
                        id="gear-heading"
                        ref={headingRef}
                        tabIndex={-1}
                        className="text-[1.375rem] leading-tight outline-none"
                    >
                        {file ? file.character.name : 'Gear'}
                    </h2>
                    {file && (
                        <>
                            <p className="mt-0.5 text-sm text-muted-foreground">
                                Level{' '}
                                <b className="font-bold text-foreground">
                                    {file.character.level}
                                </b>{' '}
                                {`${file.character.spec} ${file.character.class}`}
                            </p>
                            {weapon && (
                                <p className="text-sm text-muted-foreground">
                                    {weapon}
                                </p>
                            )}
                        </>
                    )}
                </div>
                <span
                    aria-live="polite"
                    className="text-sm text-muted-foreground"
                >
                    {status}
                </span>
                {file &&
                    plan &&
                    (planShown ? (
                        <Button
                            variant="outline"
                            className="ml-auto h-auto rounded-full px-4 py-2"
                            onClick={onShowWorn}
                        >
                            Show what I wear
                        </Button>
                    ) : (
                        <Button
                            className="ml-auto h-auto rounded-full bg-gain px-4 py-2 font-bold text-gain-foreground hover:bg-gain/85"
                            onClick={onShowPlan}
                        >
                            Show the sim&apos;s plan
                        </Button>
                    ))}
            </div>
            <p className="mt-1 mb-3.5 flex min-h-4.75 flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground">
                {!file ? (
                    'Every slot fills in from your export.'
                ) : planShown ? (
                    'Labels show the gain over what you wear. Faded slots stay as they are.'
                ) : summary?.example ? (
                    <>
                        <GainPill gain={summary.example} />
                        {`is the best gain the sim found for that slot. ${bigUpgrades(summary.big)}`}
                    </>
                ) : (
                    'The sim found no upgrade for any slot.'
                )}
            </p>
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
 * @param bagWorn - The bag upgrade put on with Wear them, or null.
 * @param middle - What sits in the middle before a file loads.
 * @param headingRef - The heading (`gear-heading`), focused when a picked
 * file loads.
 * @param onWearBag - Wear them: puts a bag upgrade on.
 * @param onUndoBag - Undo: takes it off again.
 */
export function GearPane({
    file,
    plan,
    planShown,
    bagWorn = null,
    middle,
    headingRef,
    onShowPlan,
    onShowWorn,
    onOpenSlot,
    onWearBag = () => {},
    onUndoBag = () => {},
}: {
    file: ResultsFile | null
    plan: Plan | null
    planShown: boolean
    bagWorn?: number | null
    middle?: ReactNode
    headingRef?: RefObject<HTMLHeadingElement | null>
    onShowPlan: () => void
    onShowWorn: () => void
    onOpenSlot: (slot: Slot) => void
    onWearBag?: (itemId: number) => void
    onUndoBag?: () => void
}) {
    const shownPlan = planShown ? plan : null
    const slot = (name: Slot, side: SlotSide) => (
        <SlotButton
            key={name}
            side={side}
            shown={
                file
                    ? slotShown(file, name, shownPlan, bagWorn)
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
                        {file && (
                            <BagCard
                                file={file}
                                bagWorn={bagWorn}
                                onWear={onWearBag}
                                onUndo={onUndoBag}
                            />
                        )}
                    </div>
                    <div
                        data-slot="doll-middle"
                        className="order-first flex min-w-0 flex-col items-center @min-[30rem]/doll:col-span-2 @min-[30rem]/doll:row-start-1 @min-[49rem]/doll:col-span-1 @min-[49rem]/doll:col-start-2"
                    >
                        <Figure faded={file === null} />
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
