import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps'
import type { Column } from '@/types'

export function TaskAdvancedMarker({
  column,
  selected,
  onSelect,
  onPositionChange,
}: {
  column: Column
  selected: boolean
  onSelect: () => void
  onPositionChange: (lat: number, lng: number) => void
}) {
  if (typeof column.lat !== 'number' || typeof column.lng !== 'number') return null

  return (
    <AdvancedMarker
      position={{ lat: column.lat, lng: column.lng }}
      draggable
      clickable
      title={`${column.title} task pin. Drag to adjust location.`}
      onClick={onSelect}
      onDragEnd={(event) => {
        const latLng = event.latLng
        if (!latLng) return
        onPositionChange(latLng.lat(), latLng.lng())
      }}
      zIndex={selected ? 100 : 10}
    >
      <Pin
        scale={selected ? 1.35 : 1}
        glyph={column.title.slice(0, 1).toUpperCase()}
        background={selected ? '#38bdf8' : '#18253c'}
        borderColor={selected ? '#e8eef7' : '#65748d'}
        glyphColor="#e8eef7"
      />
    </AdvancedMarker>
  )
}
