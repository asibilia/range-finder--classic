import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'

import { Button } from '@/components/ui/button'

import {
    loadWowheadScript,
    type WowheadLoader,
    type WowheadPower,
} from '../wowhead-loader'

type Status = 'off' | 'loading' | 'ready' | 'error'

type WowheadContextValue = {
    status: Status
    enable: () => void
    refresh: () => void
}

const WowheadContext = createContext<WowheadContextValue>({
    status: 'off',
    enable: () => {},
    refresh: () => {},
})

export function WowheadProvider({
    loadScript = loadWowheadScript,
    children,
}: {
    loadScript?: WowheadLoader
    children: ReactNode
}) {
    const [status, setStatus] = useState<Status>('off')
    const power = useRef<WowheadPower | null>(null)
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (status !== 'loading') return
        let current = true
        loadScript().then(
            (loaded) => {
                if (!current) return
                power.current = loaded
                setStatus('ready')
            },
            () => {
                if (!current) return
                power.current = null
                setStatus('error')
            }
        )
        return () => {
            current = false
        }
    }, [loadScript, status])

    useEffect(
        () => () => {
            if (refreshTimer.current !== null)
                clearTimeout(refreshTimer.current)
        },
        []
    )

    const enable = useCallback(() => {
        setStatus((current) =>
            current === 'off' || current === 'error' ? 'loading' : current
        )
    }, [])

    const refresh = useCallback(() => {
        if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
        refreshTimer.current = setTimeout(() => {
            refreshTimer.current = null
            power.current?.refreshLinks()
        }, 0)
    }, [])

    return (
        <WowheadContext.Provider value={{ status, enable, refresh }}>
            {children}
        </WowheadContext.Provider>
    )
}

export function useWowhead() {
    return useContext(WowheadContext)
}

export function WowheadOptIn() {
    const { status, enable } = useWowhead()
    const ready = status === 'ready'
    const loading = status === 'loading'
    return (
        <section
            aria-label="Optional Wowhead tooltips"
            data-wowhead-opt-in
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground"
        >
            <Button
                variant="outline"
                size="sm"
                disabled={ready || loading}
                onClick={enable}
            >
                {ready
                    ? 'Wowhead tooltips enabled'
                    : status === 'error'
                      ? 'Try Wowhead tooltips again'
                      : loading
                        ? 'Loading Wowhead tooltips'
                        : 'Enable Wowhead tooltips'}
            </Button>
            <p aria-live="polite" className="max-w-3xl">
                {ready
                    ? 'Wowhead Forever tooltips are on. Local names, sources and sim values stay authoritative.'
                    : status === 'error'
                      ? 'Wowhead tooltips could not load. Check your connection; local item details still work.'
                      : loading
                        ? 'Loading the official Wowhead script.'
                        : 'Optional Wowhead Forever tooltips. Enabling loads Wowhead’s script in this page and tells Wowhead you visited and which item IDs you inspect. The script can access this page and its kept results file. Local names, sources and sim values stay unchanged.'}
            </p>
        </section>
    )
}
