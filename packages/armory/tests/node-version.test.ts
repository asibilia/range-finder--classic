/**
 * The build test runs React Router's command line, which runs under Node and
 * needs Node 22.22 or newer. Before it builds, it reads `node --version` and
 * stops with one clear message when Node is missing or too old. These check
 * that reading and comparing without swapping the real Node.
 */
import { describe, expect, test } from 'bun:test'

import { MINIMUM_NODE, nodeVersionProblem } from './node-version'

const message = (found: string) =>
    `this test builds the page and needs Node 22.22 or newer; found ${found}`

describe('nodeVersionProblem', () => {
    test('the minimum is 22.22.0, the root package.json engines value', async () => {
        expect(MINIMUM_NODE).toBe('22.22.0')
        const root = (await Bun.file(
            new URL('../../../package.json', import.meta.url)
        ).json()) as { engines?: { node?: string } }
        expect(root.engines?.node).toBe(`>=${MINIMUM_NODE}`)
    })

    test('no problem at or above 22.22', () => {
        for (const version of [
            'v22.22.0',
            'v22.22.1',
            'v22.30.0',
            'v24.0.0',
            'v25.6.0\n',
        ])
            expect(nodeVersionProblem(version)).toBeNull()
    })

    test('too old: says so with the version found', () => {
        expect(nodeVersionProblem('v20.11.1')).toBe(message('v20.11.1'))
        expect(nodeVersionProblem('v22.21.9')).toBe(message('v22.21.9'))
        expect(nodeVersionProblem('v22.9.0\n')).toBe(message('v22.9.0'))
    })

    test('no node: says "no node"', () => {
        expect(nodeVersionProblem(null)).toBe(message('no node'))
    })

    test('output that is not a version counts as too old, shown as found', () => {
        expect(nodeVersionProblem('bun 1.4.3')).toBe(message('bun 1.4.3'))
        expect(nodeVersionProblem('')).toBe(message('no node'))
    })
})
