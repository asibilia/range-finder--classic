import {
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useId,
    useRef,
} from 'react'

import { isLive, type Mix, type Plan, type Role, ROLES } from '../plans'
import {
    clampRoleValue,
    rolePoint,
    rolePolygon,
    roleValueAtPoint,
    SHAPE_HEIGHT,
    SHAPE_WIDTH,
} from './role-shape-geometry'

const ROLE_LABELS: Record<Role, string> = {
    damage: 'Damage',
    survival: 'Survival',
    healing: 'Healing',
    utility: 'Utility',
}

const ROLE_COLORS: Record<Role, string> = {
    damage: 'var(--chart-1)',
    survival: 'var(--chart-4)',
    healing: 'var(--owned)',
    utility: 'var(--chart-3)',
}

const LABEL_POINTS: Record<Role, { x: number; y: number; anchor: 'middle' }> = {
    damage: { x: 175, y: 20, anchor: 'middle' },
    survival: { x: 315, y: 144, anchor: 'middle' },
    healing: { x: 175, y: 278, anchor: 'middle' },
    utility: { x: 35, y: 144, anchor: 'middle' },
}

function pointerValue(
    event: ReactPointerEvent<SVGGElement>,
    role: Role,
    reach: number | null
): number | null {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return null
    const bounds = svg.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    return roleValueAtPoint(
        role,
        {
            x: ((event.clientX - bounds.left) / bounds.width) * SHAPE_WIDTH,
            y: ((event.clientY - bounds.top) / bounds.height) * SHAPE_HEIGHT,
        },
        reach
    )
}

function ShapeHandle({
    role,
    value,
    live,
    reach,
    onChange,
}: {
    role: Role
    value: number
    live: boolean
    reach: number | null
    onChange: (role: Role, value: number) => void
}) {
    const dragging = useRef<number | null>(null)
    const descriptionId = useId()
    const point = rolePoint(role, value)
    const label = ROLE_LABELS[role]
    const valueText = live
        ? reach === null
            ? String(value)
            : `${value}, can reach up to ${reach} with this mix`
        : `Not simmed yet: no plan includes ${label.toLowerCase()}.`

    const move = (event: ReactPointerEvent<SVGGElement>) => {
        const next = pointerValue(event, role, reach)
        if (next !== null) onChange(role, next)
    }
    const stop = (event: ReactPointerEvent<SVGGElement>) => {
        if (dragging.current !== event.pointerId) return
        dragging.current = null
        if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const keyDown = (event: ReactKeyboardEvent<SVGGElement>) => {
        if (!live) return
        const step = event.shiftKey ? 20 : 5
        const values: Record<string, number> = {
            ArrowUp: value + step,
            ArrowRight: value + step,
            ArrowDown: value - step,
            ArrowLeft: value - step,
            PageUp: value + 20,
            PageDown: value - 20,
            Home: 0,
            End: reach ?? 100,
        }
        const next = values[event.key]
        if (next === undefined) return
        event.preventDefault()
        onChange(role, clampRoleValue(next, reach))
    }

    return (
        <g
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-valuetext={valueText}
            aria-orientation={
                role === 'damage' || role === 'healing'
                    ? 'vertical'
                    : 'horizontal'
            }
            aria-disabled={!live}
            aria-describedby={descriptionId}
            data-shape-role={role}
            data-disabled={!live || undefined}
            tabIndex={live ? 0 : -1}
            transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}
            className={
                live
                    ? 'group cursor-grab outline-none active:cursor-grabbing'
                    : 'cursor-not-allowed opacity-50 outline-none'
            }
            onPointerDown={(event) => {
                if (!live || event.button !== 0) return
                event.preventDefault()
                dragging.current = event.pointerId
                event.currentTarget.setPointerCapture(event.pointerId)
                event.currentTarget.focus({ preventScroll: true })
                move(event)
            }}
            onPointerMove={(event) => {
                if (!live || dragging.current !== event.pointerId) return
                event.preventDefault()
                move(event)
            }}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={() => {
                dragging.current = null
            }}
            onKeyDown={keyDown}
        >
            <desc id={descriptionId}>{valueText}</desc>
            <circle r={18} fill="transparent" />
            <circle
                r={8}
                fill={ROLE_COLORS[role]}
                stroke="var(--background)"
                strokeWidth={3}
            />
            <circle
                r={13}
                fill="none"
                stroke="var(--ring)"
                strokeWidth={2.5}
                className="stroke-transparent group-focus-visible:stroke-ring"
            />
        </g>
    )
}

