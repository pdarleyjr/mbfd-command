import { useCallback, useEffect, useState } from 'react'
import {
  APIProvider,
  Map,
  Marker,
  useMap,
} from '@vis.gl/react-google-maps'
import { Crosshair, MapPin, MapPinOff } from 'lucide-react'
import { config, hasMapsKey } from '@/lib/config'
import { useBoard } from '@/store/boardStore'
import type { Incident } from '@/types'
import { Button } from '@/components/ui/Button'
import { AddressSearch, type PlaceResult } from './AddressSearch'

interface CameraTarget {
  lat: number
  lng: number
  zoom: number
  nonce: number
}

/** Imperatively pans the map when a new camera target arrives, leaving user gestures free. */
function MapPanner({ target }: { target: CameraTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (!map || !target) return
    map.panTo({ lat: target.lat, lng: target.lng })
    map.setZoom(target.zoom)
  }, [map, target])
  return null
}

export function IncidentMap({ incident }: { incident: Incident }) {
  const setAddress = useBoard((s) => s.setAddress)
  const setMarker = useBoard((s) => s.setMarker)
  const [camera, setCamera] = useState<CameraTarget | null>(null)

  const onSelect = useCallback(
    (place: PlaceResult) => {
      setAddress(place.address)
      setMarker({ lat: place.lat, lng: place.lng })
      setCamera({ lat: place.lat, lng: place.lng, zoom: 17, nonce: Date.now() })
    },
    [setAddress, setMarker],
  )

  const recenter = () => {
    const m = incident.marker
    setCamera({
      lat: m?.lat ?? config.map.lat,
      lng: m?.lng ?? config.map.lng,
      zoom: m ? 17 : config.map.zoom,
      nonce: Date.now(),
    })
  }

  if (!hasMapsKey) {
    return <MapPlaceholder incident={incident} onAddress={setAddress} />
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-surface-line/70 bg-surface">
      <APIProvider apiKey={config.googleMapsApiKey} libraries={['places']}>
        <Map
          defaultCenter={{
            lat: incident.marker?.lat ?? config.map.lat,
            lng: incident.marker?.lng ?? config.map.lng,
          }}
          defaultZoom={incident.marker ? 17 : config.map.zoom}
          mapId={config.googleMapsMapId}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          colorScheme="DARK"
          className="h-full w-full"
        >
          {incident.marker && (
            <Marker
              position={incident.marker}
              draggable
              onDragEnd={(e) => {
                const ll = e.latLng
                if (ll) setMarker({ lat: ll.lat(), lng: ll.lng() })
              }}
            />
          )}
          <MapPanner target={camera} />
        </Map>

        {/* Search + address overlay */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="pointer-events-auto w-full max-w-md">
            <AddressSearch initial={incident.address} onSelect={onSelect} onTypedSubmit={setAddress} />
          </div>
          {incident.address && (
            <div className="pointer-events-auto flex items-center gap-1.5 self-start rounded-xl border border-surface-line bg-surface/90 px-3 py-2 text-sm font-semibold text-ink shadow-card backdrop-blur-md">
              <MapPin size={15} className="text-live" />
              <span className="line-clamp-1 max-w-[18rem]">{incident.address}</span>
            </div>
          )}
        </div>

        <div className="absolute bottom-2 right-2">
          <Button size="sm" variant="solid" onClick={recenter} className="shadow-card">
            <Crosshair size={15} /> Recenter
          </Button>
        </div>
      </APIProvider>
    </div>
  )
}

/** Shown when no Maps key is configured — the rest of the app still works. */
function MapPlaceholder({
  incident,
  onAddress,
}: {
  incident: Incident
  onAddress: (a: string) => void
}) {
  const [value, setValue] = useState(incident.address)
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed border-surface-line bg-surface/60 px-4 text-center">
      <MapPinOff size={28} className="text-ink-faint" />
      <div>
        <p className="text-sm font-semibold text-ink-dim">Map needs a Google Maps API key</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          Set <code className="rounded bg-surface-high px-1">VITE_GOOGLE_MAPS_API_KEY</code> to enable
          the live map, autocomplete, and marker. You can still log the address below.
        </p>
      </div>
      <form
        className="flex w-full max-w-md items-center gap-2 rounded-xl border border-surface-line bg-surface/90 px-3"
        onSubmit={(e) => {
          e.preventDefault()
          onAddress(value)
        }}
      >
        <MapPin size={16} className="shrink-0 text-ink-faint" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onAddress(value)}
          placeholder="Incident address…"
          aria-label="Incident address"
          className="h-11 w-full bg-transparent text-sm font-medium text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </form>
    </div>
  )
}
