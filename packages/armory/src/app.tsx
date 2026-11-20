/**
 * The armory planner's page. It opens with nothing loaded, reads a results
 * file picked, dropped or bundled as the sample, and shows the character:
 * the gear pane with the card on its right (what the sim says, what to gear
 * for, talents), and the band under both (the fight chart, the damage split
 * and stat weights, the fight settings), as the approved mockup lays them
 * out. What it shows for a loaded file
 * is `PlannerState`, changed only by the pure actions in `planner-state.ts`.
 * The last file picked or dropped is kept in this browser and comes back on
 * reload (`remembered-file.ts`); the sample is never kept.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { createSimPool, SimCancelled, type SimPool } from '@goturbo/sim'

import { BringIn, type ReadError, stopLines } from '@/components/bring-in'
import { Checks } from '@/components/checks'
import { FightBand } from '@/components/fight-band'
import { FightSettingsForm } from '@/components/fight-settings-form'
import { GearPane } from '@/components/gear-pane'
import { InfoIcon } from '@/components/info'
import {
    ItemPicker,
    type Wishlist,
    WishlistDialog,
} from '@/components/item-picker'
import { useLocalLatest } from '@/components/latest-file'
import { PawnDialog } from '@/components/pawn-dialog'
import { RoleSliders } from '@/components/role-sliders'
import { LockedSimPanel, SimPanel } from '@/components/sim-panel'
import {
    PHONE_QUERY,
    SIM_CREDIT,
    type SimCount,
    SimProgress,
    Simming,
} from '@/components/sim-progress'
import { TalentsDialog } from '@/components/talents-dialog'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'

import {
    type Character,
    estimateMinutes,
    refine,
    simExport,
    type SimExportOutcome,
    type SimStop,
    weightsIterations,
} from './browser-sim'
import { characterArt } from './character-art'
import { type FightSettings, fightFor, fightOverride } from './fight-settings'
import type { Item } from './gains'
import {
    initialPlannerState,
    pickedPlan,
    pickFight,
    type PlannerAction,
    plannerReducer,
    type PlannerState,
    showView,
    wornResult,
} from './planner-state'
import { readResults, readResultsText } from './read-results'
import { forgetFile, recallFile, rememberFile } from './remembered-file'
import type { ResultsFile, Slot } from './results-file'
import { slotLabel } from './slot-labels'
import { slotEntry } from './slot-view'
import sample from './sample-truncha.json'

/** The file shown, or why the last one didn't read (both null: nothing). */
type Loaded = { file: ResultsFile | null; error: ReadError | null }

/**
 * Reads a picked or dropped file's text as a results file. A file that
 * reads OK is kept in this browser in place of the last one; `remembered`
 * says whether it was (storage can be unavailable or full).
 */
async function readFile(
    file: File
): Promise<{ loaded: Loaded; remembered: boolean }> {
    let text: string
    try {
        text = await file.text()
    } catch {
        // A folder, or a file the browser can't read.
        return {
            loaded: { file: null, error: { kind: 'unreadable' } },
            remembered: false,
        }
    }
    const loaded = readResultsText(text)
    return { loaded, remembered: loaded.file ? rememberFile(text) : false }
}

/** The note shown when the kept file no longer reads and was forgotten. */
export const FORGOTTEN_NOTE =
    'The results file this browser kept no longer reads, so it was forgotten.'

/** The right column's place from 90rem: column 2, down both rows. */
const SIDE_PLACE =
    'min-[90rem]:col-start-2 min-[90rem]:row-span-2 min-[90rem]:row-start-1'

/**
 * The page's header: `Armory` and the tagline under it (the character is
 * on the gear card's heading), with Wishlist and Export Pawn string on the
 * right.
 */
