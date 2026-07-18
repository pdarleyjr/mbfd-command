import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskAdvancedMarker } from './TaskAdvancedMarker'

vi.mock('@vis.gl/react-google-maps', () => ({
  AdvancedMarker: ({ title, onDragEnd, children }: {
    title: string
    onDragEnd: (event: { latLng: { lat: () => number; lng: () => number } }) => void
    children: React.ReactNode
  }) => (
    <button
      aria-label={title}
      onClick={() => onDragEnd({ latLng: { lat: () => 25.793, lng: () => -80.134 } })}
    >
      {children}
    </button>
  ),
  Pin: ({ glyph }: { glyph: string }) => <span>{glyph}</span>,
}))

describe('TaskAdvancedMarker', () => {
  it('persists dragged coordinates through the position callback', () => {
    const onPositionChange = vi.fn()
    render(
      <TaskAdvancedMarker
        column={{ id: 'staging', title: 'Staging', location: '', unitIds: [], lat: 25.79, lng: -80.13 }}
        selected
        onSelect={vi.fn()}
        onPositionChange={onPositionChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Staging task pin. Drag to adjust location.' }))
    expect(onPositionChange).toHaveBeenCalledWith(25.793, -80.134)
  })
})
