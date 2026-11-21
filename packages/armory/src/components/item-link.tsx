import { useCallback, useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

import { useWowhead } from './wowhead'

let activeTap: HTMLAnchorElement | null = null

function showTooltip(anchor: HTMLAnchorElement) {
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
}

function hideTooltip(anchor: HTMLAnchorElement) {
    if (anchor.isConnected) {
        anchor.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
        return
    }
    document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
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
    const presented = useRef(false)
    const anchorRef = useRef<HTMLAnchorElement | null>(null)

    const setAnchorRef = useCallback((node: HTMLAnchorElement | null) => {
        anchorRef.current = node
        if (!node) return
        return () => {
            if (presented.current) hideTooltip(node)
            presented.current = false
            touch.current = false
            if (activeTap === node) activeTap = null
            anchorRef.current = null
        }
    }, [])

    useEffect(() => {
        if (activeTap && activeTap === anchorRef.current) activeTap = null
        if (rich) refresh()
    }, [itemId, name, refresh, rich])

    return (
        <a
            ref={setAnchorRef}
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
            onMouseEnter={(event) => {
                if (!rich) return
                if (activeTap && activeTap !== event.currentTarget)
                    activeTap = null
                presented.current = true
            }}
            onMouseLeave={(event) => {
                if (document.activeElement !== event.currentTarget)
                    presented.current = false
            }}
            onFocus={(event) => {
                if (!rich) return
                if (activeTap && activeTap !== event.currentTarget)
                    activeTap = null
                presented.current = true
                showTooltip(event.currentTarget)
            }}
            onBlur={(event) => {
                if (rich) hideTooltip(event.currentTarget)
                presented.current = false
                if (activeTap === event.currentTarget) activeTap = null
                touch.current = false
            }}
            onPointerDown={(event) => {
                touch.current = event.pointerType === 'touch'
            }}
            onPointerCancel={() => {
                touch.current = false
            }}
            onClick={(event) => {
                if (!rich || !touch.current) return
                touch.current = false
                const anchor = event.currentTarget
                if (activeTap !== anchor) {
                    event.preventDefault()
                    activeTap = anchor
                    presented.current = true
                    showTooltip(anchor)
                    // Wowhead emits one more mouseout after a touch click.
                    window.setTimeout(() => {
                        if (activeTap === anchor && presented.current)
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
                if (activeTap === event.currentTarget) activeTap = null
                hideTooltip(event.currentTarget)
            }}
        >
            {name}
        </a>
    )
}
