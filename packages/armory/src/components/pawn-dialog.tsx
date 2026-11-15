/**
 * The Pawn strings dialog (spec section 11): each string in a read-only
 * text box with a Copy button that reads `Copied` or `Copy failed` for 2
 * seconds.
 */
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

import type { ResultsFile } from '../results-file'
import { PlannerDialog } from './planner-dialog'

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
        <li className="flex flex-col gap-1.5">
            <label htmlFor={boxId} className="text-sm font-medium">
                {pawn.label}
            </label>
            <textarea
                id={boxId}
                readOnly
                value={pawn.text}
                rows={3}
                className="w-full resize-none rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void copy()}
            >
                {label}
            </Button>
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
            description="In game: Pawn, then Scale, then Import. Paste one string."
            onClose={onClose}
        >
            <ul className="flex flex-col gap-4">
                {pawn.map((entry) => (
                    <PawnRow key={entry.label} pawn={entry} />
                ))}
            </ul>
        </PlannerDialog>
    )
}