/** The C2a four-axis view of the same role mix as the sliders. */
export function RoleShape({
    plans,
    mix,
    plan,
    onChange,
}: {
    plans: Plan[]
    mix: Mix
    plan: Plan | null
    onChange: (role: Role, value: number) => void
}) {
    const reach = plan?.reach ?? null
    return (
        <div>
            <p className="text-[0.8125rem] text-muted-foreground">
                Drag a point along its line, or focus it and use the arrow keys.
                {reach && ' The soft shape is as far as your items can reach.'}
            </p>
            <svg
                data-slot="role-shape"
                role="group"
                aria-label="Role shape"
                viewBox={`0 0 ${SHAPE_WIDTH} ${SHAPE_HEIGHT}`}
                className="mx-auto mt-1 block aspect-[7/6] w-full max-w-[350px] touch-none overflow-visible"
            >
                <path
                    data-slot="role-frame"
                    d={rolePolygon({
                        damage: 100,
                        survival: 100,
                        healing: 100,
                        utility: 100,
                    })}
                    fill="none"
                    stroke="var(--border-strong)"
                    strokeDasharray="3 5"
                />
                {ROLES.map((role) => {
                    const from = rolePoint(role, 0)
                    const to = rolePoint(role, 100)
                    return (
                        <line
                            key={role}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            stroke="var(--border-strong)"
                            strokeWidth={1.2}
                        />
                    )
                })}
                {reach && (
                    <path
                        data-slot="role-reach-polygon"
                        d={rolePolygon(reach)}
                        fill="var(--chart-3)"
                        fillOpacity={0.14}
                        stroke="var(--chart-3)"
                        strokeOpacity={0.7}
                        strokeWidth={1.2}
                        strokeLinejoin="round"
                        pointerEvents="none"
                    />
                )}
                <path
                    data-slot="role-current-polygon"
                    d={rolePolygon(mix)}
                    fill="var(--primary)"
                    fillOpacity={0.22}
                    stroke="var(--primary)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    pointerEvents="none"
                />
                {ROLES.map((role) => {
                    const label = LABEL_POINTS[role]
                    return (
                        <g
                            key={role}
                            aria-hidden="true"
                            pointerEvents="none"
                            className="text-[13px] tabular-nums"
                        >
                            <text
                                x={label.x}
                                y={label.y}
                                textAnchor={label.anchor}
                                fill={ROLE_COLORS[role]}
                                fontWeight={700}
                            >
                                {ROLE_LABELS[role]}
                            </text>
                            <text
                                x={label.x}
                                y={label.y + 16}
                                textAnchor={label.anchor}
                                fill="var(--foreground)"
                            >
                                {mix[role]}
                            </text>
                        </g>
                    )
                })}
                {ROLES.map((role) => (
                    <ShapeHandle
                        key={role}
                        role={role}
                        value={mix[role]}
                        live={isLive(plans, role)}
                        reach={reach?.[role] ?? null}
                        onChange={onChange}
                    />
                ))}
            </svg>
            <ul
                aria-hidden="true"
                className="mt-1 grid grid-cols-2 gap-x-3 border-t pt-1.5 text-[0.8125rem] min-[25rem]:grid-cols-4"
            >
                {ROLES.map((role) => {
                    const live = isLive(plans, role)
                    const cap = reach?.[role] ?? null
                    return (
                        <li key={role} className="min-w-0">
                            <div className="flex justify-between gap-1">
                                <span style={{ color: ROLE_COLORS[role] }}>
                                    {ROLE_LABELS[role]}
                                </span>
                                <b className="font-normal tabular-nums">
                                    {mix[role]}
                                </b>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {!live
                                    ? 'Not simmed yet'
                                    : cap === null
                                      ? null
                                      : cap >= 100
                                        ? 'No limit'
                                        : `Can reach ${cap}`}
                            </div>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
