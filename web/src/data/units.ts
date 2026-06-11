import type { ApparatusType, Unit } from '@/types'

/**
 * MBFD apparatus roster, in the operational order the department reads it
 * (shift command → station companies → marine → air → rescues → details →
 * staff). Order is preserved deliberately; do not re-sort.
 */
export const UNITS: Unit[] = [
  { id: '300', label: '300', type: 'command' },
  { id: 'Capt. 5', label: 'Capt. 5', type: 'command' },
  { id: 'E1', label: 'E1', type: 'engine' },
  { id: 'L1', label: 'L1', type: 'ladder' },
  { id: 'E2', label: 'E2', type: 'engine' },
  { id: 'E3', label: 'E3', type: 'engine' },
  { id: 'L3', label: 'L3', type: 'ladder' },
  { id: 'E4', label: 'E4', type: 'engine' },
  { id: 'FB6', label: 'FB6', type: 'fireboat' },
  { id: 'FB4', label: 'FB4', type: 'fireboat' },
  { id: 'Air Truck', label: 'Air Truck', type: 'special' },
  { id: 'R1', label: 'R1', type: 'rescue' },
  { id: 'R11', label: 'R11', type: 'rescue' },
  { id: 'R2', label: 'R2', type: 'rescue' },
  { id: 'R22', label: 'R22', type: 'rescue' },
  { id: 'R3', label: 'R3', type: 'rescue' },
  { id: 'R4', label: 'R4', type: 'rescue' },
  { id: 'R44', label: 'R44', type: 'rescue' },
  { id: 'Detail Rescue', label: 'Detail Rescue', type: 'special' },
  { id: 'Detail Unit', label: 'Detail Unit', type: 'special' },
  { id: 'Detail Gator', label: 'Detail Gator', type: 'special' },
  { id: '100', label: '100', type: 'command' },
  { id: '200', label: '200', type: 'command' },
  { id: '400', label: '400', type: 'command' },
  { id: '500', label: '500', type: 'command' },
]

export const UNIT_BY_ID: Record<string, Unit> = Object.fromEntries(
  UNITS.map((u) => [u.id, u]),
)

export function unitLookup(customUnits: Unit[] = []): Record<string, Unit> {
  return Object.fromEntries([...UNITS, ...customUnits].map((u) => [u.id, u]))
}

export const DEFAULT_UNIT_ORDER: string[] = UNITS.map((u) => u.id)

/**
 * Default command columns. The initial "Stagging" spelling is intentional —
 * it matches the department's current usage; column titles are editable so it
 * can be corrected to "Staging" later without a code change.
 */
export const DEFAULT_COLUMN_TITLES: { title: string; location?: string }[] = [
  { title: 'Command' },
  { title: 'Stagging' },
  { title: 'Fire Attack' },
  { title: 'Search' },
  { title: 'RIT' },
  { title: 'Rehab' },
  { title: 'Vent' },
]

/** Human-facing labels + Tailwind accent classes per apparatus type. */
export const APPARATUS_META: Record<
  ApparatusType,
  { label: string; dot: string; ring: string; chip: string; text: string }
> = {
  command: {
    label: 'Command / Staff',
    dot: 'bg-app-command',
    ring: 'ring-app-command/60',
    chip: 'bg-app-command/15 border-app-command/40',
    text: 'text-app-command',
  },
  engine: {
    label: 'Engines',
    dot: 'bg-app-engine',
    ring: 'ring-app-engine/60',
    chip: 'bg-app-engine/15 border-app-engine/40',
    text: 'text-app-engine',
  },
  ladder: {
    label: 'Ladders',
    dot: 'bg-app-ladder',
    ring: 'ring-app-ladder/60',
    chip: 'bg-app-ladder/15 border-app-ladder/40',
    text: 'text-app-ladder',
  },
  rescue: {
    label: 'Rescues',
    dot: 'bg-app-rescue',
    ring: 'ring-app-rescue/60',
    chip: 'bg-app-rescue/15 border-app-rescue/40',
    text: 'text-app-rescue',
  },
  fireboat: {
    label: 'Fireboats',
    dot: 'bg-app-fireboat',
    ring: 'ring-app-fireboat/60',
    chip: 'bg-app-fireboat/15 border-app-fireboat/40',
    text: 'text-app-fireboat',
  },
  special: {
    label: 'Special / Detail',
    dot: 'bg-app-special',
    ring: 'ring-app-special/60',
    chip: 'bg-app-special/15 border-app-special/40',
    text: 'text-app-special',
  },
}

/** Ordered list of apparatus types, used for the bank legend / grouping. */
export const APPARATUS_ORDER: ApparatusType[] = [
  'command',
  'engine',
  'ladder',
  'rescue',
  'fireboat',
  'special',
]
