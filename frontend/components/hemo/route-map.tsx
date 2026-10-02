'use client'

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
  const path = curve(from.position, to.position, 0.22)
  const bounds = L.latLngBounds([from.position, to.position]).pad(0.35)

  return (
    <MapContainer
      key={`${from.position.join()}-${to.position.join()}`}
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
      <Polyline positions={path} pathOptions={{ color, weight: 10, opacity: 0.18, lineCap: 'round' }} />
      <Polyline positions={path} pathOptions={{ color, weight: 3, opacity: 0.95, className: 'hg-flow' }} />
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
  )
}
