/**
 * The armory planner's page. It opens with nothing loaded, reads a results
 * file picked, dropped or bundled as the sample, and shows the character.
 */
import { useState } from 'react'

import { BringIn, type ReadError } from './bring-in'
import { Card, defaultPlan } from './card'
import type { Item } from './gains'
import { GearPane } from './gear-pane'
import { ItemPicker, type Wishlist, WishlistDialog } from './item-picker'
import { readResultsFile, type ResultsFile, type Slot } from './results-file'
import {
    closestPlan,
    type Mix,
    type Plan,
    type Role,
    RoleSliders,
} from './role-sliders'
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
    const text = await file.text()
    let input: unknown
    try {
        input = JSON.parse(text)
    } catch {
        return { file: null, error: { kind: 'not-json' } }
    }
    return load(input)
}

function Header({
    file,
    wishlistCount,
    onOpenWishlist,
}: {
    file: ResultsFile
    wishlistCount: number
    onOpenWishlist: () => void
}) {
    const { character } = file
    const exportDate = new Date(file.export_saved_at).toISOString().slice(0, 10)
    return (
        <header className="page-header">
            {file.sample && (
                <p className="sample-note">
                    Sample file: some numbers here are made up to try the page.
                </p>
            )}
            <h1>{character.name}</h1>
            <p>
                {`Level ${character.level} ${character.race} ${character.spec} ${character.class}`}
            </p>
            <p>{`From your export of ${exportDate}`}</p>
            <div className="header-actions">
                <button type="button" onClick={onOpenWishlist}>
                    {`Wishlist (${wishlistCount})`}
                </button>
            </div>
        </header>
    )
}

/** The gear heading, the switch between views, and why the view switched. */
function GearTop({
    plan,
    showPlan,
    switched,
    onShowPlan,
    onShowWorn,
}: {
    plan: Plan | null
    showPlan: boolean
    switched: boolean
    onShowPlan: () => void
    onShowWorn: () => void
}) {
    const planShown = showPlan && plan !== null
    return (
        <>
            <h2>{planShown ? `Sim's plan: ${plan.label}` : 'What you wear'}</h2>
            {plan &&
                (planShown ? (
                    <button type="button" onClick={onShowWorn}>
                        Show what I wear
                    </button>
                ) : (
                    <button type="button" onClick={onShowPlan}>
                        Show the sim&apos;s plan
                    </button>
                ))}
            {planShown && switched && (
                <p>Switched to the sim&apos;s plan for this mix.</p>
            )}
        </>
    )
}

type OpenDialog = { kind: 'picker'; slot: Slot } | { kind: 'wishlist' } | null

export function App() {
    const [loaded, setLoaded] = useState<Loaded>({ file: null, error: null })
    const [wishlist, setWishlist] = useState<Wishlist>(() => new Map())
    const [dialog, setDialog] = useState<OpenDialog>(null)

    const [mix, setMix] = useState<Mix | null>(null)
    const [showPlan, setShowPlan] = useState(false)
    const [switched, setSwitched] = useState(false)

    const open = (next: Loaded) => {
        setLoaded(next)
        setMix(next.file ? (defaultPlan(next.file.plans)?.mix ?? null) : null)
        setShowPlan(false)
        setSwitched(false)
    }

    const onFile = (picked: File) => {
        void readFile(picked).then(open)
    }

    const moveSlider = (role: Role, value: number) => {
        setMix((current) => (current ? { ...current, [role]: value } : current))
        if (!showPlan) {
            setShowPlan(true)
            setSwitched(true)
        }
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

    const { file, error } = loaded
    const plan = file && mix ? closestPlan(file.plans, mix) : null
    return (
        <main className="planner">
            {file ? (
                <Header
                    file={file}
                    wishlistCount={wishlist.size}
                    onOpenWishlist={() => setDialog({ kind: 'wishlist' })}
                />
            ) : (
                <header className="page-header">
                    <h1>Armory planner</h1>
                </header>
            )}
            {!file && (
                <BringIn
                    error={error}
                    onFile={onFile}
                    onSample={() => open(load(sample))}
                />
            )}
            <div className="planner-body">
                <div className="gear-column">
                    <GearPane
                        file={file}
                        plan={showPlan ? plan : null}
                        top={
                            file && (
                                <GearTop
                                    plan={plan}
                                    showPlan={showPlan}
                                    switched={switched}
                                    onShowPlan={() => setShowPlan(true)}
                                    onShowWorn={() => {
                                        setShowPlan(false)
                                        setSwitched(false)
                                    }}
                                />
                            )
                        }
                        onOpenSlot={(slot) =>
                            setDialog({ kind: 'picker', slot })
                        }
                    />
                    {file && file.plans.length > 0 && mix && (
                        <RoleSliders
                            plans={file.plans}
                            mix={mix}
                            plan={plan}
                            onChange={moveSlider}
                        />
                    )}
                </div>
                {file && <Card file={file} plan={plan} />}
            </div>
            {file && dialog?.kind === 'picker' && (
                <ItemPicker
                    entry={file.slots.find(
                        (entry) => entry.slot === dialog.slot
                    )}
                    slot={dialog.slot}
                    level={file.character.level}
                    wishlist={wishlist}
                    onToggle={toggleWishlist}
                    onClose={closeDialog}
                />
            )}
            {file && dialog?.kind === 'wishlist' && (
                <WishlistDialog
                    wishlist={wishlist}
                    onRemove={removeFromWishlist}
                    onClose={closeDialog}
                />
            )}
        </main>
    )
}
