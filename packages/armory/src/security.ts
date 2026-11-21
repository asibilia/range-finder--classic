export const REFERRER_POLICY = 'no-referrer'

export const ARMORY_CSP = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://wow.zamimg.com",
    "style-src 'self' 'unsafe-inline' https://wow.zamimg.com",
    "img-src 'self' data: https://wow.zamimg.com",
    "font-src 'self'",
    "connect-src 'self' https://nether.wowhead.com",
    "worker-src 'self' blob:",
].join('; ')

export const DEV_ARMORY_CSP = ARMORY_CSP.replace(
    "connect-src 'self'",
    "connect-src 'self' ws:"
)
