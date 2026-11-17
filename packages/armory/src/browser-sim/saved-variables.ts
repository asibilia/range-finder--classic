/**
 * A SavedVariables file (`Name = { ... }` lines, as the game writes them)
 * read into plain objects with no Lua VM, the way the runner's Lua bridge
 * read it: every table is an object with string keys (`"1"`, `"2"` … for
 * arrays), `nil` leaves its key out (an array keeps its numbering), and `inf`
 * and `nan` become `null`. The keys `__proto__`, `constructor` and
 * `prototype` are dropped, so a file can't tamper with any object.
 */

export type SavedValue = string | number | boolean | null | Table

type Table = { [key: string]: SavedValue }

/** What a parsed value is: `nil` is kept apart so it can drop its key. */
const NIL = Symbol('nil')
type Parsed = SavedValue | typeof NIL

/**
 * Keys a file must never set: assigning them on a plain object could swap
 * its prototype or shadow what the page relies on, so they're dropped.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const ESCAPES: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    a: '\x07',
    b: '\b',
    f: '\f',
    v: '\v',
    '\\': '\\',
    '"': '"',
    "'": "'",
    '\n': '\n',
}

/** A number (hex, decimal, exponent) or a bare word, maybe negative. */
const WORD =
    /^-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_]\w*)/

