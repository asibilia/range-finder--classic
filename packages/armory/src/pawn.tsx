/**
 * The Pawn strings dialog (spec section 11): each string in a read-only text
 * box with a Copy button that reads `Copied` or `Copy failed` for 2 seconds.
 */
import { useEffect, useId, useRef, useState } from 'react'

import { Dialog } from './dialog'
import type { ResultsFile } from './results-file'

type PawnString = ResultsFile['pawn'][number]

const COPY_NOTE_MS = 2000

function PawnRow({ pawn }: { pawn: PawnString }) {
    const boxId = useId()
    const [label, setLabel] = useState('Copy')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current)
        },
        []
    )

    const show = (text: string) => {
        setLabel(text)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setLabel('Copy'), COPY_NOTE_MS)
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(pawn.text)
            show('Copied')
        } catch {
            show('Copy failed')
        }
    }

    return (
        <li className="pawn-row">
            <label htmlFor={boxId}>{pawn.label}</label>
            <textarea id={boxId} readOnly value={pawn.text} />
            <button type="button" onClick={() => void copy()}>
                {label}
            </button>
        </li>
    )
}

export function PawnDialog({
    pawn,
    onClose,
}: {
    pawn: PawnString[]
    onClose: () => void
}) {
    return (
        <Dialog title="Pawn strings" onClose={onClose}>
            <p>In game: Pawn, then Scale, then Import. Paste one string.</p>
            <ul className="pawn-list">
                {pawn.map((entry) => (
                    <PawnRow key={entry.label} pawn={entry} />
                ))}
            </ul>
        </Dialog>
    )
}
