/**
 * The page's one modal dialog (spec section 8): focus moves to `Close` on
 * open, Tab stays inside, Escape and `Close` close it, and focus goes back to
 * the control that opened it. The focus trap is written by hand so it
 * behaves the same in happy-dom and in browsers.
 */
import { type ReactNode, useEffect, useId, useRef } from 'react'

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
    title,
    onClose,
    children,
}: {
    title: string
    onClose: () => void
    children: ReactNode
}) {
    const titleId = useId()
    const dialogRef = useRef<HTMLDivElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)

    const onCloseRef = useRef(onClose)
    onCloseRef.current = onClose

    useEffect(() => {
        const opener =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null
        closeRef.current?.focus()

        // Listen on the document, not the dialog, so Escape and the Tab trap
        // still work when focus has dropped to the body (a removed row, a
        // click on plain text inside the dialog).
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onCloseRef.current()
                return
            }
            if (event.key !== 'Tab' || !dialogRef.current) return
            event.preventDefault()
            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
            )
            if (focusable.length === 0) return
            const at = focusable.indexOf(document.activeElement as HTMLElement)
            const step = event.shiftKey ? -1 : 1
            const next =
                at === -1
                    ? 0
                    : (at + step + focusable.length) % focusable.length
            focusable[next]?.focus()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            opener?.focus()
        }
    }, [])

    return (
        <div className="dialog-backdrop">
            <div
                ref={dialogRef}
                className="dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
            >
                <div className="dialog-header">
                    <h2 id={titleId}>{title}</h2>
                    <button ref={closeRef} type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}
