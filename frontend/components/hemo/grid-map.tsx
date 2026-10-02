'use client'

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { useNow } from '@/hooks/use-now'
import { BANKS, DONORS, GRID_CENTER, ICUS, formatRemaining, isLocked, siteById } from '@/lib/hemo-data'
import { useGrid } from './grid-store'

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

/** Quadratic bezier between two lat/lng points, bowed perpendicular to the chord. */
export function curve(from: [number, number], to: [number, number], bend = 0.28, steps = 40): [number, number][] {
  const [lat1, lng1] = from
  const [lat2, lng2] = to
  const midLat = (lat1 + lat2) / 2
  const midLng = (lng1 + lng2) / 2
  const ctrlLat = midLat - (lng2 - lng1) * bend
  const ctrlLng = midLng + (lat2 - lat1) * bend
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const u = 1 - t
    return [u * u * lat1 + 2 * u * t * ctrlLat + t * t * lat2, u * u * lng1 + 2 * u * t * ctrlLng + t * t * lng2]
  })
}

function NeonArc({ positions, color }: { positions: [number, number][]; color: string }) {
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color, weight: 9, opacity: 0.18, lineCap: 'round' }} />
      <Polyline positions={positions} pathOptions={{ color, weight: 2.5, opacity: 0.95, className: 'hg-flow' }} />
    </>
  )
}

export default function GridMap() {
  const { emergencies, stock } = useGrid()
  const now = useNow()
  const emergencyIcuIds = new Set(emergencies.map((e) => e.icuId))
  const activeLocks = stock.filter((s) => isLocked(s, now) && s.lockedUntil !== null)

  return (
    <MapContainer
      center={GRID_CENTER}
      zoom={13}
      zoomSnap={1}
      zoomControl={false}
      className="size-full"
      attributionControl
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        className="hg-dark-tiles"
        maxZoom={19}
      />

      {DONORS.filter((d) => emergencyIcuIds.has(d.icuId)).map((donor) => {
        const icu = siteById(ICUS, donor.icuId)
        if (!icu) return null
        return <NeonArc key={`arc-${donor.id}`} positions={curve(donor.position, icu.position)} color="#00E676" />
      })}

      {activeLocks.map((item) => {
        const bank = siteById(BANKS, item.bankId)
        const icu = siteById(ICUS, item.lockedByIcuId)
        if (!bank || !icu) return null
        return <NeonArc key={`lock-${item.id}`} positions={curve(bank.position, icu.position, -0.32)} color="#FFB800" />
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
