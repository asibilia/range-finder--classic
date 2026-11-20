import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { useWowhead } from './wowhead'

function showTooltip(anchor: HTMLAnchorElement) {
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
}

function hideTooltip(anchor: HTMLAnchorElement) {
    anchor.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
}

export function ItemLink({
    itemId,
    name,
    allowTooltip = true,
    className,
}: {
    itemId: number
    name: string
    allowTooltip?: boolean
    className?: string
}) {
    const { status, refresh } = useWowhead()
    const rich = allowTooltip && status === 'ready'
    const touch = useRef(false)
    const tapShown = useRef(false)
    const presented = useRef(false)

    useEffect(() => {
        if (rich) refresh()
    }, [itemId, name, refresh, rich])

    return (
        <a
            href={`https://www.wowhead.com/forever/item=${itemId}`}
            data-wowhead={
                allowTooltip ? `item=${itemId}&domain=forever` : undefined
            }
            data-wh-rename-link={allowTooltip ? 'false' : undefined}
            target="_blank"
            rel="noreferrer"
            className={cn(
                'rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
                className
            )}
            onMouseEnter={() => {
                if (rich) presented.current = true
            }}
            onMouseLeave={(event) => {
                if (document.activeElement !== event.currentTarget)
                    presented.current = false
            }}
            onFocus={(event) => {
                if (!rich) return
                presented.current = true
                showTooltip(event.currentTarget)
            }}
            onBlur={(event) => {
                if (rich) hideTooltip(event.currentTarget)
                presented.current = false
                tapShown.current = false
                touch.current = false
            }}
            onPointerDown={(event) => {
                touch.current = event.pointerType === 'touch'
            }}
            onClick={(event) => {
                if (!rich || !touch.current) return
                touch.current = false
                if (!tapShown.current) {
                    event.preventDefault()
                    tapShown.current = true
                    presented.current = true
                    const anchor = event.currentTarget
                    showTooltip(anchor)
                    // Wowhead emits one more mouseout after a touch click.
                    window.setTimeout(() => {
                        if (tapShown.current && presented.current)
                            showTooltip(anchor)
                    }, 0)
                }
            }}
            onKeyDown={(event) => {
                if (!rich || event.key !== 'Escape' || !presented.current)
                    return
                event.preventDefault()
                event.stopPropagation()
                presented.current = false
                tapShown.current = false
                hideTooltip(event.currentTarget)
            }}
        >
            {name}
        </a>
    )
}
