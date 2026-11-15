/**
 * The new-visitor card, in the middle of the gear pane: how to bring a
 * character in, a file picker, a drop box and the bundled sample. The page
 * itself also takes a file dropped anywhere on it (see `App`). Files are
 * read in the browser only.
 */
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'

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
 * @param onFile - Called with a picked or dropped file.
 * @param onSample - Loads the bundled sample.
 */
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
        <section aria-labelledby="bring-in-heading" className="w-full">
            <Card className="shadow-lg ring-ring/40">
                <CardHeader>
                    <CardTitle className="text-lg">
                        <h2 id="bring-in-heading">Bring your character in</h2>
                    </CardTitle>
                    <CardDescription>
                        Open a results file from the gear sim to see your
                        character.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <ol className="list-decimal pl-5 text-sm marker:text-muted-foreground">
                        <li>
                            Install the Turbo addon and type /tbexport in the
                            game.
                        </li>
                        <li>
                            Run the gear sim on that export to get a results
                            file.
                        </li>
                        <li>
                            Open the results file here, or drop it on this page.
                        </li>
                    </ol>
                    {error && <ErrorMessage error={error} />}
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                        Open a results file
                        <input
                            type="file"
                            accept=".json,application/json"
                            className="w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground"
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
                        className="rounded-lg border border-dashed border-ring/60 bg-muted/40 px-3 py-4 text-center text-sm"
                    >
                        <p>Or drop the file here.</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Simming your own export right here is coming later.
                    </p>
                    <Button variant="secondary" onClick={onSample}>
                        Look at a sample character
                    </Button>
                </CardContent>
            </Card>
        </section>
    )
}
