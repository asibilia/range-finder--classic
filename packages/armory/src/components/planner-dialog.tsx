/**
 * The page's modal dialog (spec section 8), on shadcn's Dialog (Base UI):
 * `role="dialog"`, `aria-modal="true"`, named by its title. Focus moves to
 * `Close` on open, Tab stays inside (Base UI's focus trap), Escape and
 * `Close` close it, and focus goes back to the control that opened it.
 */
import { type ReactNode, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * A dialog the page opens itself (it is always open while rendered; the
 * page unmounts it to close it).
 *
 * @param title - The title, and the dialog's accessible name.
 * @param description - A line under the title, when there is one.
 * @param onClose - Called on Close, Escape or a click outside.
 * @param wide - A wider dialog.
 * @param overPane - Sits over the gear pane on a wide window (over 1280
 * px), as the mockup places the item picker and the talents, so the card
 * on the right stays in view; centred otherwise.
 */
export function PlannerDialog({
    title,
    description,
    onClose,
    wide,
    overPane = false,
    children,
}: {
    title: string
    description?: ReactNode
    onClose: () => void
    wide?: boolean
    overPane?: boolean
    children: ReactNode
}) {
    const closeRef = useRef<HTMLButtonElement>(null)
    const [left] = useState(() => (overPane ? paneCentre() : null))
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) onClose()
            }}
        >
            <DialogContent
                aria-modal="true"
                initialFocus={closeRef}
                showCloseButton={false}
                style={left === null ? undefined : { left }}
                className={cn(
                    'max-h-[min(48.75rem,calc(100dvh-2.5rem))] gap-3 overflow-y-auto rounded-[1.125rem] px-6 pt-5.5 pb-5 sm:max-w-[38.75rem]',
                    wide && 'sm:max-w-2xl'
                )}
            >
                <DialogHeader className="flex-row items-start gap-3">
                    <div className="flex flex-1 flex-col gap-1">
                        <DialogTitle className="text-2xl leading-tight font-normal">
                            {title}
                        </DialogTitle>
                        {description && (
                            <DialogDescription>{description}</DialogDescription>
                        )}
                    </div>
                    <DialogClose
                        ref={closeRef}
                        render={
                            <Button
                                variant="outline"
                                size="icon"
                                className="rounded-full"
                            />
                        }
                    >
                        <XIcon aria-hidden="true" />
                        <span className="sr-only">Close</span>
                    </DialogClose>
                </DialogHeader>
                {children}
            </DialogContent>
        </Dialog>
    )
}

/** The dialog's half width (38.75rem) plus a 1rem margin, in px. */
const HALF_WIDTH_PX = 326

/**
 * Where a dialog over the gear pane is centred: the pane's middle, kept on
 * screen; null on a window 1280 px wide or less, or without a pane.
 */
function paneCentre(): number | null {
    if (typeof window === 'undefined' || window.innerWidth <= 1280) return null
    const pane = document.querySelector('[data-slot="gear-pane"]')
    if (!pane) return null
    const box = pane.getBoundingClientRect()
    return Math.max(
        HALF_WIDTH_PX,
        Math.min(window.innerWidth - HALF_WIDTH_PX, box.left + box.width / 2)
    )
}
