import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button, IconButton } from './Button'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  dismissible?: boolean
}

export function Modal({ open, title, onClose, children, footer, className, dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    if (!dismissible) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissible])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-ground/80 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} />
      <div
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-surface-line bg-surface-raised shadow-lift',
          className,
        )}
      >
        <header className="flex items-center justify-between border-b border-surface-line/70 px-5 py-3.5">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {dismissible && <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>}
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-surface-line/70 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'solid'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-dim">{message}</div>
    </Modal>
  )
}
