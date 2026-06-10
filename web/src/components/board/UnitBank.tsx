import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { PanelLeftClose, PanelLeftOpen, RotateCcw, Truck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { APPARATUS_META, APPARATUS_ORDER, UNIT_BY_ID } from '@/data/units'
import { Button, IconButton } from '@/components/ui/Button'
import { SortableUnit } from './SortableUnit'

interface UnitBankProps {
  bankUnitIds: string[]
  onRecoverAll: () => void
}

export function UnitBank({ bankUnitIds, onRecoverAll }: UnitBankProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { setNodeRef, isOver } = useDroppable({
    id: 'bank',
    data: { type: 'bank', containerId: 'bank' },
  })
  const units = bankUnitIds.map((id) => UNIT_BY_ID[id]).filter(Boolean)

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-2 rounded-2xl border border-surface-line/70 bg-surface/70 py-2">
        <IconButton label="Expand unit bank" onClick={() => setCollapsed(false)}>
          <PanelLeftOpen size={18} />
        </IconButton>
        <div className="flex items-center gap-1 [writing-mode:vertical-rl]">
          <Truck size={14} className="text-ink-faint" />
          <span className="text-xs font-semibold tracking-wide text-ink-dim">
            UNITS · {units.length}
          </span>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col rounded-2xl border border-surface-line/70 bg-surface/70">
      <header className="flex items-center justify-between gap-1 border-b border-surface-line/60 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Truck size={16} className="text-go" />
          <h2 className="text-sm font-bold text-ink">Units</h2>
          <span className="tabnum rounded-md bg-surface-high px-1.5 py-0.5 text-xs font-bold text-ink-dim">
            {units.length}
          </span>
        </div>
        <div className="flex items-center">
          <IconButton label="Recover all units to bank" onClick={onRecoverAll} className="h-7 w-7">
            <RotateCcw size={14} />
          </IconButton>
          <IconButton
            label="Collapse unit bank"
            onClick={() => setCollapsed(true)}
            className="h-7 w-7"
          >
            <PanelLeftClose size={16} />
          </IconButton>
        </div>
      </header>

      <div
        ref={setNodeRef}
        data-dropzone="bank"
        className={cn(
          'scroll-thin flex flex-1 flex-col gap-1.5 overflow-y-auto p-2 transition-colors',
          isOver && 'bg-go/5 ring-2 ring-inset ring-go/40',
        )}
      >
        <SortableContext items={bankUnitIds} strategy={verticalListSortingStrategy}>
          {units.map((u) => (
            <SortableUnit key={u.id} unit={u} containerId="bank" compact />
          ))}
        </SortableContext>
        {units.length === 0 && (
          <p className="select-none px-1 pt-3 text-center text-xs text-ink-faint">
            all units assigned — drag one back here to free it
          </p>
        )}
      </div>

      <footer className="border-t border-surface-line/60 px-2 py-2">
        <Button size="sm" variant="ghost" onClick={onRecoverAll} className="w-full">
          <RotateCcw size={14} /> Reset units
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 px-1">
          {APPARATUS_ORDER.map((type) => {
            const m = APPARATUS_META[type]
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', m.dot)} />
                <span className="truncate text-[10px] font-medium text-ink-faint">{m.label}</span>
              </div>
            )
          })}
        </div>
      </footer>
    </aside>
  )
}
