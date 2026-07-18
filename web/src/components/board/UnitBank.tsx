import { useState, type FormEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Edit3, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Truck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { APPARATUS_META, APPARATUS_ORDER, unitLookup } from '@/data/units'
import type { ApparatusType, Unit } from '@/types'
import { Button, IconButton } from '@/components/ui/Button'
import { SortableUnit } from './SortableUnit'

type UnitFilter = 'all' | 'apparatus' | 'rescues' | 'details' | 'command'

const FILTERS: { id: UnitFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'apparatus', label: 'Fire Apparatus' },
  { id: 'rescues', label: 'Rescues' },
  { id: 'details', label: 'Detail Units' },
  { id: 'command', label: 'Command' },
]

interface UnitBankProps {
  bankUnitIds: string[]
  customUnits?: Unit[]
  onAddUnit: (label: string, type: ApparatusType) => void
  onEditUnit: (unitId: string, label: string, type: ApparatusType) => void
  onRecoverAll: () => void
}

export function UnitBank({
  bankUnitIds,
  customUnits = [],
  onAddUnit,
  onEditUnit,
  onRecoverAll,
}: UnitBankProps) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  const [mode, setMode] = useState<'idle' | 'add' | 'edit'>('idle')
  const [filter, setFilter] = useState<UnitFilter>('all')
  const [unitName, setUnitName] = useState('')
  const [unitType, setUnitType] = useState<ApparatusType>('special')
  const [editingUnitId, setEditingUnitId] = useState('')
  const { setNodeRef, isOver } = useDroppable({
    id: 'bank',
    data: { type: 'bank', containerId: 'bank' },
  })
  const unitsById = unitLookup(customUnits)
  const units = bankUnitIds.map((id) => unitsById[id]).filter(Boolean)
  const visibleUnits = units.filter((u) => matchesFilter(u, filter))

  function beginEdit(unit?: Unit) {
    const next = unit ?? units[0]
    if (!next) return
    setEditingUnitId(next.id)
    setUnitName(next.label)
    setUnitType(next.type)
    setMode('edit')
  }

  function submitUnit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const next = unitName.trim()
    if (!next) return
    if (mode === 'edit' && editingUnitId) {
      onEditUnit(editingUnitId, next, unitType)
    } else {
      onAddUnit(next, unitType)
    }
    setUnitName('')
    setEditingUnitId('')
    setMode('idle')
  }

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
    <aside className="flex h-full w-[17rem] shrink-0 flex-col rounded-2xl border border-surface-line/70 bg-surface/70">
      <header className="flex items-center justify-between gap-1 border-b border-surface-line/60 px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Truck size={16} className="text-go" />
          <h2 className="text-sm font-bold text-ink">Units</h2>
          <span className="tabnum rounded-md bg-surface-high px-1.5 py-0.5 text-xs font-bold text-ink-dim">
            {visibleUnits.length}/{units.length}
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

      <div className="border-b border-surface-line/60 px-2 py-2">
        <div className="grid grid-cols-2 gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'min-h-8 rounded-lg border px-2 text-left text-[11px] font-bold transition-colors',
                filter === item.id
                  ? 'border-go/50 bg-go/15 text-go'
                  : 'border-surface-line bg-surface/60 text-ink-faint hover:text-ink-dim',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={setNodeRef}
        data-dropzone="bank"
        className={cn(
          'scroll-thin flex flex-1 flex-col gap-1.5 overflow-y-auto p-2 transition-colors',
          isOver && 'bg-go/5 ring-2 ring-inset ring-go/40',
        )}
      >
        <SortableContext items={bankUnitIds} strategy={verticalListSortingStrategy}>
          {visibleUnits.map((u) => (
            <div key={u.id} className="group relative">
              <SortableUnit unit={u} containerId="bank" compact />
              <button
                type="button"
                onClick={() => beginEdit(u)}
                className="absolute right-8 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-surface-line bg-surface/95 text-ink-faint shadow-card hover:text-go group-hover:flex focus:flex focus:outline-none focus:ring-2 focus:ring-go/70"
                aria-label={`Edit ${u.label}`}
              >
                <Edit3 size={13} />
              </button>
            </div>
          ))}
        </SortableContext>
        {visibleUnits.length === 0 && (
          <p className="select-none px-1 pt-3 text-center text-xs text-ink-faint">
            {units.length === 0
              ? 'all units assigned — drag one back here to free it'
              : 'no units match this filter'}
          </p>
        )}
      </div>

      <footer className="border-t border-surface-line/60 px-2 py-2">
        {mode !== 'idle' ? (
          <form className="mb-2 space-y-1.5" onSubmit={submitUnit}>
            {mode === 'edit' && (
              <select
                value={editingUnitId}
                onChange={(e) => {
                  const u = unitsById[e.target.value]
                  if (u) beginEdit(u)
                }}
                aria-label="Unit to edit"
                className="h-9 w-full rounded-lg border border-surface-line bg-surface px-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-go/70"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            )}
            <input
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              placeholder={mode === 'edit' ? 'Unit label' : 'Unit ID (ex: E5)'}
              aria-label={mode === 'edit' ? 'Unit label' : 'New unit identifier'}
              className="h-9 w-full rounded-lg border border-surface-line bg-surface px-2 text-sm font-bold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-go/70"
              autoFocus
            />
            <div className="flex gap-1.5">
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as ApparatusType)}
                aria-label="New unit type"
                className="h-9 min-w-0 flex-1 rounded-lg border border-surface-line bg-surface px-2 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-go/70"
              >
                {APPARATUS_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {APPARATUS_META[type].label}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="solid" type="submit" className="px-2">
                {mode === 'edit' ? 'Save' : 'Add'}
              </Button>
            </div>
            <Button size="sm" variant="ghost" type="button" onClick={() => setMode('idle')} className="w-full">
              Cancel
            </Button>
          </form>
        ) : (
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="solid" onClick={() => setMode('add')}>
              <Plus size={14} /> Add unit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => beginEdit()} disabled={!units.length}>
              <Edit3 size={14} /> Edit
            </Button>
          </div>
        )}
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

function matchesFilter(unit: Unit, filter: UnitFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'apparatus') return unit.type === 'engine' || unit.type === 'ladder'
  if (filter === 'rescues') return unit.type === 'rescue' && !unit.label.toLowerCase().includes('detail')
  if (filter === 'details') return unit.label.toLowerCase().includes('detail')
  if (filter === 'command') {
    const label = unit.label.toLowerCase().replace(/\s+/g, ' ').trim()
    return unit.type === 'command' || /^\d00$/.test(unit.id) || label === 'capt. 5' || label === 'captain 5'
  }
  return true
}
