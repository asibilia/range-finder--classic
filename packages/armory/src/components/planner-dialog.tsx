/**
 * The page's modal dialog (spec section 8), on shadcn's Dialog (Base UI):
 * `role="dialog"`, `aria-modal="true"`, named by its title. Focus moves to
 * `Close` on open, Tab stays inside (Base UI's focus trap), Escape and
 * `Close` close it, and focus goes back to the control that opened it.
 */
import { type ReactNode, useRef } from 'react'
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
 * @param wide - A wider dialog (the talent tree).
 */
export function PlannerDialog({
    title,
    description,
    onClose,
    wide,
    children,
}: {
    title: string
    description?: ReactNode
    onClose: () => void
    wide?: boolean
    children: ReactNode
}) {
    const closeRef = useRef<HTMLButtonElement>(null)
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
                className={cn(
                    'max-h-[min(48rem,calc(100dvh-2.5rem))] overflow-y-auto p-5 sm:max-w-xl',
                    wide && 'sm:max-w-2xl'
                )}
            >
                <DialogHeader className="flex-row items-start gap-3">
                    <div className="flex flex-1 flex-col gap-1">
                        <DialogTitle className="text-xl">{title}</DialogTitle>
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
