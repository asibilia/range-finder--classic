/**
 * The armory planner's page. It opens with nothing loaded, reads a results
 * file picked, dropped or bundled as the sample, and shows the character:
 * the gear pane with the card on its right (what the sim says, what to gear
 * for, talents), and the band under both (the fight chart, the damage split
 * and stat weights, the fight settings), as the approved mockup lays them
 * out. What it shows for a loaded file
 * is `PlannerState`, changed only by the pure actions in `planner-state.ts`.
 */
import { useEffect, useState } from 'react'

import { BringIn, type ReadError } from '@/components/bring-in'
import { Checks } from '@/components/checks'
import { FightBand } from '@/components/fight-band'
import { GearPane } from '@/components/gear-pane'
import {
    ItemPicker,
    type Wishlist,
    WishlistDialog,
} from '@/components/item-picker'
import { PawnDialog } from '@/components/pawn-dialog'
import { RoleSliders } from '@/components/role-sliders'
import { LockedSimPanel, SimPanel } from '@/components/sim-panel'
import { TalentsDialog } from '@/components/talents-dialog'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'

import type { Item } from './gains'
import { itemName } from './item-name'
import {
    initialPlannerState,
    pickedPlan,
    type PlannerAction,
    plannerReducer,
    type PlannerState,
    wornResult,
} from './planner-state'
import { readResultsFile, type ResultsFile, type Slot } from './results-file'
import { slotLabel } from './slot-labels'
import { slotEntry } from './slot-view'
import sample from './sample-truncha.json'

type Loaded = { file: ResultsFile | null; error: ReadError | null }

function load(input: unknown): Loaded {
    const outcome = readResultsFile(input)
    if (outcome.ok) return { file: outcome.file, error: null }
    if (outcome.reason === 'version')
        return {
            file: null,
            error: { kind: 'version', version: outcome.version },
        }
    return {
        file: null,
        error: { kind: 'invalid', problems: outcome.problems },
    }
}

/** Reads a picked or dropped file's text as a results file. */
async function readFile(file: File): Promise<Loaded> {
    let text: string
    try {
        text = await file.text()
    } catch {
        // A folder, or a file the browser can't read.
        return { file: null, error: { kind: 'unreadable' } }
    }
    let input: unknown
    try {
        input = JSON.parse(text)
    } catch {
        return { file: null, error: { kind: 'not-json' } }
    }
    return load(input)
}

/**
 * The header line under the name, as the mockup writes it: `Orc
 * Enhancement Shaman, level 30. Guardian's Dualblade with Windfury
 * Weapon.` The weapon is the main hand's worn item; `with ...` is its imbue
 * (`slots[].imbue`), left out when the file has none.
 *
 * @param file - The loaded results file.
 * @returns The line.
 */
export function headerLine(file: ResultsFile): string {
    const { character } = file
    const who = `${character.race} ${character.spec} ${character.class}, level ${character.level}.`
    const mainHand = file.slots.find((entry) => entry.slot === 'main_hand')
    if (!mainHand?.worn) return who
    const weapon = itemName(mainHand.worn, 'main_hand', character.class)
    const imbue = mainHand.imbue ? ` with ${mainHand.imbue}` : ''
    return `${who} ${weapon}${imbue}.`
}

const PILL = 'h-auto rounded-full px-4 py-2 text-[0.9375rem] font-normal'

