'use client'

import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { curve } from './grid-map'

export type MarkerKind = 'donor' | 'bank' | 'icu'

const ICONS: Record<MarkerKind, L.DivIcon> = {
  donor: L.divIcon({ className: '', html: '<div class="hg-donor"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
  bank: L.divIcon({ className: '', html: '<div class="hg-bank"></div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
  icu: L.divIcon({
    className: '',
    html: '<div class="hg-radar"><span></span><span></span><span></span><i></i></div>',
    iconSize: [64, 64],
    iconAnchor: [32, 32],
  }),
}

interface RoutePoint {
  position: [number, number]
  label: string
  kind: MarkerKind
}

export default function RouteMap({ from, to, color }: { from: RoutePoint; to: RoutePoint; color: string }) {
  const [path, setPath] = useState<[number, number][]>(() => curve(from.position, to.position, 0.22))
  const [roadInfo, setRoadInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null)

  useEffect(() => {
    let active = true
    async function loadRoadRoute() {
      try {
        const [lat1, lon1] = from.position
        const [lat2, lon2] = to.position
        // Query Open Source Routing Machine driving profile for Thrissur road network
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`
        const res = await fetch(url)
        if (!res.ok) throw new Error('OSRM network response was not ok')
        const data = await res.json()
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates && active) {
          const coords: [number, number][] = data.routes[0].geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng]
          )
          setPath(coords)
          setRoadInfo({
            distanceKm: Number((data.routes[0].distance / 1000).toFixed(1)),
            durationMin: Number((data.routes[0].duration / 60).toFixed(1)),
          })
        }
      } catch {
        // Fallback to curved trajectory if offline
        if (active) {
          setPath(curve(from.position, to.position, 0.22))
        }
      }
    }

    loadRoadRoute()
    return () => {
      active = false
    }
  }, [from.position, to.position])

  const bounds = L.latLngBounds(path.length > 0 ? path : [from.position, to.position]).pad(0.25)

  return (
    <div className="relative size-full">
      <MapContainer
        key={`${from.position.join()}-${to.position.join()}-${path.length}`}
        bounds={bounds}
        zoomControl={false}
        scrollWheelZoom={false}
        className="size-full"
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          className="hg-dark-tiles"
          maxZoom={19}
        />
        {/* Glow outer road corridor */}
        <Polyline positions={path} pathOptions={{ color, weight: 10, opacity: 0.22, lineCap: 'round', lineJoin: 'round' }} />
        {/* Core road line following street pavement */}
        <Polyline positions={path} pathOptions={{ color, weight: 3.5, opacity: 0.95, className: 'hg-flow' }} />
        <Marker position={from.position} icon={ICONS[from.kind]} zIndexOffset={200}>
          <Tooltip permanent direction="top" offset={[0, -10]}>
            {from.label}
          </Tooltip>
        </Marker>
        <Marker position={to.position} icon={ICONS[to.kind]} zIndexOffset={400}>
          <Tooltip permanent direction="bottom" offset={[0, 14]}>
            {to.label}
          </Tooltip>
        </Marker>
      </MapContainer>

      {roadInfo && (
        <div className="absolute bottom-2 left-2 z-[400] rounded-md bg-neutral-900/85 px-2 py-1 text-[10px] font-mono text-neutral-300 backdrop-blur border border-white/10">
          🛣️ Real Road: {roadInfo.distanceKm} km • ⏱️ {roadInfo.durationMin} min
        </div>
      )}
    </div>
  )
}
