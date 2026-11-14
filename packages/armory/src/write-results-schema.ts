/**
 * Regenerates results-file.schema.json from the Zod schema
 * (`bun run armory:schema` at the repo root). Given a path
 * (`bun run armory:schema <path>`), it writes there instead, which is how the
 * tests compare a fresh copy without touching the committed file.
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resultsFileJsonSchema } from './results-file'

const out = process.argv[2]
    ? resolve(process.argv[2])
    : join(import.meta.dir, 'results-file.schema.json')

writeFileSync(out, resultsFileJsonSchema())
