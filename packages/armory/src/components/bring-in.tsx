/**
 * The new-visitor card, in the middle of the gear pane: how to bring a
 * character in, a file picker, a drop box and the bundled sample. The page
 * itself also takes a file dropped anywhere on it (see `App`). Files are
 * read in the browser only.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { SimStop } from '../browser-sim'
import { withArticle } from '../format'
import { SCHEMA_VERSION } from '../results-file'
import { PHONE_NOTE } from './sim-progress'

/** Why the last file couldn't be opened. */
export type ReadError =
    | { kind: 'unreadable' }
    | { kind: 'not-json' }
    | { kind: 'version'; version: number }
    | { kind: 'invalid'; problems: string[] }
    /** An export the browser sim couldn't sim. */
    | { kind: 'sim'; message: string }

/** Said under failed `sheet …` gates: a new export would fix them. */
export const EXPORT_AGAIN = 'Export again out of combat and drop the new file.'

/**
 * What the page says for a run that stopped before it made a file, one
 * line each. The browser sim's stops carry data only: every word the
 * player reads about one is here.
 *
 * @param stop - The stop.
 * @returns The lines.
 */
export function stopLines(stop: SimStop): string[] {
    switch (stop.kind) {
        case 'unsupported':
            return [
                `The sim covers Enhancement Shaman only for now. Your character is ${withArticle(`${stop.spec} ${stop.class}`)}.`,
            ]
        case 'format':
            return [
                `This export is format ${stop.format}. The page reads formats ${stop.accepted.join(', ')}. Update the TurboCharExport addon and export again.`,
            ]
        case 'gates': {
            const lines = stop.failed.map(
                (check) => `Failed: ${check.name}. ${check.detail}`
            )
            if (stop.failed.some((check) => check.name.startsWith('sheet ')))
                lines.push(EXPORT_AGAIN)
            return lines
        }
        case 'unknown_main_hand':
            return [
                `The sim doesn't know your main-hand weapon (item ${stop.item_id}).`,
            ]
        default: {
            // A new kind of stop fails the type-check until it has words.
            const unworded: never = stop
            throw new Error(
                `No words for the stop ${JSON.stringify(unworded)}.`
            )
        }
    }
}

function StopMessage({ stop }: { stop: SimStop }) {
    return (
        <Alert variant="destructive">
            <AlertDescription>
                {stopLines(stop).map((line, index) => (
                    <p key={index} className="break-words">
                        {line}
                    </p>
                ))}
            </AlertDescription>
        </Alert>
    )
}

function ErrorMessage({ error }: { error: ReadError }) {
    const title =
        error.kind === 'unreadable'
            ? "This file couldn't be read."
            : error.kind === 'not-json'
              ? "This file isn't a results file: it isn't JSON."
              : error.kind === 'version'
                ? `This results file is version ${error.version}. The planner reads version ${SCHEMA_VERSION}.`
                : error.kind === 'sim'
                  ? "This export couldn't be simmed."
                  : "This file isn't a results file the planner can read."
    return (
        <Alert variant="destructive">
            <AlertTitle>{title}</AlertTitle>
            {error.kind === 'sim' && (
                <AlertDescription>
                    <p className="break-words">{error.message}</p>
                </AlertDescription>
            )}
            {error.kind === 'invalid' && (
                <AlertDescription>
                    <ul className="list-disc pl-4 break-words">
                        {error.problems.map((problem, index) => (
                            <li key={index}>{problem}</li>
                        ))}
                    </ul>
                </AlertDescription>
            )}
        </Alert>
    )
}

/**
 * The card.
 *
 * @param error - Why the last file failed, or null.
 * @param notice - A short note to show above the steps (the kept file was
 * forgotten), or null.
 * @param stop - Why the last export stopped before any numbers, or null.
 * @param phone - Whether to say it works best on a computer.
 * @param onFile - Called with a picked or dropped file.
 * @param onSample - Loads the bundled sample.
 */
export function BringIn({
    error,
    notice,
    stop = null,
    phone = false,
    onFile,
    onSample,
}: {
    error: ReadError | null
    notice: string | null
    stop?: SimStop | null
    phone?: boolean
    onFile: (file: File) => void
    onSample: () => void
}) {
    return (
        <section
            aria-labelledby="bring-in-heading"
            className="mt-3 w-full rounded-[0.875rem] border border-ring/60 bg-card px-4 py-3.5 shadow-lg"
        >
            <h2 id="bring-in-heading" className="mb-2 text-xl leading-tight">
                Bring your character in
            </h2>
            {notice && (
                <p
                    role="status"
                    className="mb-2 text-[0.8125rem] text-muted-foreground"
                >
                    {notice}
                </p>
            )}
            <ol className="mb-3 list-decimal pl-5 text-sm marker:text-muted-foreground [&>li]:my-0.75">
                <li>
                    Install the TurboCharExport addon and type{' '}
                    <code className="font-mono text-[0.8125rem] text-chart-2-text">
                        /tbexport
                    </code>{' '}
                    in the game.
                </li>
                <li>
                    Type{' '}
                    <code className="font-mono text-[0.8125rem] text-chart-2-text">
                        /reload
                    </code>{' '}
                    so the game writes the file.
                </li>
                <li>
                    Drop TurboCharExport.lua here. It&apos;s in your game
                    folder, inside WTF, then Account, in your character&apos;s
                    SavedVariables folder.
                </li>
            </ol>
            {phone && (
                <p className="mb-2 text-[0.8125rem] text-muted-foreground">
                    {PHONE_NOTE}
                </p>
            )}
            {error && (
                <div className="mb-2">
                    <ErrorMessage error={error} />
                </div>
            )}
            {stop && (
                <div className="mb-2">
                    <StopMessage stop={stop} />
                </div>
            )}
            {/* The drop box is the file picker too: select it to open a
                file, or drop one on it (or anywhere on the page). */}
            <label
                role="region"
                aria-label="Drop a results file"
                className="block w-full cursor-pointer rounded-lg border-[1.5px] border-dashed border-ring/60 bg-muted/40 px-2.5 py-4 text-center text-sm hover:border-chart-2 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
            >
                Drop your results file here
                <small className="mt-0.5 block text-[0.78125rem] text-muted-foreground">
                    or select to open it
                </small>
                <input
                    type="file"
                    aria-label="Open a results file"
                    accept=".json,application/json,.lua"
                    className="sr-only"
                    onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onFile(file)
                        event.target.value = ''
                    }}
                />
            </label>
            <p className="mt-1.5 mb-1 text-[0.78125rem] text-muted-foreground">
                Drop your TurboCharExport.lua here to sim your character on this
                computer. It never leaves your computer.
            </p>
            <button
                type="button"
                className="text-[0.8125rem] text-muted-foreground underline underline-offset-3 hover:text-foreground"
                onClick={onSample}
            >
                Or look at a sample character
            </button>
        </section>
    )
}
