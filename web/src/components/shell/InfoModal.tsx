import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

export function InfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title="About MBFD Command" onClose={onClose}>
      <div className="space-y-3 text-sm leading-relaxed text-ink-dim">
        <div className="flex gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-ink">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
          <p>
            <strong className="text-warn">Decision-support prototype.</strong> The AI transcript may
            contain errors. Verify all critical radio traffic by radio and dispatch. This tool does
            not replace official radio monitoring, CAD, dispatch logs, or incident command
            procedures — and it never makes operational decisions.
          </p>
        </div>
        <p>
          MBFD Command is a touchscreen incident command board: drag apparatus into assignment
          columns, drop an incident marker on the map, and review live AI-assisted radio
          transcription. Board state and the transcript are saved on this device and can be exported.
        </p>
        <ul className="list-inside list-disc space-y-1 text-ink-faint">
          <li>Drag units between the bank and columns; tap a column title or location to edit it.</li>
          <li>Long-press a card on touch screens to pick it up.</li>
          <li>Use “Recover units” if a card is ever misplaced — nothing is lost.</li>
          <li>The transcript tags the likely speaking unit; unclear audio is marked “inaudible”.</li>
        </ul>
      </div>
    </Modal>
  )
}
