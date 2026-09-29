/**
 * The Turbo site's fixed copy.
 *
 * A placeholder until the site itself is built (the React Router + Vite app on
 * a Cloudflare Worker, like TMNB's). It holds the one line every page leads
 * with, so the package has real source to type-check and lint.
 */
export const site = {
    name: 'Turbo',
    pitch: 'Never clip a swing again. The Enhancement HUD for WoW: Forever.',
    credit: 'Made by the Turbo crew',
} as const
