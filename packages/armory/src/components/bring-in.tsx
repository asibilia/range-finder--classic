/**
 * The new-visitor card, in the middle of the gear pane: how to bring a
 * character in, a file picker, a drop box and the bundled sample. The page
 * itself also takes a file dropped anywhere on it (see `App`). Files are
 * read in the browser only.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { SCHEMA_VERSION } from '../results-file'

/** Why the last file couldn't be opened. */
export type ReadError =
    | { kind: 'unreadable' }
    | { kind: 'not-json' }
    | { kind: 'version'; version: number }
    | { kind: 'invalid'; problems: string[] }

function ErrorMessage({ error }: { error: ReadError }) {
    const title =
        error.kind === 'unreadable'
            ? "This file couldn't be read."
            : error.kind === 'not-json'
              ? "This file isn't a results file: it isn't JSON."
              : error.kind === 'version'
                ? `This results file is version ${error.version}. The planner reads version ${SCHEMA_VERSION}.`
                : "This file isn't a results file the planner can read."
    return (
        <Alert variant="destructive">
            <AlertTitle>{title}</AlertTitle>
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
 * @param onFile - Called with a picked or dropped file.
 * @param onSample - Loads the bundled sample.
 */
export function BringIn({
    error,
    notice,
    onFile,
    onSample,
}: {
    error: ReadError | null
    notice: string | null
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
                    Install the Turbo addon and type{' '}
                    <code className="font-mono text-[0.8125rem] text-chart-2-text">
                        /tbexport
                    </code>{' '}
                    in the game.
                </li>
                <li>Run the gear sim on that export to get a results file.</li>
                <li>Open the results file here, or drop it on this page.</li>
            </ol>
            {error && (
                <div className="mb-2">
                    <ErrorMessage error={error} />
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
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onFile(file)
                        event.target.value = ''
                    }}
                />
            </label>
            <p className="mt-1.5 mb-1 text-[0.78125rem] text-muted-foreground">
                Simming your own export right here is coming later.
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
