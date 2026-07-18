import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PulsePointDrawer, PULSEPOINT_UI_KEY } from './PulsePointDrawer'

const feed = {
  active: [
    {
      id: 'pp-1',
      callTypeCode: 'ME',
      callType: 'Medical Emergency',
      address: '1000 Collins Avenue',
      receivedAt: '2026-07-18T18:30:00Z',
      units: [{ id: 'R44' }],
      lat: 25.79,
      lng: -80.13,
    },
  ],
  recent: [],
  fetchedAt: '2026-07-18T18:30:05Z',
}

vi.mock('@/lib/pulsepoint', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pulsepoint')>('@/lib/pulsepoint')
  return { ...actual, fetchPulsePointFeed: vi.fn(async () => feed) }
})

describe('PulsePointDrawer', () => {
  beforeEach(() => window.localStorage.clear())

  it('keeps an obvious accessible toggle on the collapsed rail', () => {
    const onCollapsedChange = vi.fn()
    render(
      <PulsePointDrawer
        incidentId="inc-1"
        mode="scene"
        collapsed
        onCollapsedChange={onCollapsedChange}
        onAction={vi.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: 'Open PulsePoint incidents' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('PulsePoint')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(onCollapsedChange).toHaveBeenCalledWith(false)
    expect(window.localStorage.getItem(PULSEPOINT_UI_KEY)).toBe('open')
  })

  it('uses the mode-specific Assign Units action for a special event', async () => {
    const onAction = vi.fn()
    render(
      <PulsePointDrawer
        incidentId="inc-special"
        mode="special_event"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        onAction={onAction}
      />,
    )

    const assign = await screen.findByRole('button', { name: 'Assign Units' })
    fireEvent.click(assign)
    await waitFor(() =>
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'assign_special_event_units',
          incident: expect.objectContaining({ id: 'pp-1' }),
        }),
      ),
    )
  })

  it('uses Use for a scene incident', async () => {
    render(
      <PulsePointDrawer
        incidentId="inc-scene"
        mode="scene"
        collapsed={false}
        onCollapsedChange={vi.fn()}
        onAction={vi.fn()}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Use' })).toBeInTheDocument()
  })
})
