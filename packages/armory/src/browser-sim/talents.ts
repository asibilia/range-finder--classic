/**
 * Talent trees, from the vendored `ui/sim/talents/trees/<class>.json`
 * (`pool.data('talents/<class>.json')`): which spec a build is, and the
 * results file's talents section.
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
        maxPoints: number
    }[]
}

export async function talentTrees(
    pool: SimPool,
    className: string
): Promise<TalentTree[]> {
    return (await pool.data(
        `talents/${className.toLowerCase()}.json`
    )) as TalentTree[]
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
