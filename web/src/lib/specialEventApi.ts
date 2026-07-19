import { apiBase } from './config'
import type { EventRun, MedicalDisposition, RunCategory, RunSubtype, SpecialEventState, StagingLocation } from '@/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(payload.detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

const incidentPath = (incidentId: string) => `/api/incidents/${encodeURIComponent(incidentId)}`

export const specialEventApi = {
  state: (incidentId: string) => request<SpecialEventState>(`${incidentPath(incidentId)}/event-state`),
  addStaging: (incidentId: string, value: Omit<StagingLocation, 'id'>) => request<StagingLocation>(`${incidentPath(incidentId)}/staging-locations`, { method: 'POST', body: JSON.stringify(value) }),
  setUnitStaging: (incidentId: string, unitId: string, stagingLocationId: string) => request(`${incidentPath(incidentId)}/units/${encodeURIComponent(unitId)}/staging`, { method: 'PATCH', body: JSON.stringify({ stagingLocationId }) }),
  setUnitHold: (incidentId: string, unitId: string, manualHold: boolean) => request(`${incidentPath(incidentId)}/units/${encodeURIComponent(unitId)}/hold`, { method: 'PATCH', body: JSON.stringify({ manualHold }) }),
  createRun: (incidentId: string, value: {
    callTypeLabel: string; category: RunCategory; subtype: RunSubtype; address: string;
    receivedAt: string; incidentNumber?: string; notes?: string; unitIds: string[]; noUnitAssigned: boolean
  }) => request<EventRun>(`${incidentPath(incidentId)}/runs`, { method: 'POST', body: JSON.stringify(value) }),
  assignUnits: (incidentId: string, runId: string, unitIds: string[]) => request<EventRun>(`${incidentPath(incidentId)}/runs/${runId}/units`, { method: 'POST', body: JSON.stringify({ unitIds }) }),
  patchRun: (incidentId: string, runId: string, value: Partial<EventRun>) => request<EventRun>(`${incidentPath(incidentId)}/runs/${runId}`, { method: 'PATCH', body: JSON.stringify(value) }),
  patchUnit: (incidentId: string, runId: string, unitId: string, value: Record<string, unknown>) => request(`${incidentPath(incidentId)}/runs/${runId}/units/${encodeURIComponent(unitId)}`, { method: 'PATCH', body: JSON.stringify(value) }),
  clearUnit: (incidentId: string, runId: string, unitId: string, value: { returnStagingLocationId?: string; disposition?: MedicalDisposition; transportDestination?: string; patientCount?: number; notes?: string }) => request(`${incidentPath(incidentId)}/runs/${runId}/units/${encodeURIComponent(unitId)}/clear`, { method: 'POST', body: JSON.stringify(value) }),
}
