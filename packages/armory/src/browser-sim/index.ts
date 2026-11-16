/**
 * The offline runner's core, ported to the browser: an export read into a
 * character, and a character into a results file, simmed by
 * `@goturbo/sim`'s pool.
 */
export type { Character, Gear, GearPiece, SimStop } from './character'
export { L60_TOLERANCE, NOTES, level60Check, sheetChecks } from './checks'
export {
    BASE_RATES,
    EXPORT_FORMATS,
    EXPORT_SLOTS,
    EXPORT_VARIABLE,
    exportStopMessage,
    IMBUES,
    readExport,
    talentString,
    WEAPON_SKILLS,
    type ExportRead,
} from './export-reader'
export { fileItem, leftOutReason, loadItemDb, type ItemDb } from './gear'
export { pawnScale, pawnStrings } from './pawn'
export { planMaxDamage } from './plan'
export { buildRequest, type RequestOptions } from './request'
export { rankFor, rotationFor, RANKS } from './rotation'
export { parseSavedVariables, type SavedValue } from './saved-variables'
export {
    allScenarios,
    chainFor,
    CHAIN_FIGHT,
    scenariosFor,
    SINGLE_FIGHTS,
    type Scenario,
} from './scenarios'
export { FIGHT_ITERATIONS, FIGHT_SEED, simSession, simSingle } from './session'
export { simCharacter, SUPPORTED, type SimOutcome } from './sim-character'
export { specOf, talentTrees } from './talents'
export {
    epTable,
    meanCI,
    simStatWeights,
    STAT_STEPS,
    WEIGHT_ITERATIONS,
    WEIGHT_SEEDS,
    type StatWeights,
} from './weights'
