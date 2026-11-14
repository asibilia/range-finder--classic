/**
 * The new-visitor state: how to bring a character in. A file picker, a drop
 * box and the bundled sample. The page itself takes a dropped file, wherever
 * it lands (see `App`). Files are read in the browser only.
 */
import { SCHEMA_VERSION } from './results-file'

export type ReadError =
    | { kind: 'unreadable' }
    | { kind: 'not-json' }
    | { kind: 'version'; version: number }
    | { kind: 'invalid'; problems: string[] }

function ErrorMessage({ error }: { error: ReadError }) {
    if (error.kind === 'unreadable')
        return (
            <div role="alert" className="read-error">
                <p>This file couldn&apos;t be read.</p>
            </div>
        )
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
                    {`This results file is version ${error.version}. The planner reads version ${SCHEMA_VERSION}.`}
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
    return (
        <section className="bring-in" aria-labelledby="bring-in-heading">
            <h2 id="bring-in-heading">Bring your character in</h2>
            <p>Open a results file from the gear sim to see your character.</p>
            <ol className="bring-in-steps">
                <li>Install the Turbo addon and type /tbexport in the game.</li>
                <li>Run the gear sim on that export to get a results file.</li>
                <li>Open the results file here, or drop it on this page.</li>
            </ol>
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
