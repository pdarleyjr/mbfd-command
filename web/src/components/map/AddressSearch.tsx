import { useEffect, useRef } from 'react'
import { useMapsLibrary } from '@vis.gl/react-google-maps'
import { Search } from 'lucide-react'

export interface PlaceResult {
  address: string
  lat: number
  lng: number
}

/**
 * Google Places autocomplete biased to the Miami Beach / Miami-Dade area.
 * Falls back to a plain text field that emits the typed address (no geocode)
 * if the Places library can't load.
 */
export function AddressSearch({
  initial,
  onSelect,
  onTypedSubmit,
}: {
  initial: string
  onSelect: (place: PlaceResult) => void
  onTypedSubmit: (address: string) => void
}) {
  const places = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    if (!places || !inputRef.current) return
    // Bias toward Miami Beach; do not hard-restrict (mutual aid runs leave the city).
    const bounds = new google.maps.LatLngBounds(
      { lat: 25.74, lng: -80.16 },
      { lat: 25.89, lng: -80.1 },
    )
    const ac = new places.Autocomplete(inputRef.current, {
      bounds,
      fields: ['formatted_address', 'geometry', 'name'],
      componentRestrictions: { country: 'us' },
    })
    acRef.current = ac
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      const loc = place.geometry?.location
      if (!loc) return
      onSelect({
        address: place.formatted_address ?? place.name ?? '',
        lat: loc.lat(),
        lng: loc.lng(),
      })
    })
    return () => listener.remove()
  }, [places, onSelect])

  return (
    <form
      className="flex items-center gap-2 rounded-xl border border-surface-line bg-surface/90 px-3 shadow-card backdrop-blur-md"
      onSubmit={(e) => {
        e.preventDefault()
        if (!acRef.current && inputRef.current) onTypedSubmit(inputRef.current.value)
      }}
    >
      <Search size={16} className="shrink-0 text-ink-faint" />
      <input
        ref={inputRef}
        type="text"
        defaultValue={initial}
        placeholder="Incident address…"
        aria-label="Incident address"
        autoComplete="off"
        className="h-11 w-full bg-transparent text-sm font-medium text-ink placeholder:text-ink-faint focus:outline-none"
      />
    </form>
  )
}
