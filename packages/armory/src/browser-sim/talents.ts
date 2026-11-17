/**
 * Talent trees, from the vendored `ui/sim/talents/trees/<class>.json`
 * (`pool.data('talents/<class>.json')`): which spec a build is, the
 * results file's talents section, and the Enhancement talents the request
 * and the sanity gates read or move in a talent string.
 */
import type { SimPool } from '@goturbo/sim'

import type { ResultsFile } from '../results-file'

export type TalentTree = {
    name: string
    talents: {
        fieldName: string
        fancyName: string
        location: { rowIdx: number; colIdx: number }
        spellId: number
        /** The game's trait definition, as an export names it. */
        definitionId?: number
        maxPoints: number
    }[]
}

/** A class's talent trees: none for a class the sim has no trees for. */
export async function talentTrees(
    pool: SimPool,
    className: string
): Promise<TalentTree[]> {
    try {
        return (await pool.data(
            `talents/${className.toLowerCase()}.json`
        )) as TalentTree[]
    } catch {
        return []
    }
}

/** The ranks in each tree of a talent string, in the trees' order. */
export function treeRanks(talents: string, trees: TalentTree[]): number[][] {
    const parts = talents.split('-')
    return trees.map((tree, i) =>
        tree.talents.map((_, j) => Number(parts[i]?.[j] ?? 0) || 0)
    )
}

/** The spec: the tree with the most points, the first one on a tie. */
export function specOf(talents: string, trees: TalentTree[]): string {
    const points = treeRanks(talents, trees).map((ranks) =>
        ranks.reduce((sum, rank) => sum + rank, 0)
    )
    let best = 0
    points.forEach((p, i) => {
        if (p > points[best]!) best = i
    })
    return trees[best]?.name ?? ''
}

/** A talent's rank in the build, by its field name; 0 when not taken. */
export function talentRank(
    talents: string,
    trees: TalentTree[],
    fieldName: string
): number {
    const ranks = treeRanks(talents, trees)
    for (const [i, tree] of trees.entries()) {
        const j = tree.talents.findIndex((t) => t.fieldName === fieldName)
        if (j >= 0) return ranks[i]![j]!
    }
    return 0
}

/** Enhancement's place among a Shaman's trees, and its talent count. */
const ENHANCEMENT = { tree: 1, size: 18 }

/**
 * The Enhancement talents the request and the sanity gates read or move,
 * by their place in Enhancement's part of a Shaman talent string: the
 * vendored `talents/shaman.json`'s order, keyed by its field names.
 */
const ENHANCEMENT_TALENTS = {
    mentalDexterity: 4,
    anticipation: 8,
    stormstrike: 11,
    improvedStormstrike: 15,
} as const

/** Enhancement's ranks in a talent string, one per talent. */
function enhancementRanks(talents: string): number[] {
    const tree = talents.split('-')[ENHANCEMENT.tree] ?? ''
    return Array.from(
        { length: ENHANCEMENT.size },
        (_, i) => Number(tree[i] ?? 0) || 0
    )
}

/** The talent string with Enhancement's ranks replaced. */
function withEnhancement(talents: string, ranks: number[]): string {
    const trees = talents.split('-')
    while (trees.length <= ENHANCEMENT.tree) trees.push('')
    trees[ENHANCEMENT.tree] = ranks.join('').replace(/0+$/, '')
    return trees.join('-')
}

/** True when the talent string takes Stormstrike. */
export function hasStormstrike(talents: string): boolean {
    return enhancementRanks(talents)[ENHANCEMENT_TALENTS.stormstrike]! > 0
}

/**
 * The Stormstrike gate's two builds, as the runner's `sanityChecks` makes
 * them: without Improved Stormstrike, and with it (when the build has
 * none, a point moved in from Anticipation, else from the first ranked
 * talent but Mental Dexterity and Stormstrike). A build without
 * Stormstrike gets it in both, for the check only, so the check measures
 * the reset rather than a spell the build never casts.
 */
export function stormstrikeVariants(talents: string): {
    without: string
    withIt: string
    /** Points in Improved Stormstrike in `withIt`. */
    points: number
    /** The build has no Stormstrike: both variants got it. */
    addedStormstrike: boolean
} {
    const { mentalDexterity, anticipation, stormstrike, improvedStormstrike } =
        ENHANCEMENT_TALENTS
    const ranks = enhancementRanks(talents)
    const addedStormstrike = ranks[stormstrike] === 0
    if (addedStormstrike) ranks[stormstrike] = 1
    const withIt = [...ranks]
    if (withIt[improvedStormstrike] === 0) {
        const from =
            withIt[anticipation]! > 0
                ? anticipation
                : withIt.findIndex(
                      (rank, i) =>
                          rank > 0 && i !== stormstrike && i !== mentalDexterity
                  )
        if (from >= 0) withIt[from] = withIt[from]! - 1
        withIt[improvedStormstrike] = 1
    }
    const without = ranks.map((rank, i) =>
        i === improvedStormstrike ? 0 : rank
    )
    return {
        without: withEnhancement(talents, without),
        withIt: withEnhancement(talents, withIt),
        points: withIt[improvedStormstrike]!,
        addedStormstrike,
    }
}

/** The results file's talents: the spec's tree, every talent in it. */
export function talentsSection(
    talents: string,
    trees: TalentTree[],
    spec: string
): ResultsFile['talents'] {
    const at = Math.max(
        0,
        trees.findIndex((tree) => tree.name === spec)
    )
    const tree = trees[at]!
    const ranks = treeRanks(talents, trees)[at]!
    const yours = tree.talents.map((t, j) => ({
        talent_id: t.spellId,
        name: t.fancyName,
        tier: t.location.rowIdx + 1,
        column: t.location.colIdx + 1,
        rank: Math.min(ranks[j]!, t.maxPoints),
        max_rank: t.maxPoints,
    }))
    return {
        tree: tree.name,
        points: yours.reduce((sum, t) => sum + t.rank, 0),
        yours,
        best: null,
    }
}
