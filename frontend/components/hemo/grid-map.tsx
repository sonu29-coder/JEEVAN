'use client'

import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useNow } from '@/hooks/use-now'
import { BANKS, DONORS, GRID_CENTER, ICUS, formatRemaining, isLocked, siteById } from '@/lib/hemo-data'
import {
  calculateRoadRoute,
  DEFAULT_TILE_ATTRIBUTION,
  DEFAULT_TILE_LAYER_URL,
  MAP_LAYERS,
  type MapLayerType,
  type RouteOption,
} from '@/lib/navigation-service'
import { useGrid } from './grid-store'

function MapAutoResizer() {
  const map = useMap()
  useEffect(() => {
    // Invalidate map size so it fits perfectly inside parent app container on load and tab switches
    const timer = setTimeout(() => {
      map.invalidateSize()
    }, 150)

    const handleResize = () => {
      map.invalidateSize()
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [map])

  return null
}

const emergencyIcon = L.divIcon({
  className: '',
  html: '<div class="hg-radar"><span></span><span></span><span></span><i></i></div>',
  iconSize: [64, 64],
  iconAnchor: [32, 32],
})
const idleIcuIcon = L.divIcon({ className: '', html: '<div class="hg-icu-idle"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })
const bankIcon = L.divIcon({ className: '', html: '<div class="hg-bank"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
const lockedBankIcon = L.divIcon({ className: '', html: '<div class="hg-bank is-locked"></div>', iconSize: [24, 24], iconAnchor: [12, 12] })
const donorIcon = L.divIcon({ className: '', html: '<div class="hg-donor"></div>', iconSize: [12, 12], iconAnchor: [6, 6] })

/**
 * Real Road Corridor: Computes and renders real roadway shortest paths
 * along the street network, optimizing shortest road distance & time savings.
 */
function RealRoadCorridor({
  from,
  to,
  color = '#00E676',
  isGreenCorridor = true,
}: {
  from: [number, number]
  to: [number, number]
  color?: string
  isGreenCorridor?: boolean
}) {
  const [route, setRoute] = useState<RouteOption | null>(null)

  useEffect(() => {
    let active = true
    async function loadRoadCorridor() {
      try {
        const { activeRoute } = await calculateRoadRoute(from, to, { isGreenCorridor })
        if (active && activeRoute && activeRoute.coordinates.length >= 2) {
          setRoute(activeRoute)
        }
      } catch {
        // Fallback handled
      }
    }
    loadRoadCorridor()
    return () => {
      active = false
    }
  }, [from, to, isGreenCorridor])

  const coords = route && route.coordinates.length >= 2 ? route.coordinates : [from, to]
  const distKm = route ? (route.distanceMeters / 1000).toFixed(1) : ''
  const durMin = route ? Math.max(1, Math.round(route.durationSeconds / 60)) : ''
  const savedMin = route?.timeSavedSeconds ? Math.round(route.timeSavedSeconds / 60) : 0
  const midPoint = coords[Math.floor(coords.length / 2)] || from

  return (
    <>
      {/* Outer Road Glow (follows actual street network) */}
      <Polyline
        positions={coords}
        pathOptions={{
          color,
          weight: 7,
          opacity: 0.32,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {/* Inner Active Flow Polyline (follows actual street network) */}
      <Polyline
        positions={coords}
        pathOptions={{
          color,
          weight: 3.5,
          opacity: 0.95,
          className: 'hg-flow',
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />

      {route && (
        <Marker
          position={midPoint}
          icon={L.divIcon({
            className: '',
            html: `
              <div style="background:#0f172a;color:#ffffff;border:1.5px solid ${color};border-radius:9999px;padding:2px 8px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;gap:4px;pointer-events:none;">
                <span>⚡</span>
                <span>${distKm} km · ${durMin}m${savedMin > 0 ? ` (-${savedMin}m)` : ''}</span>
              </div>
            `,
            iconSize: [110, 24],
            iconAnchor: [55, 12],
          })}
          zIndexOffset={300}
        />
      )}
    </>
  )
}

export default function GridMap({ layer = 'streets' }: { layer?: MapLayerType }) {
  const { emergencies, stock } = useGrid()
  const now = useNow()
  const emergencyIcuIds = new Set(emergencies.map((e) => e.icuId))
  const activeLocks = stock.filter((s) => isLocked(s, now) && s.lockedUntil !== null)
  const activeLayer = MAP_LAYERS[layer] || MAP_LAYERS.streets

  return (
    <MapContainer
      center={GRID_CENTER}
      zoom={13}
      zoomSnap={1}
      zoomControl={false}
      className="size-full"
      attributionControl
    >
      <MapAutoResizer />
      <TileLayer
        key={activeLayer.id}
        url={activeLayer.url}
        attribution={activeLayer.attribution}
        className={activeLayer.className}
        maxZoom={activeLayer.maxZoom}
      />

      {DONORS.filter((d) => emergencyIcuIds.has(d.icuId)).map((donor) => {
        const icu = siteById(ICUS, donor.icuId)
        if (!icu) return null
        return (
          <RealRoadCorridor
            key={`road-donor-${donor.id}`}
            from={donor.position}
            to={icu.position}
            color="#00E676"
            isGreenCorridor={true}
          />
        )
      })}

      {activeLocks.map((item) => {
        const bank = siteById(BANKS, item.bankId)
        const icu = siteById(ICUS, item.lockedByIcuId)
        if (!bank || !icu) return null
        return (
          <RealRoadCorridor
            key={`road-lock-${item.id}`}
            from={bank.position}
            to={icu.position}
            color="#FFB800"
            isGreenCorridor={true}
          />
        )
      })}

      {DONORS.filter((d) => emergencyIcuIds.has(d.icuId)).map((donor) => (
        <Marker key={donor.id} position={donor.position} icon={donorIcon}>
          <Tooltip direction="top" offset={[0, -8]}>{`Matched donor • ${donor.group}`}</Tooltip>
        </Marker>
      ))}

      {BANKS.map((bank) => {
        const locks = activeLocks.filter((s) => s.bankId === bank.id)
        const soonest = locks.reduce<number | null>(
          (min, s) => (s.lockedUntil !== null && (min === null || s.lockedUntil < min) ? s.lockedUntil : min),
          null,
        )
        return (
          <Marker key={bank.id} position={bank.position} icon={soonest ? lockedBankIcon : bankIcon} zIndexOffset={200}>
            {soonest ? (
              <Tooltip permanent direction="right" offset={[14, 0]} className="hg-tooltip">
                {`15m HOLD • ${formatRemaining(soonest, now)}`}
              </Tooltip>
            ) : (
              <Tooltip direction="top" offset={[0, -12]}>
                {bank.name}
              </Tooltip>
            )}
          </Marker>
        )
      })}

      {ICUS.map((icu) => (
        <Marker
          key={icu.id}
          position={icu.position}
          icon={emergencyIcuIds.has(icu.id) ? emergencyIcon : idleIcuIcon}
          zIndexOffset={400}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {icu.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