/** The start of a long string or comment, `[[` or `[==[`. */
const LONG_OPEN = /^\[(=*)\[/
/** A `name = value` table field (not `name == value`). */
const NAMED_FIELD = /^[A-Za-z_]\w*\s*=(?!=)/

/** A Lua number's text as a number; `inf` and `nan` are `null`. */
function toNumber(text: string): number | null {
    const negative = text.startsWith('-')
    const body = negative ? text.slice(1) : text
    const value = /^0x/i.test(body) ? parseInt(body, 16) : Number(body)
    const signed = negative ? -value : value
    return Number.isFinite(signed) ? signed : null
}

class Reader {
    private at = 0

    constructor(private readonly text: string) {}

    fail(message: string): never {
        const line = this.text.slice(0, this.at).split('\n').length
        throw new Error(`SavedVariables, line ${line}: ${message}`)
    }

    /** Skips whitespace and comments. */
    skip(): void {
        const text = this.text
        for (;;) {
            while (this.at < text.length && /\s/.test(text[this.at]!)) this.at++
            if (!text.startsWith('--', this.at)) return
            this.at += 2
            const long = LONG_OPEN.exec(text.slice(this.at, this.at + 64))
            if (long) {
                const close = `]${long[1]}]`
                const end = text.indexOf(close, this.at)
                if (end < 0) this.fail('a comment never ends')
                this.at = end + close.length
            } else {
                const end = text.indexOf('\n', this.at)
                this.at = end < 0 ? text.length : end + 1
            }
        }
    }

    /** The text from here on. */
    rest(): string {
        return this.text.slice(this.at)
    }

    done(): boolean {
        this.skip()
        return this.at >= this.text.length
    }

    peek(): string {
        this.skip()
        return this.text[this.at] ?? ''
    }

    expect(char: string): void {
        if (this.peek() !== char) this.fail(`expected ${char}`)
        this.at++
    }

    /** Takes `char` if it's next. */
    take(char: string): boolean {
        if (this.peek() !== char) return false
        this.at++
        return true
    }

    name(): string {
        this.skip()
        const match = /^[A-Za-z_]\w*/.exec(this.rest())
        if (!match) this.fail('expected a name')
        this.at += match[0].length
        return match[0]
    }

    value(): Parsed {
        const char = this.peek()
        if (char === '{') return this.table()
        if (char === '"' || char === "'") return this.string()
        if (char === '[' && LONG_OPEN.test(this.rest()))
            return this.longString()
        const word = WORD.exec(this.rest())
        if (!word) this.fail('expected a value')
        this.at += word[0].length
        const negative = word[0].startsWith('-')
        const bare = negative ? word[0].slice(1) : word[0]
        if (/^[A-Za-z_]/.test(bare) && !/^0x/i.test(bare)) {
            if (bare === 'nil' && !negative) return NIL
            if (bare === 'true' && !negative) return true
            if (bare === 'false' && !negative) return false
            if (bare === 'inf' || bare === 'nan') return null
            this.at -= word[0].length
            this.fail(`unknown value ${word[0]}`)
        }
        return toNumber(word[0])
    }

    string(): string {
        const quote = this.text[this.at]!
        this.at++
        let out = ''
        const text = this.text
        for (;;) {
            if (this.at >= text.length) this.fail('a string never ends')
            const char = text[this.at]!
            if (char === quote) {
                this.at++
                return out
            }
            if (char === '\n') this.fail('a string runs past its line')
            if (char !== '\\') {
                out += char
                this.at++
                continue
            }
            const next = text[this.at + 1] ?? ''
            const digits = /^\d{1,3}/.exec(text.slice(this.at + 1))
            if (digits) {
                out += String.fromCharCode(Number(digits[0]))
                this.at += 1 + digits[0].length
            } else if (next === 'x') {
                const hex = /^[0-9a-fA-F]{2}/.exec(text.slice(this.at + 2))
                if (!hex) this.fail('a bad \\x escape')
                out += String.fromCharCode(parseInt(hex[0], 16))
                this.at += 4
            } else if (next === '\r') {
                // An escaped line break in a file saved with CRLF endings.
                out += '\n'
                this.at += text[this.at + 2] === '\n' ? 3 : 2
            } else if (next === 'z') {
                this.at += 2
                while (/\s/.test(text[this.at] ?? '')) this.at++
            } else if (next in ESCAPES) {
                out += ESCAPES[next]
                this.at += 2
            } else {
                this.fail(`an unknown escape \\${next}`)
            }
        }
    }

    longString(): string {
        const open = LONG_OPEN.exec(this.rest())!
        const close = `]${open[1]}]`
        const start = this.at + open[0].length
        const end = this.text.indexOf(close, start)
        if (end < 0) this.fail('a string never ends')
        this.at = end + close.length
        // Lua drops a newline right after the opening bracket.
        return this.text.slice(start, end).replace(/^\r?\n/, '')
    }

    table(): Table {
        this.expect('{')
        const table: Table = {}
        let index = 1
        while (!this.take('}')) {
            let key: string
            let value: Parsed
            if (this.peek() === '[' && !LONG_OPEN.test(this.rest())) {
                this.at++
                const raw = this.value()
                if (raw === NIL || raw === null)
                    this.fail('a table key is nil or not a number')
                key = String(raw)
                this.expect(']')
                this.expect('=')
                value = this.value()
            } else if (NAMED_FIELD.test(this.rest())) {
                key = this.name()
                this.expect('=')
                value = this.value()
            } else {
                key = String(index++)
                value = this.value()
            }
            if (value !== NIL && !UNSAFE_KEYS.has(key)) table[key] = value
            if (!this.take(',') && !this.take(';')) {
                this.expect('}')
                break
            }
        }
        return table
    }
}

/**
 * Reads a SavedVariables file: each `Name = value` at the top becomes a key.
 * A malformed file throws an error naming the line.
 */
export function parseSavedVariables(text: string): Record<string, SavedValue> {
    // A byte order mark, if the file starts with one, isn't Lua.
    const bom = text.charCodeAt(0) === 0xfeff
    const reader = new Reader(bom ? text.slice(1) : text)
    const vars: Record<string, SavedValue> = {}
    while (!reader.done()) {
        const name = reader.name()
        reader.expect('=')
        const value = reader.value()
        if (value !== NIL && !UNSAFE_KEYS.has(name)) vars[name] = value
        reader.take(';')
    }
    return vars
}