function Header({
    file,
    wishlistCount,
    onOpenWishlist,
    onOpenPawn,
}: {
    file: ResultsFile | null
    wishlistCount: number
    onOpenWishlist: () => void
    onOpenPawn: () => void
}) {
    return (
        <header className="flex flex-wrap items-end gap-6">
            <div>
                <h1 className="text-[2.625rem] leading-none tracking-[0.01em]">
                    {file ? file.character.name : 'Armory planner'}
                </h1>
                <p className="mt-1.5 text-muted-foreground">
                    {file
                        ? headerLine(file)
                        : 'See your gear, what the sim would change, and how a fight plays out.'}
                </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
                {file && (
                    <Button
                        variant="ghost"
                        className="h-auto px-1 py-1 text-[0.9375rem] font-normal text-muted-foreground"
                        aria-haspopup="dialog"
                        onClick={onOpenWishlist}
                    >
                        Wishlist{' '}
                        <b
                            aria-live="polite"
                            className="min-w-[1ch] font-bold text-foreground"
                        >
                            {wishlistCount}
                        </b>
                    </Button>
                )}
                <Button
                    variant="outline"
                    className={PILL}
                    aria-haspopup="dialog"
                    disabled={!file}
                    onClick={onOpenPawn}
                >
                    Export Pawn string
                </Button>
            </div>
        </header>
    )
}

/**
 * The footer, where the mockup has its own: the sample note (a sample file
 * has made-up numbers), how sure the sim is (its checks), and the line on
 * the art.
 */
function Footer({ file }: { file: ResultsFile | null }) {
    return (
        <footer className="mt-7 flex flex-col gap-2 text-[0.78125rem] text-muted-foreground">
            <p>
                {file?.sample && (
                    <>
                        <span>
                            Sample file: some numbers here are made up to try
                            the page.
                        </span>{' '}
                    </>
                )}
                {file?.provisional && (
                    <>
                        <span>Sim numbers are provisional.</span>{' '}
                    </>
                )}
                <span>
                    Not affiliated with the game&apos;s publisher; all art here
                    is original placeholder.
                </span>
            </p>
            {file && (
                <Checks checks={file.checks} leftOut={file.left_out_items} />
            )}
        </footer>
    )
}

type OpenDialog =
    | { kind: 'picker'; slot: Slot }
    | { kind: 'wishlist' }
    | { kind: 'talents' }
    | { kind: 'pawn' }
    | null

/**
 * The armory planner's page. A render error in it is caught by the home
 * route's error boundary (`routes/home.tsx`).
 */
