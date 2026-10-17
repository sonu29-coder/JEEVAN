'use client'

import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Maximize2, Navigation, Siren } from 'lucide-react'
import { calculateBearing, calculateRoadRoute, DEFAULT_TILE_ATTRIBUTION, DEFAULT_TILE_LAYER_URL } from '@/lib/navigation-service'

function MapAutoResizer() {
  const map = useMap()
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 150)
    const handleResize = () => map.invalidateSize()
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [map])
  return null
}

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

const createRiderIcon = (heading: number = 0) =>
  L.divIcon({
    className: '',
    html: `
      <div style="transform: rotate(${heading}deg); transition: transform 0.2s ease-out; display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:9999px;background:#059669;color:white;box-shadow:0 8px 20px rgba(0,0,0,0.5);border:2.5px solid white;font-size:18px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 19 21 12 17 5 21 12 2" fill="#ffffff"/>
        </svg>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })

interface RoutePoint {
  position: [number, number]
  label: string
  kind: MarkerKind
}

export default function RouteMap({
  from,
  to,
  color = '#10b981',
  progress = 0,
  onStartNavigation,
}: {
  from: RoutePoint
  to: RoutePoint
  color?: string
  progress?: number
  onStartNavigation?: () => void
}) {
  const [path, setPath] = useState<[number, number][]>([from.position, to.position])
  const [roadInfo, setRoadInfo] = useState<{ distanceKm: number; durationMin: number; name: string } | null>(null)

  useEffect(() => {
    let active = true
    async function loadRoadRoute() {
      try {
        const { activeRoute } = await calculateRoadRoute(from.position, to.position, {
          isGreenCorridor: true,
        })
        if (active && activeRoute.coordinates.length >= 2) {
          setPath(activeRoute.coordinates)
          setRoadInfo({
            distanceKm: Number((activeRoute.distanceMeters / 1000).toFixed(1)),
            durationMin: Number((activeRoute.durationSeconds / 60).toFixed(1)),
            name: activeRoute.name,
          })
        }
      } catch {
        // Keep existing path
      }
    }

    loadRoadRoute()
    return () => {
      active = false
    }
  }, [from.position, to.position])

  const bounds = L.latLngBounds(path.length > 0 ? path : [from.position, to.position]).pad(0.25)

  // Calculate live position and heading of courier along the real road path
  const clampedProgress = Math.min(1, Math.max(0, progress))
  const riderIndex = Math.min(path.length - 1, Math.max(0, Math.floor(clampedProgress * (path.length - 1))))
  const nextRiderIndex = Math.min(path.length - 1, riderIndex + 1)
  const riderPosition = path[riderIndex] || from.position

  const heading =
    riderIndex < nextRiderIndex && path[riderIndex] && path[nextRiderIndex]
      ? calculateBearing(path[riderIndex], path[nextRiderIndex])
      : 0

  return (
    <div className="relative size-full overflow-hidden">
      <MapContainer
        key={`${from.position.join()}-${to.position.join()}-${path.length}`}
        bounds={bounds}
        zoomControl={false}
        scrollWheelZoom={false}
        className="size-full bg-[#121619]"
        attributionControl={false}
      >
        <MapAutoResizer />
        <TileLayer
          url={DEFAULT_TILE_LAYER_URL}
          attribution={DEFAULT_TILE_ATTRIBUTION}
          maxZoom={19}
        />

        {/* Glow outer road corridor */}
        <Polyline
          positions={path}
          pathOptions={{
            color,
            weight: 10,
            opacity: 0.28,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />

        {/* Core road line following street network */}
        <Polyline
          positions={path}
          pathOptions={{
            color,
            weight: 4,
            opacity: 0.95,
            className: 'hg-flow',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />

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

        {clampedProgress > 0 && clampedProgress < 1 && (
          <Marker position={riderPosition} icon={createRiderIcon(heading)} zIndexOffset={600}>
            <Tooltip permanent direction="top" offset={[0, -16]}>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                🚀 Courier ({Math.round(clampedProgress * 100)}%)
              </span>
            </Tooltip>
          </Marker>
        )}
      </MapContainer>

      {/* Road Info & Launch Full-Screen Navigation Overlay */}
      <div className="absolute inset-x-2 bottom-2 z-[400] flex items-center justify-between gap-2">
        {roadInfo && (
          <div className="rounded-xl bg-neutral-900/90 px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 backdrop-blur border border-white/10 shadow-lg">
            🛣️ {roadInfo.distanceKm} km • ⏱️ {roadInfo.durationMin} min (Real Road)
          </div>
        )}

        {onStartNavigation && (
          <button
            type="button"
            onClick={onStartNavigation}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xl transition-all hover:bg-emerald-700 active:scale-95 border border-emerald-400/30"
          >
            <Navigation className="size-3.5 fill-white" />
            <span>Turn-by-Turn Nav</span>
          </button>
        )}
      </div>
    </div>
  )
}
