/**
 * The Pawn strings dialog (spec section 11), as the mockup lays it out:
 * each string under its label, in a box, with a Copy button (`Copy solo
 * string`) and a note beside it that reads `Copied` or `Copy failed. Select
 * the text and copy it by hand.` for 2.4 seconds.
 */
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import type { ResultsFile } from '../results-file'
import { PlannerDialog } from './planner-dialog'

type PawnString = ResultsFile['pawn'][number]

const COPY_NOTE_MS = 2400

/**
 * The Copy button's words, as the mockup has them: `Copy solo string` for
 * a string labelled `Solo, level 30`.
 *
 * @param label - The Pawn string's label.
 * @returns The words.
 */
export function copyWords(label: string): string {
    const first = label.split(',')[0]?.trim().toLowerCase()
    return first ? `Copy ${first} string` : 'Copy'
}

function PawnRow({ pawn }: { pawn: PawnString }) {
    const headingId = useId()
    const [note, setNote] = useState('')
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current)
        },
        []
    )

    const show = (text: string) => {
        setNote(text)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setNote(''), COPY_NOTE_MS)
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(pawn.text)
            show('Copied')
        } catch {
            show('Copy failed. Select the text and copy it by hand.')
        }
    }

    return (
        <li aria-labelledby={headingId}>
            <h3 id={headingId} className="mt-3.5 text-base">
                {pawn.label}
            </h3>
            <pre className="mt-1.5 mb-2 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-[0.78125rem] leading-normal break-words whitespace-pre-wrap">
                {pawn.text}
            </pre>
            <Button
                variant="outline"
                className="h-auto rounded-full px-4 py-2 text-[0.9375rem] font-normal"
                onClick={() => void copy()}
            >
                {copyWords(pawn.label)}
            </Button>
            <span
                aria-live="polite"
                className="ml-2.5 text-[0.8125rem] text-good-text"
            >
                {note}
            </span>
        </li>
    )
}

/**
 * The dialog.
 *
 * @param pawn - The file's Pawn strings.
 * @param onClose - Closes the dialog.
 */
export function PawnDialog({
    pawn,
    onClose,
}: {
    pawn: PawnString[]
    onClose: () => void
}) {
    return (
        <PlannerDialog
            title="Pawn strings"
            description="In the game, open Pawn, then Scale, then Import, and paste one."
            onClose={onClose}
        >
            <ul className="flex flex-col">
                {pawn.map((entry) => (
                    <PawnRow key={entry.label} pawn={entry} />
                ))}
            </ul>
        </PlannerDialog>
    )
}
