import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

interface InlineEditProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel: string
  className?: string
  inputClassName?: string
  /** Render the static (non-editing) value; defaults to the text or placeholder. */
  display?: (value: string) => React.ReactNode
}

/**
 * Tap/click a label to edit it in place. Enter or blur commits; Escape reverts.
 * Used for editable column titles and location notes.
 */
export function InlineEdit({
  value,
  onChange,
  placeholder = 'Untitled',
  ariaLabel,
  className,
  inputClassName,
  display,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(value)
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }
  }, [editing, value])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onChange(next)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setEditing(false)
        }}
        className={cn(
          'w-full rounded-md border border-go/50 bg-surface px-2 py-1 text-ink',
          'focus:outline-none focus:ring-2 focus:ring-go/70',
          inputClassName,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`${ariaLabel} (tap to edit)`}
      className={cn(
        'cursor-text rounded-md px-1 py-0.5 text-left hover:bg-surface-high/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/70',
        !value && 'text-ink-faint italic',
        className,
      )}
    >
      {display ? display(value) : value || placeholder}
    </button>
  )
}
