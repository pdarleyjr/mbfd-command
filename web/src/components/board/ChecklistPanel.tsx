import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBoard } from '@/store/boardStore'
import { Button, IconButton } from '@/components/ui/Button'

interface ChecklistPanelProps {
  onClose: () => void
}

export function ChecklistPanel({ onClose }: ChecklistPanelProps) {
  const incident = useBoard((s) => s.getActive())
  const toggleChecklistItem = useBoard((s) => s.toggleChecklistItem)
  const addChecklistItem = useBoard((s) => s.addChecklistItem)
  const completeAllChecklistItems = useBoard((s) => s.completeAllChecklistItems)

  const [newItemText, setNewItemText] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<'benchmarks' | 'tactical'>('benchmarks')
  const [showAddForm, setShowAddForm] = useState(false)

  if (!incident) return null

  const checklist = incident.checklist ?? []
  const benchmarks = checklist.filter((item) => item.category === 'benchmarks')
  const tactical = checklist.filter((item) => item.category === 'tactical')

  const uncompletedBenchmarksCount = benchmarks.filter((i) => !itemCompleted(i)).length
  const uncompletedTacticalCount = tactical.filter((i) => !itemCompleted(i)).length

  function itemCompleted(item: any) {
    return Boolean(item.completed)
  }

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemText.trim()) return
    addChecklistItem(newItemText.trim(), newItemCategory)
    setNewItemText('')
    setShowAddForm(false)
  }

  return (
    <div className="absolute right-2 top-2 bottom-2 z-50 flex w-[380px] flex-col rounded-2xl border border-surface-line bg-surface-raised/95 shadow-lift backdrop-blur-xl">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-surface-line/60 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-ink">Checklist</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 text-xs font-semibold text-go hover:text-go/80"
          >
            <Plus size={13} /> Add Checklist
          </button>
        </div>
        <IconButton label="Close checklist" onClick={onClose} className="h-8 w-8">
          <X size={16} />
        </IconButton>
      </header>

      {/* Add Custom Item Form */}
      {showAddForm && (
        <div className="border-b border-surface-line/60 bg-surface/40 p-3 shrink-0">
          <form onSubmit={handleAddItem} className="space-y-2">
            <input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Checklist item text…"
              className="h-9 w-full rounded-lg border border-surface-line bg-surface px-2.5 text-xs font-bold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-go/70"
              autoFocus
            />
            <div className="flex gap-2 items-center justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewItemCategory('benchmarks')}
                  className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-bold border transition-all',
                    newItemCategory === 'benchmarks'
                      ? 'border-go/40 bg-go/10 text-go'
                      : 'border-surface-line bg-surface text-ink-faint'
                  )}
                >
                  Benchmark
                </button>
                <button
                  type="button"
                  onClick={() => setNewItemCategory('tactical')}
                  className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-bold border transition-all',
                    newItemCategory === 'tactical'
                      ? 'border-go/40 bg-go/10 text-go'
                      : 'border-surface-line bg-surface text-ink-faint'
                  )}
                >
                  Tactical Prompt
                </button>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" type="button" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="solid" type="submit">
                  Add
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Scrollable List */}
      <div className="scroll-thin flex-1 overflow-y-auto p-4 space-y-5">
        {/* Category: Benchmarks */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-ink-faint">Benchmarks</h3>
              {uncompletedBenchmarksCount > 0 && (
                <span className="tabnum rounded-full bg-live px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {uncompletedBenchmarksCount}
                </span>
              )}
            </div>
            {benchmarks.some((i) => !itemCompleted(i)) && (
              <button
                onClick={() => completeAllChecklistItems('benchmarks')}
                className="text-[10px] font-semibold text-go hover:underline"
              >
                Complete All
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {benchmarks.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-2.5 rounded-xl border border-surface-line/40 bg-surface/20 px-3 py-2.5 cursor-pointer hover:bg-surface-high/20 select-none"
              >
                <input
                  type="checkbox"
                  checked={itemCompleted(item)}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-line bg-surface text-go focus:ring-go/40 focus:ring-offset-0"
                />
                <span
                  className={cn(
                    'text-xs font-bold leading-tight transition-colors',
                    itemCompleted(item) ? 'text-ink-faint line-through' : 'text-ink-dim'
                  )}
                >
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Category: Tactical Prompts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-ink-faint">Tactical Prompts</h3>
              {uncompletedTacticalCount > 0 && (
                <span className="tabnum rounded-full bg-live px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {uncompletedTacticalCount}
                </span>
              )}
            </div>
            {tactical.some((i) => !itemCompleted(i)) && (
              <button
                onClick={() => completeAllChecklistItems('tactical')}
                className="text-[10px] font-semibold text-go hover:underline"
              >
                Complete All
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {tactical.map((item) => (
              <label
                key={item.id}
                className="flex items-start gap-2.5 rounded-xl border border-surface-line/40 bg-surface/20 px-3 py-2.5 cursor-pointer hover:bg-surface-high/20 select-none"
              >
                <input
                  type="checkbox"
                  checked={itemCompleted(item)}
                  onChange={() => toggleChecklistItem(item.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-line bg-surface text-go focus:ring-go/40 focus:ring-offset-0"
                />
                <span
                  className={cn(
                    'text-xs font-bold leading-tight transition-colors',
                    itemCompleted(item) ? 'text-ink-faint line-through' : 'text-ink-dim'
                  )}
                >
                  {item.text}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <footer className="flex items-center justify-end gap-2 border-t border-surface-line/60 bg-surface/20 px-4 py-3 shrink-0">
        <Button size="sm" variant="ghost" onClick={onClose} className="px-4">
          Cancel
        </Button>
        <Button size="sm" variant="solid" onClick={onClose} className="px-4 min-w-[70px]">
          Save
        </Button>
      </footer>
    </div>
  )
}