import { type Mix, type Role, ROLES } from '../plans'

export const SHAPE_WIDTH = 350
export const SHAPE_HEIGHT = 300

const CENTER = { x: 175, y: 150 }
const MIN_RADIUS = 16
const MAX_RADIUS = 100
const DIRECTIONS: Record<Role, { x: number; y: number }> = {
    damage: { x: 0, y: -1 },
    survival: { x: 1, y: 0 },
    healing: { x: 0, y: 1 },
    utility: { x: -1, y: 0 },
}

export type ShapePoint = { x: number; y: number }

/** A role value, rounded to a whole step and capped by reach when supplied. */
export function clampRoleValue(value: number, reach: number | null): number {
    return Math.round(Math.min(reach ?? 100, Math.max(0, value)))
}

/** A point on its cardinal axis; zero stays grabbable just off the centre. */
export function rolePoint(role: Role, value: number): ShapePoint {
    const bounded = Math.min(100, Math.max(0, value))
    const distance = MIN_RADIUS + ((MAX_RADIUS - MIN_RADIUS) * bounded) / 100
    const direction = DIRECTIONS[role]
    return {
        x: CENTER.x + direction.x * distance,
        y: CENTER.y + direction.y * distance,
    }
}

/** The four role values as a closed SVG polygon, in cardinal order. */
export function rolePolygon(values: Readonly<Mix>): string {
    return `M${ROLES.map((role) => {
        const point = rolePoint(role, values[role])
        return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    }).join(' L')}Z`
}

/** The value at a point projected onto a role's axis, with its limits. */
export function roleValueAtPoint(
    role: Role,
    point: ShapePoint,
    reach: number | null
): number {
    const direction = DIRECTIONS[role]
    const along =
        (point.x - CENTER.x) * direction.x + (point.y - CENTER.y) * direction.y
    return clampRoleValue(
        ((along - MIN_RADIUS) / (MAX_RADIUS - MIN_RADIUS)) * 100,
        reach
    )
}
