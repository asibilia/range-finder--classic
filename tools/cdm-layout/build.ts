/**
 * Print Turbo's Cooldown Manager import string.
 *
 *   bun tools/cdm-layout/build.ts
 */

import { encodeLayoutString } from './codec'
import { buildTurboLayout } from './turbo-layout'

console.log(encodeLayoutString(buildTurboLayout()))
