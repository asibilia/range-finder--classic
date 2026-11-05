/**
 * Encode and decode Cooldown Manager layout strings, the way the game does.
 *
 * Mirrors `CooldownViewerSettingsDataStoreSerialization.lua` (encoding
 * version 1): `<encodingVersion>|base64(rawDeflate(CBOR(dataTable)))`.
 *
 * Lua strings are bytes, so strings go out as CBOR byte strings (major type
 * 2), as in the game's own exports; text strings are accepted on decode.
 * Lua tables are modelled as JS arrays (a 1..n sequence) or `Map`s (any
 * other keys). Like the game's `C_EncodingUtil.SerializeCBOR`, a table whose
 * keys are exactly 1..n (or that is empty) is written as a CBOR array, and
 * anything else as a CBOR map with integer keys.
 */

export type LuaKey = number | string
export type LuaValue =
    number | string | boolean | LuaValue[] | Map<LuaKey, LuaValue>

export const ENCODING_VERSION = 1
const DELIMITER = '|'

const header = (major: number, n: number): number[] => {
    const m = major << 5
    if (n < 24) return [m | n]
    if (n < 0x100) return [m | 24, n]
    if (n < 0x10000) return [m | 25, n >> 8, n & 0xff]
    if (n < 0x100000000)
        return [m | 26, n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
    throw new Error(`CBOR length/int too large: ${n}`)
}

/** Keys 1..n with no gaps: the Lua "sequence" the game writes as an array. */
const sequenceValues = (map: Map<LuaKey, LuaValue>): LuaValue[] | null => {
    for (let i = 1; i <= map.size; i++) if (!map.has(i)) return null
    return Array.from({ length: map.size }, (_, i) => map.get(i + 1)!)
}

const compareKeys = (a: LuaKey, b: LuaKey): number => {
    if (typeof a === 'number' && typeof b === 'number') return a - b
    if (typeof a === 'number') return -1
    if (typeof b === 'number') return 1
    return a < b ? -1 : a > b ? 1 : 0
}

const encodeInto = (out: number[], value: LuaValue): void => {
    if (typeof value === 'boolean') {
        out.push(value ? 0xf5 : 0xf4)
    } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
            out.push(...(value >= 0 ? header(0, value) : header(1, -1 - value)))
        } else {
            const buf = new DataView(new ArrayBuffer(8))
            buf.setFloat64(0, value)
            out.push(0xfb, ...new Uint8Array(buf.buffer))
        }
    } else if (typeof value === 'string') {
        const bytes = new TextEncoder().encode(value)
        out.push(...header(2, bytes.length), ...bytes)
    } else if (Array.isArray(value)) {
        out.push(...header(4, value.length))
        value.forEach((v) => encodeInto(out, v))
    } else {
        const seq = sequenceValues(value)
        if (seq) return encodeInto(out, seq)
        const keys = [...value.keys()].sort(compareKeys)
        out.push(...header(5, keys.length))
        keys.forEach((k) => {
            encodeInto(out, k)
            encodeInto(out, value.get(k)!)
        })
    }
}

/** Serialize a Lua-shaped value to CBOR bytes. */
export const encodeCbor = (value: LuaValue): Uint8Array<ArrayBuffer> => {
    const out: number[] = []
    encodeInto(out, value)
    return Uint8Array.from(out)
}

/** Parse CBOR bytes into arrays (CBOR arrays) and Maps (CBOR maps). */
export const decodeCbor = (bytes: Uint8Array): LuaValue => {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
    let pos = 0

    const readArg = (info: number): number => {
        if (info < 24) return info
        if (info === 24) return bytes[pos++]
        if (info === 25) return ((pos += 2), view.getUint16(pos - 2))
        if (info === 26) return ((pos += 4), view.getUint32(pos - 4))
        if (info === 27) return ((pos += 8), Number(view.getBigUint64(pos - 8)))
        throw new Error(`Unsupported CBOR additional info ${info}`)
    }

    const read = (): LuaValue => {
        const initial = bytes[pos++]
        const major = initial >> 5
        const info = initial & 0x1f
        switch (major) {
            case 0:
                return readArg(info)
            case 1:
                return -1 - readArg(info)
            case 2:
            case 3: {
                const len = readArg(info)
                pos += len
                return new TextDecoder().decode(bytes.subarray(pos - len, pos))
            }
            case 4:
                return Array.from({ length: readArg(info) }, read)
            case 5: {
                const map = new Map<LuaKey, LuaValue>()
                const len = readArg(info)
                for (let i = 0; i < len; i++) {
                    const key = read()
                    if (typeof key !== 'number' && typeof key !== 'string')
                        throw new Error('Unsupported CBOR map key')
                    map.set(key, read())
                }
                return map
            }
            case 7:
                if (info === 20) return false
                if (info === 21) return true
                if (info === 26) return ((pos += 4), view.getFloat32(pos - 4))
                if (info === 27) return ((pos += 8), view.getFloat64(pos - 8))
        }
        throw new Error(`Unsupported CBOR item 0x${initial.toString(16)}`)
    }

    const value = read()
    if (pos !== bytes.length) throw new Error('Trailing bytes after CBOR item')
    return value
}

/**
 * Turn a save-format data table into an import string, as the game's
 * `CreateEncodeOutput` does. Raw deflate (no zlib header), standard base64.
 */
export const encodeLayoutString = (data: LuaValue): string =>
    `${ENCODING_VERSION}${DELIMITER}` +
    Buffer.from(Bun.deflateSync(encodeCbor(data))).toString('base64')

/** Split an import string and decode its payload back to CBOR bytes. */
export const layoutStringToCbor = (text: string): Uint8Array => {
    const at = text.indexOf(DELIMITER)
    if (at < 0) throw new Error('Missing "|" after the encoding version')
    const version = Number(text.slice(0, at))
    if (version !== ENCODING_VERSION)
        throw new Error(`Unknown encoding version ${version}`)
    return Bun.inflateSync(Buffer.from(text.slice(at + 1), 'base64'))
}

/** Decode an import string to its save-format data table. */
export const decodeLayoutString = (text: string): LuaValue =>
    decodeCbor(layoutStringToCbor(text))
