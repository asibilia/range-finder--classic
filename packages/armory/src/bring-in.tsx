/**
 * The new-visitor state: how to bring a character in. A file picker, a drop
 * target and the bundled sample. Files are read in the browser only.
 */
import type { DragEvent } from 'react'

export type ReadError =
    | { kind: 'not-json' }
    | { kind: 'version'; version: number }
    | { kind: 'invalid'; problems: string[] }

function ErrorMessage({ error }: { error: ReadError }) {
    if (error.kind === 'not-json')
        return (
            <div role="alert" className="read-error">
                <p>This file isn't a results file: it isn't JSON.</p>
            </div>
        )
    if (error.kind === 'version')
        return (
            <div role="alert" className="read-error">
                <p>
                    {`This results file is version ${error.version}. The planner reads version 1.`}
                </p>
            </div>
        )
    return (
        <div role="alert" className="read-error">
            <p>This file isn't a results file the planner can read.</p>
            <ul>
                {error.problems.map((problem, index) => (
                    <li key={index}>{problem}</li>
                ))}
            </ul>
        </div>
    )
}

export function BringIn({
    error,
    onFile,
    onSample,
}: {
    error: ReadError | null
    onFile: (file: File) => void
    onSample: () => void
}) {
    const onDragOver = (event: DragEvent) => {
        event.preventDefault()
    }
    const onDrop = (event: DragEvent) => {
        event.preventDefault()
        const file = event.dataTransfer?.files?.[0]
        if (file) onFile(file)
    }
    return (
        <section className="bring-in" aria-labelledby="bring-in-heading">
            <h2 id="bring-in-heading">Bring your character in</h2>
            <p>Open a results file from the gear sim to see your character.</p>
            {error && <ErrorMessage error={error} />}
            <label className="file-picker">
                Open a results file
                <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) onFile(file)
                        event.target.value = ''
                    }}
                />
            </label>
            <div
                role="region"
                aria-label="Drop a results file"
                className="drop-target"
                onDragOver={onDragOver}
                onDrop={onDrop}
            >
                <p>Or drop the file here.</p>
            </div>
            <p>Simming your own export right here is coming later.</p>
            <button type="button" onClick={onSample}>
                Look at a sample character
            </button>
        </section>
    )
}
