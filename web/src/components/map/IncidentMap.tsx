import { useCallback, useEffect, useState } from 'react'
import {
  APIProvider,
  Map,
  Marker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps'
import { Crosshair, MapPin, MapPinOff, Plus, Trash2, Compass, Navigation } from 'lucide-react'
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

export function IncidentMap({
  incident,
  fullPage = false,
}: {
  incident: Incident
  fullPage?: boolean
}) {
  if (!hasMapsKey) {
    const setAddress = useBoard((s) => s.setAddress)
    const setMarker = useBoard((s) => s.setMarker)
    return <MapPlaceholder incident={incident} onAddress={setAddress} onMarker={setMarker} />
  }

  return (
    <APIProvider apiKey={config.googleMapsApiKey} libraries={['places']}>
      <MapLayout incident={incident} fullPage={fullPage} />
    </APIProvider>
  )
}

function MapLayout({
  incident,
  fullPage,
}: {
  incident: Incident
  fullPage: boolean
}) {
  const map = useMap()
  const setAddress = useBoard((s) => s.setAddress)
  const setMarker = useBoard((s) => s.setMarker)
  const setColumnMarker = useBoard((s) => s.setColumnMarker)
  const addColumn = useBoard((s) => s.addColumn)

  const [camera, setCamera] = useState<CameraTarget | null>(null)
  const [locationStatus, setLocationStatus] = useState<string | null>(null)
  const [newColTitle, setNewColTitle] = useState('')

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

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Device location is not available')
      return
    }
    setLocationStatus('Finding device location...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const target = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setMarker(target)
        setCamera({ ...target, zoom: 17, nonce: Date.now() })
        setLocationStatus('Map set to device location')
      },
      () => setLocationStatus('Location permission denied or unavailable'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    )
  }

  const dropColumnPin = (columnId: string) => {
    const center = map?.getCenter()
    const lat = center ? center.lat() : (incident.marker?.lat ?? config.map.lat)
    const lng = center ? center.lng() : (incident.marker?.lng ?? config.map.lng)
    setColumnMarker(columnId, lat, lng)
    setCamera({ lat, lng, zoom: 17, nonce: Date.now() })
  }

  const recenterColumnPin = (lat: number, lng: number) => {
    setCamera({ lat, lng, zoom: 17, nonce: Date.now() })
  }

  const handleCreateColumn = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newColTitle.trim()) return
    addColumn(newColTitle.trim())
    setNewColTitle('')
  }

  const columns = incident.board.columns

  const mapContent = (
    <div className="relative h-full w-full overflow-hidden">
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

        {columns.map((col) => {
          if (typeof col.lat === 'number' && typeof col.lng === 'number') {
            return (
              <div key={col.id}>
                <Marker
                  position={{ lat: col.lat, lng: col.lng }}
                  draggable
                  onDragEnd={(e) => {
                    const ll = e.latLng
                    if (ll) setColumnMarker(col.id, ll.lat(), ll.lng())
                  }}
                  label={{
                    text: col.title[0]?.toUpperCase() || 'P',
                    color: '#ffffff',
                    fontWeight: 'bold',
                  }}
                />
                <InfoWindow
                  position={{ lat: col.lat, lng: col.lng }}
                  headerDisabled
                  disableAutoPan
                >
                  <div className="p-2 text-ink bg-surface-raised rounded-xl shadow-lift min-w-[130px] border border-surface-line select-none">
                    <h3 className="text-xs font-extrabold border-b border-surface-line pb-1 mb-1 text-ink">{col.title}</h3>
                    <div className="flex flex-col gap-1 max-h-16 overflow-y-auto scroll-thin">
                      {col.unitIds.map((uid) => (
                        <span key={uid} className="tabnum text-[10px] font-black bg-surface-high px-1.5 py-0.5 rounded border border-surface-line/50 text-ink-dim w-max">
                          {uid}
                        </span>
                      ))}
                      {col.unitIds.length === 0 && (
                        <span className="text-[10px] italic text-ink-faint">No units</span>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              </div>
            )
          }
          return null
        })}

        <MapPanner target={camera} />
      </Map>

      {/* Search + address overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-2 sm:flex-row sm:items-start sm:justify-between z-10">
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

      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-2 z-10">
        {locationStatus && (
          <span className="pointer-events-auto rounded-lg border border-surface-line bg-surface/90 px-2 py-1 text-xs font-semibold text-ink-dim shadow-card backdrop-blur-md">
            {locationStatus}
          </span>
        )}
        <div className="pointer-events-auto ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={useDeviceLocation} className="bg-surface/90 shadow-card backdrop-blur-md">
            <Crosshair size={15} /> Use my location
          </Button>
          <Button size="sm" variant="solid" onClick={recenter} className="shadow-card">
            <MapPin size={15} /> Recenter
          </Button>
        </div>
      </div>
    </div>
  )

  if (!fullPage) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-surface-line/70 bg-surface">
        {mapContent}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full gap-2 min-h-0">
      {/* Left Sidebar showing Tasks / Columns list */}
      <aside className="panel flex h-full w-80 shrink-0 flex-col rounded-2xl overflow-hidden shadow-card">
        <header className="flex items-center justify-between gap-1 border-b border-surface-line/60 px-3 py-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <Navigation size={16} className="text-go" />
            <h2 className="text-sm font-bold text-ink">Task Pins</h2>
            <span className="tabnum rounded-md bg-surface-high px-1.5 py-0.5 text-xs font-bold text-ink-dim">
              {columns.filter((c) => typeof c.lat === 'number').length}/{columns.length}
            </span>
          </div>
        </header>

        {/* Create new task/column from map page */}
        <div className="border-b border-surface-line/60 p-2.5 shrink-0">
          <form onSubmit={handleCreateColumn} className="flex gap-1.5">
            <input
              value={newColTitle}
              onChange={(e) => setNewColTitle(e.target.value)}
              placeholder="New assignment / task…"
              className="h-9 min-w-0 flex-1 rounded-lg border border-surface-line bg-surface px-2.5 text-xs font-bold text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-go/70"
            />
            <Button size="sm" variant="solid" type="submit" className="h-9 px-3">
              <Plus size={14} />
            </Button>
          </form>
        </div>

        {/* Columns list */}
        <div className="scroll-thin flex-1 overflow-y-auto p-2 space-y-1.5">
          {columns.map((col) => {
            const hasPin = typeof col.lat === 'number' && typeof col.lng === 'number'
            return (
              <div key={col.id} className="rounded-xl border border-surface-line bg-surface-high/20 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-ink leading-tight">{col.title}</span>
                  {hasPin && (
                    <span className="h-2 w-2 rounded-full bg-ok animate-pulse" title="Active pin" />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {col.unitIds.map((uid) => (
                    <span key={uid} className="tabnum text-[9px] font-black bg-surface-high/60 border border-surface-line px-1 py-0.5 rounded text-ink-dim">
                      {uid}
                    </span>
                  ))}
                  {col.unitIds.length === 0 && (
                    <span className="text-[9px] italic text-ink-faint">No units assigned</span>
                  )}
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  {hasPin ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => recenterColumnPin(col.lat!, col.lng!)}
                        className="flex-1 h-7 min-h-0 text-[10px] py-0 px-2"
                      >
                        <Compass size={11} /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setColumnMarker(col.id, null, null)}
                        className="h-7 min-h-0 text-[10px] text-live hover:bg-live/15 hover:border-live/35 py-0 px-2"
                      >
                        <Trash2 size={11} /> Remove Pin
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="solid"
                      onClick={() => dropColumnPin(col.id)}
                      className="w-full h-7 min-h-0 text-[10px] py-0 px-2"
                    >
                      <MapPin size={11} /> Drop Pin
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          {columns.length === 0 && (
            <p className="text-xs italic text-center text-ink-faint pt-4">No tasks found on board.</p>
          )}
        </div>
      </aside>

      {/* Map Area */}
      <div className="relative flex-1 h-full overflow-hidden rounded-2xl border border-surface-line/70 bg-surface">
        {mapContent}
      </div>
    </div>
  )
}

/** Shown when no Maps key is configured — the rest of the app still works. */
function MapPlaceholder({
  incident,
  onAddress,
  onMarker,
}: {
  incident: Incident
  onAddress: (a: string) => void
  onMarker: (marker: { lat: number; lng: number }) => void
}) {
  const [value, setValue] = useState(incident.address)
  const [status, setStatus] = useState<string | null>(null)

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setStatus('Device location is not available')
      return
    }
    setStatus('Finding device location...')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const marker = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        const label = `Device location (${marker.lat.toFixed(5)}, ${marker.lng.toFixed(5)})`
        onMarker(marker)
        onAddress(label)
        setValue(label)
        setStatus('Device location saved')
      },
      () => setStatus('Location permission denied or unavailable'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    )
  }

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
      <Button size="sm" variant="solid" onClick={useDeviceLocation}>
        <Crosshair size={15} /> Use my location
      </Button>
      {status && <p className="text-xs font-semibold text-ink-faint">{status}</p>}
    </div>
  )
}