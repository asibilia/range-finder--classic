/**
 * The armory planner's page. It opens with nothing loaded, reads a results
 * file picked, dropped or bundled as the sample, and shows the character.
 */
import { useState } from 'react'

import { BringIn, type ReadError } from './bring-in'
import { GearPane } from './gear-pane'
import { readResultsFile, type ResultsFile } from './results-file'
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

function Header({ file }: { file: ResultsFile }) {
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
        </header>
    )
}

export function App() {
    const [loaded, setLoaded] = useState<Loaded>({ file: null, error: null })

    const onFile = (picked: File) => {
        void readFile(picked).then(setLoaded)
    }

    const { file, error } = loaded
    return (
        <main className="planner">
            {file ? (
                <Header file={file} />
            ) : (
                <header className="page-header">
                    <h1>Armory planner</h1>
                </header>
            )}
            {!file && (
                <BringIn
                    error={error}
                    onFile={onFile}
                    onSample={() => setLoaded(load(sample))}
                />
            )}
            <GearPane file={file} />
        </main>
    )
}
