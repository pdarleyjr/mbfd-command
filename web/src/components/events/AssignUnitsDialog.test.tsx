import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SpecialEventState } from '@/types'
import type { PulsePointIncident } from '@/lib/pulsepoint'
import { AssignUnitsDialog } from './AssignUnitsDialog'

const pulsepoint: PulsePointIncident = {
  id: 'pp-1', callTypeCode: 'ME', callType: 'Medical Emergency',
  address: '100 Test Ave', receivedAt: '2026-07-18T18:30:00Z',
  classification: { category: 'medical', subtype: 'medical', source: 'pulsepoint_code' },
  units: [{ id: 'Rescue 44', normalizedId: 'R44' }, { id: 'County 9', normalizedId: 'COUNTY9' }],
}

const state: SpecialEventState = {
  incidentId: 'inc-1',
  stagingLocations: [{ id: 'stg-1', name: 'North Staging', address: '', lat: null, lng: null, isDefault: true }],
  units: [
    { unitId: 'R44', status: 'staged', stagingLocationId: 'stg-1', currentRunId: null,
      previousStagingLocationId: null, manualHold: false, statusUpdatedAt: '2026-07-18T18:00:00Z' },
    { unitId: 'E1', status: 'responding', stagingLocationId: null, currentRunId: 'run-2',
      previousStagingLocationId: 'stg-1', manualHold: false, statusUpdatedAt: '2026-07-18T18:00:00Z' },
  ],
  runs: [],
}

describe('AssignUnitsDialog', () => {
  it('preselects eligible reported units and requires deliberate external-unit creation', () => {
    render(<AssignUnitsDialog incidentId="inc-1" pulsepoint={pulsepoint} state={state}
      onClose={vi.fn()} onSaved={vi.fn()} onRefresh={vi.fn(async () => undefined)} />)

    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByText(/R44/).closest('label')).toHaveTextContent('North Staging')
    expect(screen.queryByText('E1')).not.toBeInTheDocument()
    expect(screen.getByText('External / unrecognized resources')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to event roster' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign 1 Unit' })).toBeEnabled()
  })
})