function Header({
    file,
    wishlistCount,
    localAction,
    onOpenWishlist,
    onOpenPawn,
}: {
    file: ResultsFile | null
    wishlistCount: number
    /** Dev only: the local latest file's button, or null. */
    localAction: ReactNode
    onOpenWishlist: () => void
    onOpenPawn: () => void
}) {
    return (
        <header className="flex flex-wrap items-end gap-6">
            <div>
                <h1 className="text-display leading-none tracking-[0.01em]">
                    Armory
                </h1>
                <p className="mt-2.5 text-muted-foreground">
                    See your gear, what the sim would change, and how a fight
                    plays out.
                </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
                {localAction}
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
                    variant="pill"
                    className="h-auto px-4 py-1.5 text-base"
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
 * The footer, where the mockup has its own: where the file came from (kept
 * in this browser, or dev only, loaded from this computer), the sample note
 * (a sample file has made-up numbers), how sure the sim is (its checks), the
 * line on the art, and the sim's credit while it runs and once a file loads.
 */
function Footer({
    file,
    remembered,
    credit,
    localLine,
    onForget,
}: {
    file: ResultsFile | null
    remembered: boolean
    credit: boolean
    /** Dev only: `Loaded from this computer, made Nov. 17`, or null. */
    localLine: ReactNode
    onForget: () => void
}) {
    const art = file
        ? characterArt(
              file.character.race,
              file.character.class,
              file.character.gender
          )
        : null
    return (
        <footer className="mt-7 flex flex-col gap-2 text-[0.78125rem] text-muted-foreground">
            {localLine}
            {file && remembered && (
                <p>
                    This file is kept in this browser only.{' '}
                    <Button
                        variant="link"
                        className="h-auto p-0 text-[0.78125rem] font-normal"
                        onClick={onForget}
                    >
                        Forget this file
                    </Button>
                </p>
            )}
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
                {art ? (
                    <span>
                        Not affiliated with the game&apos;s publisher. Character
                        art is the owner&apos;s own.
                    </span>
                ) : (
                    <span>
                        Not affiliated with the game&apos;s publisher; all art
                        here is original placeholder.
                    </span>
                )}
            </p>
            {file && (
                <Checks checks={file.checks} leftOut={file.left_out_items} />
            )}
            {credit && <p>{SIM_CREDIT}</p>}
        </footer>
    )
}

type OpenDialog =
    | { kind: 'picker'; slot: Slot; focusItemId?: number }
    | { kind: 'wishlist' }
    | { kind: 'talents' }
    | { kind: 'pawn' }
    | null

/** An export: the addon's SavedVariables file. */
function isExport(file: File): boolean {
    return file.name.toLowerCase().endsWith('.lua')
}

/** A character simmed from an export dropped in this visit, for Refine. */
/**
 * The character behind the file shown, when this visit simmed it: Refine's
 * estimate, and the export it came from (Run Simulator sims it again).
 */
type Simmed = { character: Character; minutes: number; exportText: string }

/**
 * The armory planner's page. A render error in it is caught by the home
 * route's error boundary (`routes/home.tsx`).
 *
 * @param createPool - Makes the browser sim's pool, the first time an
 * export is dropped (tests pass a fake).
 * @param localLatest - Dev only: open on the owner's latest results file
 * from the dev server, and follow it (`components/latest-file.tsx`). Off
 * in a build.
 */
export function App({
    createPool = createSimPool,
    localLatest = import.meta.env.DEV,
}: {
    createPool?: () => SimPool
    localLatest?: boolean
} = {}) {
    const [loaded, setLoaded] = useState<Loaded>({ file: null, error: null })
    const [planner, setPlanner] = useState<PlannerState | null>(null)
    const [wishlist, setWishlist] = useState<Wishlist>(() => new Map())
    const [dialog, setDialog] = useState<OpenDialog>(null)
    // Whether the file shown is the one kept in this browser.
    const [remembered, setRemembered] = useState(false)
    // Whether the kept file no longer read and was forgotten on load.
    const [forgotten, setForgotten] = useState(false)
    // The export's run before any file: its progress, or why it stopped.
    const [simming, setSimming] = useState<SimCount | null>(null)
    // The estimate while the run sims weights first (no file for the band).
    const [weightsFirst, setWeightsFirst] = useState<number | null>(null)
    const [stop, setStop] = useState<SimStop | null>(null)
    // The character behind the file shown, when this visit simmed it.
    const [simmed, setSimmed] = useState<Simmed | null>(null)
    const [refining, setRefining] = useState<SimCount | null>(null)
    // Run Simulator's progress, while it runs.
    const [running, setRunning] = useState<SimCount | null>(null)
    // Why the last Run Simulator didn't replace the file, or null.
    const [runProblem, setRunProblem] = useState<string | null>(null)
    // Where the fight settings are (Run Simulator sims them).
    const [fightSettings, setFightSettings] = useState<FightSettings | null>(
        null
    )
    const [phone, setPhone] = useState(false)

    const pool = useRef<SimPool | null>(null)
    // Each run's number: a run that's no longer the latest is ignored.
    const run = useRef(0)
    const heading = useRef<HTMLHeadingElement | null>(null)
    const focusHeading = useRef(false)

    const getPool = () => (pool.current ??= createPool())

    const open = (next: Loaded, keptHere = false, focus = false) => {
        setLoaded(next)
        setPlanner(next.file ? initialPlannerState(next.file) : null)
        setRemembered(keptHere)
        setForgotten(false)
        setStop(null)
        setSimmed(null)
        focusHeading.current = focus && next.file !== null
    }

    /** A file the browser sim made: shown, and kept like any results file. */
    const openSimmed = (
        outcome: Extract<SimExportOutcome, { kind: 'file' }>,
        size: number,
        focus: boolean,
        exportText: string
    ) => {
        const kept = rememberFile(JSON.stringify(outcome.file))
        open({ file: outcome.file, error: null }, kept, focus)
        setSimmed({
            exportText,
            character: outcome.character,
            minutes: estimateMinutes(
                weightsIterations(outcome.character.level),
                outcome.msPerIteration,
                size
            ),
        })
    }

    const simFailed = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        open({ file: null, error: { kind: 'sim', message } })
    }

    const simPicked = async (picked: File) => {
        const id = ++run.current
        open({ file: null, error: null })
        let text: string
        try {
            text = await picked.text()
        } catch {
            open({ file: null, error: { kind: 'unreadable' } })
            return
        }
        if (run.current !== id) return
        const simPool = getPool()
        setSimming({ done: 0, planned: 0 })
        setWeightsFirst(null)
        try {
            const outcome = await simExport(
                text,
                simPool,
                (done, planned) => {
                    if (run.current === id) setSimming({ done, planned })
                },
                {
                    onWeightsFirst: (minutes) => {
                        if (run.current === id) setWeightsFirst(minutes)
                    },
                }
            )
            if (run.current !== id) return
            setSimming(null)
            setWeightsFirst(null)
            if (outcome.kind === 'file')
                openSimmed(outcome, simPool.size, true, text)
            else setStop(outcome)
        } catch (error) {
            if (run.current !== id || error instanceof SimCancelled) return
            setSimming(null)
            setWeightsFirst(null)
            simFailed(error)
        }
    }

    /**
     * Shows the local latest file (dev only). A newer one found by a
     * refresh keeps the fight and the plan view where it has them.
     */
    const showLatest = (next: ResultsFile, refresh: boolean) => {
        setLoaded({ file: next, error: null })
        setPlanner((current) => {
            let state = initialPlannerState(next)
            if (refresh && current) {
                state = pickFight(next, state, current.fightId)
                if (current.view === 'plan')
                    state = showView(next, state, 'plan')
            }
            return state
        })
        setRemembered(false)
        setForgotten(false)
        setStop(null)
        setSimmed(null)
    }

    const openPicked = (picked: File) => {
        latest.leave()
        stopRefine()
        if (isExport(picked)) {
            void simPicked(picked)
            return
        }
        void readFile(picked).then(({ loaded: next, remembered: kept }) =>
            open(next, kept, next.file !== null)
        )
    }

    /** Stops the export's run, or Refine (which keeps the file shown). */
    const cancel = () => {
        run.current += 1
        pool.current?.cancel()
        setSimming(null)
        setWeightsFirst(null)
        setRefining(null)
        setRunning(null)
    }

    /** A Refine still running is stopped when its file goes away. */
    const stopRefine = () => {
        if (refining) cancel()
    }

    const startRefine = async () => {
        const file = loaded.file
        if (!file || !simmed) return
        const id = ++run.current
        const simPool = getPool()
        setRefining({ done: 0, planned: 0 })
        try {
            const outcome = await refine(
                file,
                simmed.character,
                simPool,
                (done, planned) => {
                    if (run.current === id) setRefining({ done, planned })
                }
            )
            if (run.current !== id) return
            setRefining(null)
            // A refined run that stops keeps the file shown.
            if (outcome.kind === 'file')
                openSimmed(outcome, simPool.size, false, simmed.exportText)
        } catch {
            // Cancelled, or the sim failed: the unrefined file stays.
            if (run.current === id) setRefining(null)
        }
    }

    /**
     * Run Simulator: sims the export behind the file shown again with the
     * fight settings, and shows the new file on the fight they pick (the
     * long dungeon fight takes them, see `scenariosFor`). A run that
     * stops, fails or is cancelled keeps the file shown.
     */
    const runSimulator = async (text: string) => {
        const file = loaded.file
        if (!file || !fightSettings) return
        const settings = fightSettings
        const onChain =
            file.fights.find((entry) => entry.fight_id === planner?.fightId)
                ?.kind === 'chain'
        const id = ++run.current
        const simPool = getPool()
        setRunning({ done: 0, planned: 0 })
        setRunProblem(null)
        try {
            const outcome = await simExport(
                text,
                simPool,
                (done, planned) => {
                    if (run.current === id) setRunning({ done, planned })
                },
                {
                    fight: fightOverride(file, settings, onChain),
                }
            )
            if (run.current !== id) return
            setRunning(null)
            if (outcome.kind !== 'file') {
                setRunProblem(
                    `The sim stopped: ${stopLines(outcome).join(' ')}`
                )
                return
            }
            latest.leave()
            openSimmed(outcome, simPool.size, false, text)
            const next = outcome.file
            const picked =
                fightFor(next, settings)?.fight_id ?? next.default_fight_id
            setPlanner((current) =>
                current ? pickFight(next, current, picked) : current
            )
        } catch (error) {
            if (run.current !== id || error instanceof SimCancelled) return
            setRunning(null)
            setRunProblem(
                `The sim failed: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    const forget = () => {
        latest.leave()
        stopRefine()
        forgetFile()
        open({ file: null, error: null })
        setWishlist(new Map())
        setDialog(null)
    }

    // The pool's workers stop with the page.
    useEffect(
        () => () => {
            pool.current?.close()
            pool.current = null
        },
        []
    )

    // Phones get a note: the browser only, so the prerendered page has none.
    useEffect(() => {
        setPhone(
            typeof window.matchMedia === 'function' &&
                window.matchMedia(PHONE_QUERY).matches
        )
    }, [])

    // Focus moves to the gear card's heading (the character's name) when a
    // picked file loads.
    useEffect(() => {
        if (loaded.file && focusHeading.current) {
            focusHeading.current = false
            heading.current?.focus()
        }
    }, [loaded.file])

    // The kept file comes back after the page loads: in an effect, so the
    // prerendered page (and hydration) is always the new-visitor state.
    useEffect(() => {
        const recalled = recallFile()
        if (recalled.kind === 'file') {
            setLoaded({ file: recalled.file, error: null })
            setPlanner(initialPlannerState(recalled.file))
            setRemembered(true)
        } else if (recalled.kind === 'forgotten') setForgotten(true)
    }, [])

    // Dev only: the local latest file overrides the kept one, after it.
    const latest = useLocalLatest({
        on: localLatest,
        show: showLatest,
        showError: (readError) => open({ file: null, error: readError }),
        // An export's run or a Refine would replace the latest when done.
        beforeFollow: () => {
            if (simming || refining || running) cancel()
        },
        openPicked,
    })

    // A file dropped anywhere on the page must not make the browser open it.
    // With nothing loaded yet, or the local latest file shown, the drop
    // loads it, as the drop box does.
    const waiting =
        (loaded.file === null && simming === null) || latest.following
    useEffect(() => {
        const onDragOver = (event: DragEvent) => event.preventDefault()
        const onDrop = (event: DragEvent) => {
            event.preventDefault()
            const dropped = event.dataTransfer?.files?.[0]
            if (waiting && dropped) openPicked(dropped)
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
    const bagOn = planner?.bagOn ?? []
    const wornOf = (fightId: string) =>
        file && planner ? wornResult(file, planner, fightId) : null
    // Refine: only for a character simmed in this visit, until its weights
    // are its own.
    const refinable =
        file !== null &&
        simmed !== null &&
        !file.stat_weights.some((entry) => entry.source?.kind === 'yours')
    // The export Run Simulator sims: the one this visit simmed, else (dev)
    // the one beside the latest file.
    const exportText =
        simmed?.exportText ?? (latest.following ? latest.exportText : null)
    const refineAction = refining ? (
        <SimProgress count={refining} onCancel={cancel} />
    ) : refinable && simmed ? (
        <Button variant="outline" size="sm" onClick={() => void startRefine()}>
            {`Refine for your gear (about ${simmed.minutes} min)`}
        </Button>
    ) : null

    return (
        <TooltipProvider>
            <main className="mx-auto flex max-w-360 flex-col px-4 pt-7.5 pb-9 sm:px-6 lg:px-10">
                <Header
                    file={file}
                    wishlistCount={wishlist.size}
                    localAction={latest.action}
                    onOpenWishlist={() => setDialog({ kind: 'wishlist' })}
                    onOpenPawn={() => setDialog({ kind: 'pawn' })}
                />
                {latest.lines}
                {file?.provisional && (
                    <p
                        role="note"
                        className="mt-4.5 flex items-start gap-2 rounded-lg border border-ring/60 bg-muted/40 px-3 py-2 text-base"
                    >
                        <InfoIcon className="mt-0.75 size-4 text-muted-foreground" />
                        <span>
                            The sim isn&apos;t checked against real fights yet.
                            Use these numbers to compare gear, not as a promise
                            of DPS.
                        </span>
                    </p>
                )}
                <div
                    data-slot="planner-body"
                    // The owner's layout v2: the gear card, and under it the
                    // band, on the left; Simulator Data and its card on the
                    // right, down both rows (the band's row takes the slack,
                    // so a tall right column never pushes the band down).
                    // One column below 90rem: gear, numbers, band.
                    className="mt-5 grid items-start gap-8 min-[90rem]:grid-cols-[minmax(0,1fr)_27.75rem] min-[90rem]:grid-rows-[auto_1fr]"
                >
                    <GearPane
                        file={file}
                        plan={plan}
                        planShown={planShown}
                        bagOn={bagOn}
                        wishlist={wishlist}
                        onToggleWishlist={toggleWishlist}
                        headingRef={heading}
                        onWearBag={(itemId) =>
                            dispatch({ type: 'wear-bag-item', item_id: itemId })
                        }
                        onWearAllBags={() =>
                            dispatch({ type: 'wear-all-bag-items' })
                        }
                        onUndoBag={() => dispatch({ type: 'undo-bag-item' })}
                        middle={
                            simming ? (
                                <Simming
                                    count={simming}
                                    phone={phone}
                                    weightsFirst={weightsFirst}
                                    onCancel={cancel}
                                />
                            ) : (
                                <BringIn
                                    error={error}
                                    notice={forgotten ? FORGOTTEN_NOTE : null}
                                    stop={stop}
                                    phone={phone}
                                    onFile={openPicked}
                                    onSample={() => {
                                        latest.leave()
                                        open(readResults(sample))
                                    }}
                                />
                            )
                        }
                        onShowPlan={() => dispatch({ type: 'show-plan' })}
                        onShowWorn={() => dispatch({ type: 'show-worn' })}
                        onOpenSlot={(slot, focusItemId) =>
                            setDialog({ kind: 'picker', slot, focusItemId })
                        }
                        onOpenTalents={() => setDialog({ kind: 'talents' })}
                    />
                    {file && planner ? (
                        <SimPanel
                            file={file}
                            fightId={planner.fightId}
                            plan={plan}
                            planShown={planShown}
                            wornOf={wornOf}
                            className={SIDE_PLACE}
                            onRunSimulator={
                                exportText !== null && !refining
                                    ? () => void runSimulator(exportText)
                                    : undefined
                            }
                            runNote={
                                exportText !== null && refining
                                    ? 'Wait for Refine for your gear to finish.'
                                    : undefined
                            }
                            running={
                                running && (
                                    <SimProgress
                                        count={running}
                                        onCancel={cancel}
                                    />
                                )
                            }
                            runProblem={runProblem}
                            settings={
                                <FightSettingsForm
                                    file={file}
                                    fightId={planner.fightId}
                                    onSettings={setFightSettings}
                                    onPickFight={(fightId) =>
                                        dispatch({
                                            type: 'pick-fight',
                                            fight_id: fightId,
                                        })
                                    }
                                />
                            }
                            sliders={
                                planner.mix && (
                                    <RoleSliders
                                        plans={file.plans}
                                        mix={planner.mix}
                                        plan={plan}
                                        inWornView={!planShown}
                                        switched={planner.switched}
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
                        <LockedSimPanel className={SIDE_PLACE} />
                    )}
                    {file && planner && (
                        <FightBand
                            file={file}
                            plan={plan}
                            fightId={planner.fightId}
                            wornOf={wornOf}
                            weightsAction={refineAction}
                            className="min-[90rem]:col-start-1 min-[90rem]:row-start-2"
                        />
                    )}
                </div>
                <Footer
                    file={file}
                    remembered={remembered}
                    credit={file !== null || simming !== null}
                    localLine={latest.footer}
                    onForget={forget}
                />
                {file && dialog?.kind === 'picker' && (
                    <ItemPicker
                        entry={slotEntry(file, dialog.slot, bagOn)}
                        slot={dialog.slot}
                        focusItemId={dialog.focusItemId}
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
