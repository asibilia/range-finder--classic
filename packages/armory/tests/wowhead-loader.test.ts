import './dom'

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import { loadWowheadScript } from '../src/wowhead-loader'

let scripts: HTMLScriptElement[] = []
let append: typeof document.head.append

beforeEach(() => {
    scripts = []
    append = document.head.append
    document.head.append = mock((...nodes: (Node | string)[]) => {
        for (const node of nodes)
            if (node instanceof HTMLScriptElement) scripts.push(node)
    }) as typeof document.head.append
})

afterEach(() => {
    document.head.append = append
    delete window.$WowheadPower
    delete window.whTooltips
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value: true,
    })
})

describe('the official Wowhead script loader', () => {
    test('does not insert a script while offline', async () => {
        Object.defineProperty(window.navigator, 'onLine', {
            configurable: true,
            value: false,
        })

        await expect(loadWowheadScript()).rejects.toThrow('offline')
        expect(scripts).toHaveLength(0)
    })

    test('uses only the official script, no-referrer and local-name settings', async () => {
        const power = { refreshLinks: mock(() => {}) }
        const loading = loadWowheadScript()
        const script = scripts[0]!

        expect(scripts).toHaveLength(1)
        expect(script.src).toBe('https://wow.zamimg.com/js/tooltips.js')
        expect(script.referrerPolicy).toBe('no-referrer')
        expect(script.async).toBe(true)
        expect(window.whTooltips).toEqual({
            colorLinks: false,
            iconizeLinks: false,
            renameLinks: false,
        })

        window.$WowheadPower = power
        script.dispatchEvent(new Event('load'))
        await expect(loading).resolves.toBe(power)
    })

    test('a script error removes the tag and rejects', async () => {
        const loading = loadWowheadScript()
        scripts[0]!.dispatchEvent(new Event('error'))

        await expect(loading).rejects.toThrow('could not be loaded')
        expect(scripts[0]!.isConnected).toBe(false)
    })

    test('a stalled script times out once and is removed', async () => {
        await expect(loadWowheadScript(1)).rejects.toThrow('timed out')
        expect(scripts[0]!.isConnected).toBe(false)
    })

    test('deduplicates concurrent loads to one script tag and retries fresh after failure', async () => {
        const first = loadWowheadScript()
        const second = loadWowheadScript()

        expect(first).toBe(second)
        expect(scripts).toHaveLength(1)

        scripts[0]!.dispatchEvent(new Event('error'))
        await expect(first).rejects.toThrow('could not be loaded')
        await expect(second).rejects.toThrow('could not be loaded')

        const power = { refreshLinks: mock(() => {}) }
        const retryFirst = loadWowheadScript()
        const retrySecond = loadWowheadScript()
        expect(retryFirst).toBe(retrySecond)
        expect(retryFirst).not.toBe(first)
        expect(scripts).toHaveLength(2)

        window.$WowheadPower = power
        scripts[1]!.dispatchEvent(new Event('load'))
        await expect(Promise.all([retryFirst, retrySecond])).resolves.toEqual([
            power,
            power,
        ])
    })
})
