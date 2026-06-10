import { useState } from 'react'
import { Archive, ArchiveRestore, Check, Plus, Radio, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { stamp } from '@/lib/format'
import { useBoard } from '@/store/boardStore'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmDialog, Modal } from '@/components/ui/Modal'

export function IncidentsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const incidents = useBoard((s) => s.incidents)
  const activeId = useBoard((s) => s.activeIncidentId)
  const create = useBoard((s) => s.createIncident)
  const resume = useBoard((s) => s.resumeIncident)
  const rename = useBoard((s) => s.renameIncident)
  const close = useBoard((s) => s.closeIncident)
  const reopen = useBoard((s) => s.reopenIncident)
  const remove = useBoard((s) => s.deleteIncident)

  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const target = incidents.find((i) => i.id === pendingDelete)

  const sorted = [...incidents].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  return (
    <Modal
      open={open}
      title="Incidents"
      onClose={onClose}
      className="max-w-lg"
      footer={
        <Button
          variant="solid"
          onClick={() => {
            create()
            onClose()
          }}
        >
          <Plus size={16} /> New incident
        </Button>
      }
    >
      <ul className="scroll-thin max-h-[55dvh] space-y-1.5 overflow-y-auto">
        {sorted.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-faint">No incidents yet.</li>
        )}
        {sorted.map((inc) => {
          const isActive = inc.id === activeId
          return (
            <li
              key={inc.id}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2',
                isActive ? 'border-go/50 bg-go/10' : 'border-surface-line/70 bg-surface-high/40',
                inc.closedAt && 'opacity-60',
              )}
            >
              <button
                type="button"
                onClick={() => {
                  resume(inc.id)
                  onClose()
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-center gap-1.5">
                  {isActive && <Radio size={13} className="shrink-0 text-go" />}
                  <input
                    value={inc.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => rename(inc.id, e.target.value)}
                    aria-label="Incident name"
                    className="w-full truncate rounded bg-transparent text-sm font-semibold text-ink hover:bg-surface-high/60 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-go/60"
                  />
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-faint">
                  {inc.closedAt ? 'Closed' : 'Updated'} {stamp(inc.updatedAt)}
                  {inc.address ? ` · ${inc.address}` : ''}
                </span>
              </button>

              {isActive && (
                <span className="shrink-0 rounded bg-go/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-go">
                  <Check size={11} className="inline" /> Active
                </span>
              )}
              {inc.closedAt ? (
                <IconButton label="Reopen incident" onClick={() => reopen(inc.id)} className="h-8 w-8">
                  <ArchiveRestore size={15} />
                </IconButton>
              ) : (
                <IconButton label="Close incident" onClick={() => close(inc.id)} className="h-8 w-8">
                  <Archive size={15} />
                </IconButton>
              )}
              <IconButton
                label="Delete incident"
                variant="danger"
                onClick={() => setPendingDelete(inc.id)}
                className="h-8 w-8"
              >
                <Trash2 size={14} />
              </IconButton>
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={Boolean(target)}
        title={`Delete "${target?.name ?? ''}"?`}
        message="This permanently removes the incident, its board, and its saved state from this device. This can't be undone. Export it first if you need a record."
        destructive
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </Modal>
  )
}
