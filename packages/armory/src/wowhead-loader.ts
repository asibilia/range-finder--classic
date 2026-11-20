export const WOWHEAD_SCRIPT_URL = 'https://wow.zamimg.com/js/tooltips.js'

export type WowheadPower = {
    refreshLinks: () => void
}

export type WowheadLoader = () => Promise<WowheadPower>

declare global {
    interface Window {
        $WowheadPower?: WowheadPower
        whTooltips?: {
            colorLinks: boolean
            iconizeLinks: boolean
            renameLinks: boolean
        }
    }
}

export function loadWowheadScript(timeoutMs = 10_000): Promise<WowheadPower> {
    if (window.$WowheadPower) return Promise.resolve(window.$WowheadPower)
    if (navigator.onLine === false)
        return Promise.reject(new Error('Wowhead is unavailable offline.'))

    return new Promise((resolve, reject) => {
        const script = document.createElement('script')
        let settled = false
        const timeout = window.setTimeout(() => {
            finish(new Error('Loading Wowhead timed out.'))
        }, timeoutMs)

        const finish = (error: Error | null) => {
            if (settled) return
            settled = true
            window.clearTimeout(timeout)
            script.onload = null
            script.onerror = null
            if (error) {
                script.remove()
                reject(error)
            } else if (window.$WowheadPower) {
                resolve(window.$WowheadPower)
            } else {
                script.remove()
                reject(new Error('Wowhead did not expose its tooltip script.'))
            }
        }

        window.whTooltips = {
            colorLinks: false,
            iconizeLinks: false,
            renameLinks: false,
        }
        script.src = WOWHEAD_SCRIPT_URL
        script.async = true
        script.referrerPolicy = 'no-referrer'
        script.onload = () => finish(null)
        script.onerror = () => finish(new Error('Wowhead could not be loaded.'))
        document.head.append(script)
    })
}
