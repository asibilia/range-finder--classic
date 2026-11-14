/**
 * Regenerates results-file.schema.json from the Zod schema
 * (`bun run armory:schema` at the repo root).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resultsFileJsonSchema } from './results-file'

writeFileSync(
    join(import.meta.dir, 'results-file.schema.json'),
    resultsFileJsonSchema()
)