export function App() {
    const [loaded, setLoaded] = useState<Loaded>({ file: null, error: null })
    const [planner, setPlanner] = useState<PlannerState | null>(null)
    const [wishlist, setWishlist] = useState<Wishlist>(() => new Map())
    const [dialog, setDialog] = useState<OpenDialog>(null)

    const open = (next: Loaded) => {
        setLoaded(next)
        setPlanner(next.file ? initialPlannerState(next.file) : null)
    }

    const onFile = (picked: File) => {
        void readFile(picked).then(open)
    }

    // A file dropped anywhere on the page must not make the browser open it.
    // With nothing loaded yet, the drop loads it, as the drop box does.
    const waiting = loaded.file === null
    useEffect(() => {
        const onDragOver = (event: DragEvent) => event.preventDefault()
        const onDrop = (event: DragEvent) => {
            event.preventDefault()
            const dropped = event.dataTransfer?.files?.[0]
            if (waiting && dropped) void readFile(dropped).then(open)
        }
        window.addEventListener('dragover', onDragOver)
        window.addEventListener('drop', onDrop)
        return () => {
            window.removeEventListener('dragover', onDragOver)
            window.removeEventListener('drop', onDrop)
        }
    }, [waiting])

    const { file, error } = loaded
    const dispatch = (action: PlannerAction) => {
        if (file)
            setPlanner((current) =>
                current ? plannerReducer(file, current, action) : current
            )
    }

    const toggleWishlist = (item: Item, slot: Slot) => {
        setWishlist((current) => {
            const next = new Map(current)
            if (next.has(item.item_id)) next.delete(item.item_id)
            else next.set(item.item_id, { item, slot })
            return next
        })
    }

    const removeFromWishlist = (itemId: number) => {
        setWishlist((current) => {
            const next = new Map(current)
            next.delete(itemId)
            return next
        })
    }

    const closeDialog = () => setDialog(null)
    const plan = file && planner ? pickedPlan(file, planner) : null
    const planShown = planner?.view === 'plan'
    const bagWorn = planner?.bagWorn ?? null
    const wornOf = (fightId: string) =>
        file && planner ? wornResult(file, planner, fightId) : null

    return (
        <TooltipProvider>
            <main className="mx-auto flex max-w-360 flex-col px-4 pt-5.5 pb-9 sm:px-6 lg:px-10">
                <Header
                    file={file}
                    wishlistCount={wishlist.size}
                    onOpenWishlist={() => setDialog({ kind: 'wishlist' })}
                    onOpenPawn={() => setDialog({ kind: 'pawn' })}
                />
                <div
                    data-slot="planner-body"
                    className="mt-4.5 grid items-start gap-8 min-[90rem]:grid-cols-[minmax(0,1fr)_27.75rem]"
                >
                    <GearPane
                        file={file}
                        plan={plan}
                        planShown={planShown}
                        bagWorn={bagWorn}
                        onWearBag={(itemId) =>
                            dispatch({ type: 'wear-bag-item', item_id: itemId })
                        }
                        onUndoBag={() => dispatch({ type: 'undo-bag-item' })}
                        middle={
                            <BringIn
                                error={error}
                                onFile={onFile}
                                onSample={() => open(load(sample))}
                            />
                        }
                        onShowPlan={() => dispatch({ type: 'show-plan' })}
                        onShowWorn={() => dispatch({ type: 'show-worn' })}
                        onOpenSlot={(slot) =>
                            setDialog({ kind: 'picker', slot })
                        }
                    />
                    {file && planner ? (
                        <SimPanel
                            file={file}
                            fightId={planner.fightId}
                            plan={plan}
                            planShown={planShown}
                            wornOf={wornOf}
                            onOpenTalents={() => setDialog({ kind: 'talents' })}
                            sliders={
                                planner.mix && (
                                    <RoleSliders
                                        plans={file.plans}
                                        mix={planner.mix}
                                        plan={plan}
                                        inWornView={!planShown}
                                        switched={planner.switched}
                                        onShowWorn={() =>
                                            dispatch({ type: 'show-worn' })
                                        }
                                        onChange={(role, value) =>
                                            dispatch({
                                                type: 'set-sliders',
                                                mix: { [role]: value },
                                            })
                                        }
                                    />
                                )
                            }
                        />
                    ) : (
                        <LockedSimPanel />
                    )}
                </div>
                {file && planner && (
                    <FightBand
                        file={file}
                        plan={plan}
                        fightId={planner.fightId}
                        wornOf={wornOf}
                        onPickFight={(fightId) =>
                            dispatch({ type: 'pick-fight', fight_id: fightId })
                        }
                    />
                )}
                <Footer file={file} />
                {file && dialog?.kind === 'picker' && (
                    <ItemPicker
                        entry={slotEntry(file, dialog.slot, bagWorn)}
                        slot={dialog.slot}
                        label={slotLabel(dialog.slot, file)}
                        provisional={file.provisional}
                        level={file.character.level}
                        characterClass={file.character.class}
                        bagItemIds={file.bag_upgrades
                            .filter((upgrade) => upgrade.slot === dialog.slot)
                            .map((upgrade) => upgrade.item.item_id)}
                        wishlist={wishlist}
                        onToggle={toggleWishlist}
                        onClose={closeDialog}
                    />
                )}
                {file && dialog?.kind === 'wishlist' && (
                    <WishlistDialog
                        wishlist={wishlist}
                        characterClass={file.character.class}
                        onRemove={removeFromWishlist}
                        onClose={closeDialog}
                    />
                )}
                {file && dialog?.kind === 'talents' && (
                    <TalentsDialog
                        talents={file.talents}
                        fights={file.fights}
                        sample={file.sample}
                        provisional={file.provisional}
                        onClose={closeDialog}
                    />
                )}
                {file && dialog?.kind === 'pawn' && (
                    <PawnDialog pawn={file.pawn} onClose={closeDialog} />
                )}
            </main>
        </TooltipProvider>
    )
}
