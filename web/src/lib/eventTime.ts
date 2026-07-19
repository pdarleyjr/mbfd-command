import type { IncidentSchedule, RunUnitAssignment, EventRun } from '@/types'

export function eventElapsedMs(schedule: IncidentSchedule, nowMs: number): number {
  const startIso = schedule.actualStartAt ??
    (schedule.scheduledStartAt && new Date(schedule.scheduledStartAt).getTime() <= nowMs
      ? schedule.scheduledStartAt : null)
  if (!startIso) return 0
  const startMs = new Date(startIso).getTime()
  const endCandidates = [
    schedule.actualEndAt,
    schedule.scheduledEndAt && new Date(schedule.scheduledEndAt).getTime() <= nowMs
      ? schedule.scheduledEndAt : null,
  ].filter(Boolean) as string[]
  const endMs = endCandidates.length
    ? Math.min(...endCandidates.map((value) => new Date(value).getTime()))
    : nowMs
  return Math.max(0, endMs - startMs)
}

export function assignmentDurationMs(
  assignment: Pick<RunUnitAssignment, 'assignedAt' | 'clearedAt'>,
  nowMs: number,
): number {
  const start = new Date(assignment.assignedAt).getTime()
  const end = assignment.clearedAt ? new Date(assignment.clearedAt).getTime() : nowMs
  return Math.max(0, end - start)
}

export function runActiveDurationMs(
  run: Pick<EventRun, 'activatedAt' | 'receivedAt' | 'clearedAt'> & {
    unitAssignments: Array<Pick<RunUnitAssignment, 'assignedAt'>>
  },
  nowMs: number,
): number {
  const start = run.activatedAt ?? run.unitAssignments.map((item) => item.assignedAt).sort()[0] ?? run.receivedAt
  const end = run.clearedAt ?? new Date(nowMs).toISOString()
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime())
}
