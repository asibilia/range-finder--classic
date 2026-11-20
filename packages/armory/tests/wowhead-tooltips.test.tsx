import './dom'
import { openFile, openSample, variant, type Json, type User } from './open-app'
import { entry, huntingPants, keepAllWorn } from './gear-card'

import { afterEach, describe, expect, mock, test } from 'bun:test'
import {
    cleanup,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react'

import type { WowheadLoader } from '../src/wowhead-loader'

function goGetFile(): Json {
    return variant((file) => {
        file.bag_upgrades = []
        keepAllWorn(file)
        huntingPants(file)
        const legs = entry(file, 'legs').alternatives.find(
            (alternative) => alternative.item.item_id === 6690
        )
        legs!.item.data = 'forever'
    })
}

function fakeOfficialScript() {
    const tooltip = () =>
        document.querySelector<HTMLElement>('[data-test-wowhead-tooltip]')
    const hide = () => tooltip()?.remove()
    const show = (event: Event) => {
        const anchor = (event.target as Element).closest?.('a[data-wowhead]')
        if (!anchor) return
        hide()
        const element = document.createElement('div')
        element.className = 'wowhead-tooltip'
        element.dataset.testWowheadTooltip = ''
        element.textContent = anchor
            .getAttribute('data-wowhead')!
            .includes('item=999999')
            ? 'Item Not Found'
            : `Wowhead Forever: ${anchor.textContent}`
        document.body.append(element)
    }
    const over = (event: Event) => show(event)
    const out = () => hide()
    const refreshLinks = mock(() => {})
    const load = mock(async () => {
        document.addEventListener('mouseover', over)
        document.addEventListener('mouseout', out)
        return { refreshLinks }
    }) satisfies WowheadLoader
    return {
        load,
        refreshLinks,
        tooltip,
        close() {
            document.removeEventListener('mouseover', over)
            document.removeEventListener('mouseout', out)
            hide()
        },
    }
}

let fake: ReturnType<typeof fakeOfficialScript> | null = null

afterEach(() => {
    fake?.close()
    fake = null
    cleanup()
    localStorage.clear()
})

async function enable(user: User) {
    await user.click(
        screen.getByRole('button', { name: 'Enable Wowhead tooltips' })
    )
    await screen.findByRole('button', { name: 'Wowhead tooltips enabled' })
}

describe('Wowhead opt-in and item links', () => {
    test('loads nothing before opt-in, then refreshes dynamic React links without storing a choice', async () => {
        fake = fakeOfficialScript()
        const user = await openSample(undefined, fake.load)
        const slot = screen.getByRole('link', {
            name: "Brawler's Leather Hood",
        })

        expect(fake.load).toHaveBeenCalledTimes(0)
        expect(document.querySelector('script[src*="wowhead"]')).toBeNull()
        expect(slot.getAttribute('href')).toBe(
            'https://www.wowhead.com/forever/item=252504'
        )
        expect(slot.getAttribute('data-wowhead')).toBe(
            'item=252504&domain=forever'
        )
        expect(slot.getAttribute('target')).toBe('_blank')
        expect(slot.getAttribute('rel')).toBe('noreferrer')
        const classic = screen.getByRole('link', { name: 'Berylline Pads' })
        expect(classic.getAttribute('data-wowhead')).toBeNull()
        expect(classic.getAttribute('href')).toBe(
            'https://www.wowhead.com/forever/item=4251'
        )
        expect(localStorage.length).toBe(0)
        const footer = document.querySelector('footer')!
        expect(
            within(footer).queryByRole('link', { name: 'Wowhead Forever' })
        ).toBeNull()

        await enable(user)
        expect(fake.load).toHaveBeenCalledTimes(1)
        await waitFor(() =>
            expect(fake!.refreshLinks.mock.calls.length).toBeGreaterThan(0)
        )
        const creditLink = within(footer).getByRole('link', {
            name: 'Wowhead Forever',
        })
        expect(creditLink.getAttribute('href')).toBe(
            'https://www.wowhead.com/forever'
        )
        expect(creditLink.getAttribute('target')).toBe('_blank')
        expect(creditLink.getAttribute('rel')).toBe('noreferrer')
        expect(footer.textContent).toContain('WoWSims Forever')
        expect(footer.textContent).toContain('not affiliated or endorsed')
        expect(localStorage.length).toBe(0)
    })

    test('slot, next-step, picker and wishlist names share the seam and primary actions still work', async () => {
        fake = fakeOfficialScript()
        const user = await openFile(goGetFile(), 'Truncha', fake.load)
        await enable(user)

        expect(
            screen.getByRole('link', { name: "Brawler's Leather Hood" }).tagName
        ).toBe('A')
        expect(
            screen.getByRole('link', { name: 'Hunting Pants' }).tagName
        ).toBe('A')

        const refreshed = fake.refreshLinks.mock.calls.length
        await user.click(screen.getByRole('button', { name: 'Other options' }))
        const picker = screen.getByRole('dialog', { name: 'Legs' })
        expect(
            within(picker).getByRole('link', { name: 'Hunting Pants' })
        ).toBeDefined()
        await waitFor(() =>
            expect(fake!.refreshLinks.mock.calls.length).toBeGreaterThan(
                refreshed
            )
        )

        const huntingRow = within(picker)
            .getByRole('link', { name: 'Hunting Pants' })
            .closest('li')!
        await user.click(
            within(huntingRow).getByRole('button', { name: 'Add to wishlist' })
        )
        await user.click(within(picker).getByRole('button', { name: 'Close' }))
        await user.click(screen.getByRole('button', { name: 'Wishlist 1' }))
        const wishlist = screen.getByRole('dialog', { name: 'Wishlist' })
        expect(
            within(wishlist).getByRole('link', { name: 'Hunting Pants' })
        ).toBeDefined()
        expect(wishlist.textContent).toContain(
            'Vendor: Harggan, The Hinterlands'
        )
    })

    test('hover, focus, tap and Escape work inside a dialog without closing it', async () => {
        fake = fakeOfficialScript()
        const user = await openFile(goGetFile(), 'Truncha', fake.load)
        await enable(user)
        const opener = screen.getByRole('button', { name: 'Other options' })
        await user.click(opener)
        const dialog = screen.getByRole('dialog', { name: 'Legs' })
        const link = within(dialog).getByRole('link', {
            name: 'Hunting Pants',
        })

        await user.hover(link)
        expect(fake.tooltip()?.textContent).toBe(
            'Wowhead Forever: Hunting Pants'
        )
        await user.unhover(link)
        expect(fake.tooltip()).toBeNull()

        link.focus()
        expect(fake.tooltip()).not.toBeNull()
        fireEvent.keyDown(link, { key: 'Escape' })
        expect(fake.tooltip()).toBeNull()
        expect(screen.getByRole('dialog', { name: 'Legs' })).toBe(dialog)
        expect(document.activeElement).toBe(link)
        expect(dialog.contains(document.activeElement)).toBe(true)

        fireEvent.pointerDown(link, { pointerType: 'touch' })
        expect(fireEvent.click(link)).toBe(false)
        expect(fake.tooltip()).not.toBeNull()
        expect(screen.getByRole('dialog', { name: 'Legs' })).toBe(dialog)
        link.removeAttribute('href')
        fireEvent.pointerDown(link, { pointerType: 'touch' })
        expect(fireEvent.click(link)).toBe(true)

        fireEvent.keyDown(link, { key: 'Escape' })
        await user.keyboard('{Escape}')
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Legs' })).toBeNull()
        )
        expect(document.activeElement).toBe(opener)
    })

    test('unknown IDs keep local content and loader failures do not retry automatically', async () => {
        fake = fakeOfficialScript()
        const data = variant((file) => {
            const worn = entry(file, 'head').worn!
            worn.item_id = 999999
            worn.name = 'Made-up Local Helm'
            worn.source = { kind: 'unknown', text: 'Local source unknown' }
            worn.data = 'forever'
            entry(file, 'head').alternatives[0]!.item.source = {
                kind: 'unknown',
                text: 'Local source unknown',
            }
        })
        const user = await openFile(data, 'Truncha', fake.load)
        await enable(user)
        const link = screen.getByRole('link', { name: 'Made-up Local Helm' })

        link.focus()
        expect(fake.tooltip()?.textContent).toBe('Item Not Found')
        expect(link.textContent).toBe('Made-up Local Helm')
        fireEvent.keyDown(link, { key: 'Escape' })
        await user.click(screen.getByRole('button', { name: /^Head: / }))
        expect(
            screen.getByRole('dialog', { name: 'Head' }).textContent
        ).toContain('Local source unknown')
        cleanup()
        fake.close()
        fake = null
        localStorage.clear()

        const failing = mock(async () => {
            throw new Error('offline')
        }) satisfies WowheadLoader
        const failureUser = await openSample(undefined, failing)
        await failureUser.click(
            screen.getByRole('button', { name: 'Enable Wowhead tooltips' })
        )
        await screen.findByText(/Wowhead tooltips could not load/)
        expect(failing).toHaveBeenCalledTimes(1)
        expect(
            screen.getByRole('link', { name: "Brawler's Leather Hood" })
                .textContent
        ).toBe("Brawler's Leather Hood")
    })

    test('touch switching A -> B -> A, pointerCancel, and hover unmount cleanup behave safely', async () => {
        fake = fakeOfficialScript()
        const user = await openFile(goGetFile(), 'Truncha', fake.load)
        await enable(user)

        const linkA = screen.getByRole('link', {
            name: "Brawler's Leather Hood",
        })
        const linkB = screen.getByRole('link', { name: 'Hunting Pants' })

        // Touch-switching A -> B -> A shows A's tooltip on return instead of navigating.
        fireEvent.pointerDown(linkA, { pointerType: 'touch' })
        expect(fireEvent.click(linkA)).toBe(false)
        expect(fake.tooltip()?.textContent).toBe(
            "Wowhead Forever: Brawler's Leather Hood"
        )

        fireEvent.pointerDown(linkB, { pointerType: 'touch' })
        expect(fireEvent.click(linkB)).toBe(false)
        expect(fake.tooltip()?.textContent).toBe(
            'Wowhead Forever: Hunting Pants'
        )

        fireEvent.pointerDown(linkA, { pointerType: 'touch' })
        expect(fireEvent.click(linkA)).toBe(false)
        expect(fake.tooltip()?.textContent).toBe(
            "Wowhead Forever: Brawler's Leather Hood"
        )

        // Cancelled touch does not hijack a subsequent non-touch click.
        linkA.removeAttribute('href')
        fireEvent.pointerDown(linkA, { pointerType: 'touch' })
        fireEvent.pointerCancel(linkA)
        expect(fireEvent.click(linkA)).toBe(true)

        // Hovering inside a dialog without focus and closing via Escape removes the tooltip.
        await user.click(screen.getByRole('button', { name: 'Other options' }))
        const dialog = screen.getByRole('dialog', { name: 'Legs' })
        const dialogLink = within(dialog).getByRole('link', {
            name: 'Hunting Pants',
        })
        await user.hover(dialogLink)
        expect(fake.tooltip()?.textContent).toBe(
            'Wowhead Forever: Hunting Pants'
        )

        await user.keyboard('{Escape}')
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Legs' })).toBeNull()
        )
        expect(fake.tooltip()).toBeNull()
    })
})
