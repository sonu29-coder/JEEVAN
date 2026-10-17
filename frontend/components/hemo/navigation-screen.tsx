'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  BatteryCharging,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Copy,
  FastForward,
  Info,
  KeyRound,
  Layers,
  List,
  Locate,
  LocateFixed,
  Maximize2,
  Minimize2,
  Navigation,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  ThermometerSnowflake,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import {
  calculateBearing,
  calculateRemainingRouteDistance,
  calculateRoadRoute,
  DEFAULT_TILE_ATTRIBUTION,
  DEFAULT_TILE_LAYER_URL,
  distanceMeters,
  formatDistance,
  formatDuration,
  formatEtaClock,
  MAP_LAYERS,
  snapToRoute,
  voiceGuidance,
  type MapLayerType,
  type NavigationStep,
  type RouteOption,
} from '@/lib/navigation-service'
import { ManeuverIcon } from './maneuver-icon'
import { otpForLock } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'

// Custom DivIcons
const createVehicleIcon = (heading: number = 0, isAmbulance: boolean = false) => {
  return L.divIcon({
    className: 'nav-vehicle-marker-wrapper',
    html: `
      <div style="position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center;pointer-events:none;">
        <!-- Pulsing radar glow -->
        <div style="position:absolute;inset:0;border-radius:9999px;background:radial-gradient(circle, rgba(16,185,129,0.38) 0%, rgba(16,185,129,0) 70%);animation:pulse 1.8s infinite;"></div>
        <!-- Directional vehicle puck -->
        <div style="transform: rotate(${heading}deg); transition: transform 0.25s ease-out; display:flex; align-items:center; justify-content:center; width:40px; height:40px; border-radius:9999px; background:#047857; border:3px solid #ffffff; box-shadow:0 8px 24px rgba(0,0,0,0.5);">
          ${
            isAmbulance
              ? '<span style="font-size:20px;line-height:1;">🚑</span>'
              : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 19 21 12 17 5 21 12 2" fill="#ffffff" fill-opacity="0.9"/></svg>'
          }
        </div>
      </div>
    `,
    iconSize: [52, 52],
    iconAnchor: [26, 26],
  })
}

const createDestinationIcon = (label: string, isHospital: boolean = true) => {
  return L.divIcon({
    className: 'nav-dest-marker-wrapper',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
        <div style="display:flex;align-items:center;gap:4px;background:#c8322b;color:#ffffff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:9999px;box-shadow:0 6px 18px rgba(200,50,43,0.45);border:2px solid #ffffff;white-space:nowrap;">
          <span>${isHospital ? '🏥' : '🩸'}</span>
          <span>${label}</span>
        </div>
        <div style="width:2px;height:8px;background:#ffffff;box-shadow:0 2px 4px rgba(0,0,0,0.4);"></div>
        <div style="width:10px;height:10px;border-radius:9999px;background:#c8322b;border:2px solid #ffffff;"></div>
      </div>
    `,
    iconSize: [120, 48],
    iconAnchor: [60, 48],
  })
}

const createOriginIcon = (label: string) => {
  return L.divIcon({
    className: 'nav-origin-marker-wrapper',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
        <div style="display:flex;align-items:center;gap:4px;background:#2563eb;color:#ffffff;font-size:11px;font-weight:800;padding:4px 10px;border-radius:9999px;box-shadow:0 6px 18px rgba(37,99,235,0.4);border:2px solid #ffffff;white-space:nowrap;">
          <span>📦</span>
          <span>${label}</span>
        </div>
        <div style="width:2px;height:8px;background:#ffffff;"></div>
        <div style="width:10px;height:10px;border-radius:9999px;background:#2563eb;border:2px solid #ffffff;"></div>
      </div>
    `,
    iconSize: [120, 48],
    iconAnchor: [60, 48],
  })
}

// Controller component to smoothly keep map centered or fit bounds
function MapController({
  center,
  zoom,
  followVehicle,
  bounds,
  onUserDrag,
}: {
  center: [number, number]
  zoom: number
  followVehicle: boolean
  bounds: L.LatLngBoundsExpression | null
  onUserDrag: () => void
}) {
  const map = useMap()

  useMapEvents({
    dragstart: () => {
      onUserDrag()
    },
  })

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

  useEffect(() => {
    if (bounds && !followVehicle) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 })
    } else if (followVehicle && center) {
      map.flyTo(center, zoom, {
        animate: true,
        duration: 0.6,
      })
    }
  }, [center, zoom, followVehicle, bounds, map])

  return null
}

export interface NavigationScreenProps {
  origin: {
    name: string
    short: string
    position: [number, number]
    type?: 'bank' | 'donor' | 'origin'
  }
  destination: {
    name: string
    short: string
    position: [number, number]
    type?: 'hospital' | 'icu' | 'destination'
  }
  deliveryDetails?: {
    requestId: string
    bloodGroup: string
    component: string
    units: number
    lockId?: string | null
    isGreenCorridor?: boolean
    courierName?: string
  }
  onClose: () => void
  onCompleteDelivery?: () => void
}

export function NavigationScreen({
  origin,
  destination,
  deliveryDetails,
  onClose,
  onCompleteDelivery,
}: NavigationScreenProps) {
  // Navigation State
  const [activeRoute, setActiveRoute] = useState<RouteOption | null>(null)
  const [alternativeRoutes, setAlternativeRoutes] = useState<RouteOption[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isLoadingRoute, setIsLoadingRoute] = useState(true)
  const [routingError, setRoutingError] = useState<string | null>(null)
  const [rerouteCount, setRerouteCount] = useState(0)
  const [isRerouting, setIsRerouting] = useState(false)

  // Tracking & Vehicle State
  const [rawVehiclePosition, setRawVehiclePosition] = useState<[number, number]>(origin.position)
  const [smoothedVehiclePosition, setSmoothedVehiclePosition] = useState<[number, number]>(origin.position)
  const [vehicleHeading, setVehicleHeading] = useState<number>(0)
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(10)
  const [gpsStatus, setGpsStatus] = useState<'searching' | 'locked' | 'denied' | 'simulated'>('searching')
  const [isTrackingMode, setIsTrackingMode] = useState<boolean>(true) // follow vehicle vs overview
  const [voiceMuted, setVoiceMuted] = useState<boolean>(false)
  const [showStepList, setShowStepList] = useState<boolean>(false)
  const [showReportModal, setShowReportModal] = useState<boolean>(false)
  const [showAlternativesModal, setShowAlternativesModal] = useState<boolean>(false)
  const [copiedOtp, setCopiedOtp] = useState<boolean>(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [navMapLayer, setNavMapLayer] = useState<MapLayerType>('streets')

  // Simulation / Dev Mode State (distinct and clearly labeled)
  const [isDevSimulationMode, setIsDevSimulationMode] = useState<boolean>(false)
  const [simPlaying, setSimPlaying] = useState<boolean>(false)
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(1)
  const simStepProgressRef = useRef<number>(0)
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Deviation Detection Hysteresis
  const offRouteFixesCountRef = useRef<number>(0)
  const isReroutingRef = useRef<boolean>(false)
  const previousFixRef = useRef<{ coord: [number, number]; timestamp: number } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // 1. Initial Route Calculation
  const fetchRoute = useCallback(
    async (startCoord: [number, number], endCoord: [number, number], isDeviationReroute: boolean = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const controller = new AbortController()
      abortControllerRef.current = controller

      if (isDeviationReroute) {
        setIsRerouting(true)
        voiceGuidance.speak('Rerouting. Calculating fresh emergency corridor.')
      } else {
        setIsLoadingRoute(true)
      }
      setRoutingError(null)

      try {
        const { activeRoute: newRoute, alternatives: newAlts } = await calculateRoadRoute(
          startCoord,
          endCoord,
          {
            isGreenCorridor: deliveryDetails?.isGreenCorridor ?? true,
            signal: controller.signal,
          }
        )

        setActiveRoute(newRoute)
        setAlternativeRoutes(newAlts)
        setCurrentStepIndex(0)
        setIsLoadingRoute(false)
        setIsRerouting(false)
        isReroutingRef.current = false
        offRouteFixesCountRef.current = 0

        // Announce first maneuver
        if (newRoute.steps.length > 0) {
          voiceGuidance.announceManeuver(newRoute.steps[0], newRoute.steps[0].distanceMeters)
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return
        setRoutingError('Failed to calculate road corridor. Check connection.')
        setIsLoadingRoute(false)
        setIsRerouting(false)
        isReroutingRef.current = false
      }
    },
    [deliveryDetails?.isGreenCorridor]
  )

  useEffect(() => {
    fetchRoute(origin.position, destination.position)
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
    }
  }, [origin.position, destination.position, fetchRoute])

  // 2. Real GPS Hardware Tracking
  useEffect(() => {
    if (isDevSimulationMode) {
      setGpsStatus('simulated')
      return
    }

    if (!('geolocation' in navigator)) {
      setGpsStatus('denied')
      return
    }

    let watchId: number
    setGpsStatus('searching')

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const accuracy = pos.coords.accuracy
        const timestamp = pos.timestamp
        setGpsAccuracy(accuracy)

        // Reject fixes with poor accuracy (> 60m)
        if (accuracy > 65) {
          setGpsStatus('searching')
          return
        }

        setGpsStatus('locked')
        const currentCoord: [number, number] = [lat, lng]
        setRawVehiclePosition(currentCoord)

        // Calculate heading from device or movement
        let heading = pos.coords.heading
        if ((heading === null || isNaN(heading)) && previousFixRef.current) {
          const movedDist = distanceMeters(previousFixRef.current.coord, currentCoord)
          if (movedDist >= 3) {
            heading = calculateBearing(previousFixRef.current.coord, currentCoord)
          }
        }
        if (heading !== null && !isNaN(heading)) {
          setVehicleHeading(heading)
        }

        previousFixRef.current = { coord: currentCoord, timestamp }

        // Apply smoothing (Exponential Moving Average)
        setSmoothedVehiclePosition((prev) => {
          const smoothedLat = prev[0] * 0.35 + currentCoord[0] * 0.65
          const smoothedLng = prev[1] * 0.35 + currentCoord[1] * 0.65
          return [smoothedLat, smoothedLng]
        })
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied')
        } else {
          setGpsStatus('searching')
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1200,
        timeout: 10000,
      }
    )

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId)
    }
  }, [isDevSimulationMode])

  // 3. Map Matching, Step Progress, and Deviation Rerouting Engine
  useEffect(() => {
    if (!activeRoute || activeRoute.coordinates.length < 2) return

    const { snappedCoord, distanceFromRouteMeters, segmentIndex } = snapToRoute(
      smoothedVehiclePosition,
      activeRoute.coordinates
    )

    // A. Check Route Deviation (> 65m for 3 consecutive GPS fixes)
    if (distanceFromRouteMeters > 65) {
      offRouteFixesCountRef.current += 1
      if (offRouteFixesCountRef.current >= 3 && !isReroutingRef.current) {
        isReroutingRef.current = true
        setRerouteCount((c) => c + 1)
        fetchRoute(smoothedVehiclePosition, destination.position, true)
        return
      }
    } else {
      offRouteFixesCountRef.current = 0
    }

    // B. Advance Turn-by-Turn Maneuver Step
    if (activeRoute.steps.length > 0) {
      // Find nearest upcoming step
      let bestStepIdx = currentStepIndex
      const distToCurrent = distanceMeters(
        smoothedVehiclePosition,
        activeRoute.steps[currentStepIndex]?.coordinates || activeRoute.coordinates[0]
      )

      // If we are within 25m of the current step maneuver location, advance to next step
      if (distToCurrent < 28 && currentStepIndex < activeRoute.steps.length - 1) {
        bestStepIdx = currentStepIndex + 1
        setCurrentStepIndex(bestStepIdx)
      }

      // Voice Guidance Trigger
      const activeStep = activeRoute.steps[bestStepIdx]
      if (activeStep) {
        const stepDist = distanceMeters(smoothedVehiclePosition, activeStep.coordinates)
        if (!voiceMuted) {
          voiceGuidance.announceManeuver(activeStep, stepDist)
        }
      }
    }
  }, [smoothedVehiclePosition, activeRoute, currentStepIndex, destination.position, fetchRoute, voiceMuted])

  // 4. Test / Dev GPS Simulator (allows testing live progression & deviation)
  const startDevSimulation = useCallback(() => {
    if (!activeRoute || activeRoute.coordinates.length === 0) return
    setIsDevSimulationMode(true)
    setSimPlaying(true)
    setGpsStatus('simulated')

    if (simTimerRef.current) clearInterval(simTimerRef.current)

    const routeCoords = activeRoute.coordinates
    const totalPoints = routeCoords.length

    simTimerRef.current = setInterval(() => {
      simStepProgressRef.current += 0.008 * simSpeedMultiplier
      if (simStepProgressRef.current >= 1) {
        simStepProgressRef.current = 1
        if (simTimerRef.current) clearInterval(simTimerRef.current)
        setSimPlaying(false)
        voiceGuidance.speak('You have arrived at your destination.')
      }

      const exactIndex = simStepProgressRef.current * (totalPoints - 1)
      const baseIndex = Math.floor(exactIndex)
      const nextIndex = Math.min(totalPoints - 1, baseIndex + 1)
      const fraction = exactIndex - baseIndex

      const pA = routeCoords[baseIndex]
      const pB = routeCoords[nextIndex]

      if (pA && pB) {
        const simLat = pA[0] + (pB[0] - pA[0]) * fraction
        const simLng = pA[1] + (pB[1] - pA[1]) * fraction
        const simCoord: [number, number] = [simLat, simLng]

        setSmoothedVehiclePosition(simCoord)
        setRawVehiclePosition(simCoord)

        const brng = calculateBearing(pA, pB)
        setVehicleHeading(brng)
      }
    }, 250)
  }, [activeRoute, simSpeedMultiplier])

  const pauseDevSimulation = useCallback(() => {
    if (simTimerRef.current) clearInterval(simTimerRef.current)
    setSimPlaying(false)
  }, [])

  const triggerDevDeviation = useCallback(() => {
    // Deliberately shift vehicle off course by 120m to verify reroute detection
    setSmoothedVehiclePosition((prev) => [prev[0] + 0.0012, prev[1] + 0.0012])
    voiceGuidance.speak('Simulating off-route road deviation.')
  }, [])

  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current)
    }
  }, [])

  // Dynamic calculations for HUD
  const currentStep: NavigationStep | undefined = activeRoute?.steps[currentStepIndex]
  const nextStep: NavigationStep | undefined = activeRoute?.steps[currentStepIndex + 1]

  const distanceToNextManeuver = useMemo(() => {
    if (!currentStep) return 0
    return Math.round(distanceMeters(smoothedVehiclePosition, currentStep.coordinates))
  }, [smoothedVehiclePosition, currentStep])

  const remainingDistanceMeters = useMemo(() => {
    if (!activeRoute) return 0
    const { segmentIndex } = snapToRoute(smoothedVehiclePosition, activeRoute.coordinates)
    return calculateRemainingRouteDistance(smoothedVehiclePosition, activeRoute.coordinates, segmentIndex)
  }, [smoothedVehiclePosition, activeRoute])

  const remainingDurationSeconds = useMemo(() => {
    if (!activeRoute || activeRoute.distanceMeters === 0) return 0
    const ratio = Math.max(0, Math.min(1, remainingDistanceMeters / activeRoute.distanceMeters))
    return Math.round(activeRoute.durationSeconds * ratio)
  }, [remainingDistanceMeters, activeRoute])

  // Voice toggle
  const toggleVoiceMute = () => {
    const nextVal = !voiceMuted
    setVoiceMuted(nextVal)
    voiceGuidance.setEnabled(!nextVal)
    if (!nextVal) {
      voiceGuidance.speak('Voice navigation enabled.')
    }
  }

  // Copy Security PIN
  const handleCopyOtp = (code: string) => {
    navigator.clipboard?.writeText(code)
    setCopiedOtp(true)
    setTimeout(() => setCopiedOtp(false), 2000)
  }

  // Route bounds for overview
  const routeBounds = useMemo(() => {
    if (!activeRoute || activeRoute.coordinates.length < 2) return null
    return L.latLngBounds(activeRoute.coordinates).pad(0.18)
  }, [activeRoute])

  const destinationPin = destination.position
  const originPin = origin.position

  return (
    <div
      className={cn(
        'flex flex-col bg-neutral-950 text-white select-none overflow-hidden font-sans transition-all duration-300',
        isFullscreen
          ? 'fixed inset-0 z-[1000]'
          : 'absolute inset-0 z-[600] rounded-none sm:rounded-[36px]'
      )}
    >
      {/* 1. TOP GREEN INSTRUCTION PANEL (Google Maps Navigation Style) */}
      <header className="relative z-[500] w-full bg-[#055a33] text-white shadow-2xl transition-all">
        {/* Safe-area padding for mobile notch */}
        <div className="pt-2 sm:pt-3 px-4 pb-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            {/* Maneuver Big Direction & Distance */}
            <div className="flex items-center gap-3.5 sm:gap-5 min-w-0 flex-1">
              <div className="flex size-14 sm:size-16 shrink-0 items-center justify-center rounded-2xl bg-[#033b21] shadow-inner border border-white/10">
                <ManeuverIcon
                  maneuver={currentStep?.maneuver || 'straight'}
                  className="size-9 sm:size-10 text-white drop-shadow"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-white">
                    {formatDistance(distanceToNextManeuver)}
                  </span>
                  {deliveryDetails?.isGreenCorridor && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-200 uppercase border border-emerald-300/30">
                      <Siren className="size-2.5 animate-pulse text-emerald-300" />
                      Green Wave
                    </span>
                  )}
                </div>

                <h1 className="truncate text-base sm:text-lg font-bold text-white drop-shadow-sm mt-0.5">
                  {currentStep?.instruction || `Head to ${destination.short}`}
                </h1>

                <p className="truncate text-xs font-semibold text-emerald-100/90">
                  {currentStep?.roadName ? `on ${currentStep.roadName}` : destination.name}
                </p>
              </div>
            </div>

            {/* Quick Actions (Voice Mute + Fullscreen Toggle + Close) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={toggleVoiceMute}
                className={cn(
                  'flex size-10 items-center justify-center rounded-full transition-all active:scale-95 border',
                  voiceMuted
                    ? 'bg-neutral-800/80 text-neutral-400 border-white/10'
                    : 'bg-[#033b21] text-white border-emerald-400/30 shadow-md'
                )}
                title={voiceMuted ? 'Unmute voice navigation' : 'Mute voice navigation'}
                aria-label="Voice toggle"
              >
                {voiceMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5 text-emerald-300" />}
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                className="flex size-10 items-center justify-center rounded-full bg-neutral-900/80 text-white/90 border border-white/15 transition-all hover:bg-neutral-800 active:scale-95"
                title={isFullscreen ? 'Fit inside phone frame' : 'Expand to full screen'}
                aria-label="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="flex size-10 items-center justify-center rounded-full bg-neutral-900/80 text-white/90 border border-white/15 transition-all hover:bg-neutral-800 active:scale-95"
                title="Exit navigation"
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* Sub-strip: Next-Next Maneuver Preview ("Then...") */}
          {nextStep && (
            <div className="mt-2.5 flex items-center gap-2 border-t border-white/15 pt-2 text-xs font-semibold text-emerald-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Then</span>
              <ManeuverIcon maneuver={nextStep.maneuver} className="size-4 shrink-0 text-white" />
              <span className="truncate">
                {nextStep.instruction} ({formatDistance(nextStep.distanceMeters)})
              </span>
            </div>
          )}
        </div>

        {/* Dynamic Status / Rerouting Banner */}
        {isRerouting && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 py-1.5 px-4 text-xs font-bold text-neutral-950 shadow-md">
            <RefreshCw className="size-3.5 animate-spin" />
            <span>Off route detected • Recalculating emergency corridor...</span>
          </div>
        )}

        {routingError && (
          <div className="flex items-center justify-between gap-2 bg-rose-600 py-1.5 px-4 text-xs font-bold text-white shadow-md">
            <span>⚠️ {routingError}</span>
            <button
              type="button"
              onClick={() => fetchRoute(smoothedVehiclePosition, destination.position)}
              className="rounded bg-white/20 px-2 py-0.5 text-[10px] hover:bg-white/30"
            >
              Retry
            </button>
          </div>
        )}
      </header>

      {/* 2. FULL-SCREEN INTERACTIVE DARK NAVIGATION MAP */}
      <div className="relative flex-1 w-full overflow-hidden">
        {isLoadingRoute ? (
          <div className="absolute inset-0 z-[400] flex flex-col items-center justify-center bg-neutral-950/90 backdrop-blur-sm">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <RefreshCw className="size-7 animate-spin" />
            </div>
            <p className="mt-3 text-sm font-bold text-neutral-200">Generating Optimal Medical Road Corridor...</p>
            <p className="text-xs text-neutral-400">OSRM Road Geometry & Traffic Preemption</p>
          </div>
        ) : null}

        <MapContainer
          center={smoothedVehiclePosition}
          zoom={17}
          zoomControl={false}
          scrollWheelZoom
          attributionControl={false}
          className="size-full bg-[#121619]"
        >
          {/* Active map layer: Real Streets / Satellite / Dark Tactical */}
          <TileLayer
            key={MAP_LAYERS[navMapLayer].id}
            url={MAP_LAYERS[navMapLayer].url}
            attribution={MAP_LAYERS[navMapLayer].attribution}
            className={MAP_LAYERS[navMapLayer].className}
            maxZoom={MAP_LAYERS[navMapLayer].maxZoom}
          />

          <MapController
            center={smoothedVehiclePosition}
            zoom={17}
            followVehicle={isTrackingMode}
            bounds={!isTrackingMode ? routeBounds : null}
            onUserDrag={() => setIsTrackingMode(false)}
          />

          {/* Alternative Routes (distinguishable slate / gray-blue) */}
          {alternativeRoutes.map((alt) => (
            <Polyline
              key={alt.id}
              positions={alt.coordinates}
              pathOptions={{
                color: '#64748b',
                weight: 6,
                opacity: 0.6,
                dashArray: '4 8',
              }}
              eventHandlers={{
                click: () => {
                  setActiveRoute(alt)
                  setAlternativeRoutes((prev) => [activeRoute!, ...prev.filter((r) => r.id !== alt.id)])
                },
              }}
            />
          ))}

          {/* Active Primary Route: Multi-layer Google Maps Blue Corridor */}
          {activeRoute && (
            <>
              {/* Outer Glow */}
              <Polyline
                positions={activeRoute.coordinates}
                pathOptions={{
                  color: deliveryDetails?.isGreenCorridor ? '#059669' : '#2563eb',
                  weight: 12,
                  opacity: 0.35,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Core Solid Blue / Green Line */}
              <Polyline
                positions={activeRoute.coordinates}
                pathOptions={{
                  color: deliveryDetails?.isGreenCorridor ? '#10b981' : '#3b82f6',
                  weight: 6,
                  opacity: 0.95,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            </>
          )}

          {/* Origin Marker */}
          <Marker position={originPin} icon={createOriginIcon(origin.short)} zIndexOffset={300} />

          {/* Destination Marker */}
          <Marker position={destinationPin} icon={createDestinationIcon(destination.short)} zIndexOffset={400} />

          {/* Dynamic Vehicle Marker with Heading & Pulsing Glow */}
          <Marker
            position={smoothedVehiclePosition}
            icon={createVehicleIcon(vehicleHeading, deliveryDetails?.isGreenCorridor)}
            zIndexOffset={1000}
          />
        </MapContainer>

        {/* 3. FLOATING HUD CONTROLS */}
        {/* Recenter Button (shows when user pans away) */}
        {!isTrackingMode && (
          <button
            type="button"
            onClick={() => setIsTrackingMode(true)}
            className="absolute bottom-32 left-4 z-[500] flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-xl transition-all hover:bg-emerald-700 active:scale-95 border border-emerald-400/40"
          >
            <LocateFixed className="size-4 animate-pulse text-white" />
            <span>Recenter Vehicle</span>
          </button>
        )}

        {/* Right Floating Controls Cluster */}
        <div className="absolute right-3.5 top-4 z-[500] flex flex-col gap-2">
          {/* Overview / Vehicle Follow Toggle */}
          <button
            type="button"
            onClick={() => setIsTrackingMode((prev) => !prev)}
            className={cn(
              'flex size-11 items-center justify-center rounded-2xl backdrop-blur-md transition-all active:scale-95 shadow-lg border',
              isTrackingMode
                ? 'bg-neutral-900/85 text-emerald-400 border-emerald-500/30'
                : 'bg-emerald-600 text-white border-white/20'
            )}
            title={isTrackingMode ? 'View full route overview' : 'Follow moving vehicle'}
          >
            {isTrackingMode ? <Navigation className="size-5 fill-white" /> : <Layers className="size-5" />}
          </button>

          {/* Map Layer Switcher: Street / Satellite / Dark */}
          <button
            type="button"
            onClick={() =>
              setNavMapLayer((prev) => (prev === 'streets' ? 'satellite' : prev === 'satellite' ? 'dark' : 'streets'))
            }
            className="flex size-11 items-center justify-center rounded-2xl bg-neutral-900/85 text-emerald-400 backdrop-blur-md border border-white/10 shadow-lg active:scale-95"
            title={`Switch Map View (Current: ${MAP_LAYERS[navMapLayer].name})`}
          >
            <Layers className="size-5" />
          </button>

          {/* Alternative Routes Switcher */}
          {alternativeRoutes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAlternativesModal(true)}
              className="flex size-11 items-center justify-center rounded-2xl bg-neutral-900/85 text-white backdrop-blur-md border border-white/10 shadow-lg active:scale-95"
              title="Alternative routes"
            >
              <RotateCcw className="size-5 text-neutral-300" />
            </button>
          )}

          {/* Report Road Issue (Traffic, police, blockage) */}
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="flex size-11 items-center justify-center rounded-2xl bg-neutral-900/85 text-amber-400 backdrop-blur-md border border-white/10 shadow-lg active:scale-95"
            title="Report road hazard / traffic"
          >
            <AlertTriangle className="size-5" />
          </button>

          {/* Maneuver Steps List Toggle */}
          <button
            type="button"
            onClick={() => setShowStepList((prev) => !prev)}
            className="flex size-11 items-center justify-center rounded-2xl bg-neutral-900/85 text-white backdrop-blur-md border border-white/10 shadow-lg active:scale-95"
            title="Turn-by-turn list"
          >
            <List className="size-5 text-neutral-300" />
          </button>
        </div>

        {/* Left Floating Info & Dev Simulator Toggle */}
        <div className="absolute left-3.5 top-4 z-[500] flex flex-col gap-2">
          {/* GPS Status Indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-neutral-900/85 px-3 py-1.5 text-[11px] font-bold text-neutral-200 backdrop-blur-md border border-white/10 shadow-lg">
            <span
              className={cn(
                'size-2 rounded-full',
                gpsStatus === 'locked'
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : gpsStatus === 'simulated'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500 animate-ping'
              )}
            />
            <span>
              {gpsStatus === 'locked'
                ? `GPS ±${Math.round(gpsAccuracy)}m`
                : gpsStatus === 'simulated'
                ? '🧪 Dev Sim Active'
                : 'Searching GPS...'}
            </span>
          </div>

          {/* Test / Dev Simulation Control Bar */}
          <div className="flex flex-col gap-1 rounded-2xl bg-neutral-900/90 p-2 text-xs backdrop-blur-md border border-white/10 shadow-xl max-w-[210px]">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <Sparkles className="size-2.5" />
                Dev Simulator
              </span>
              <span className="text-[9px] text-neutral-400">Road Testing</span>
            </div>

            <div className="flex items-center gap-1 mt-1">
              {!simPlaying ? (
                <button
                  type="button"
                  onClick={startDevSimulation}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-1 px-2 text-[10px] font-bold text-white hover:bg-emerald-700 active:scale-95"
                  title="Simulate driving along actual road network"
                >
                  <Play className="size-3 fill-white" />
                  <span>Start Sim</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pauseDevSimulation}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-amber-600 py-1 px-2 text-[10px] font-bold text-white hover:bg-amber-700 active:scale-95"
                >
                  <Pause className="size-3 fill-white" />
                  <span>Pause</span>
                </button>
              )}

              {/* Speed toggle */}
              <button
                type="button"
                onClick={() => setSimSpeedMultiplier((m) => (m === 1 ? 2 : m === 2 ? 4 : 1))}
                className="rounded-lg bg-neutral-800 px-2 py-1 text-[10px] font-mono font-bold text-neutral-300 border border-white/10"
                title="Simulation speed multiplier"
              >
                {simSpeedMultiplier}x
              </button>
            </div>

            {/* Deviation Test Button */}
            <button
              type="button"
              onClick={triggerDevDeviation}
              className="mt-1 flex items-center justify-center gap-1 rounded-lg bg-rose-950/60 border border-rose-500/30 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-900/50 active:scale-95"
              title="Artificially inject a 120m off-route jump to verify automatic rerouting detection"
            >
              <FastForward className="size-2.5" />
              <span>Test Auto-Reroute</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. EXPANDABLE TURN-BY-TURN MANEUVER SHEET */}
      {showStepList && activeRoute && (
        <div className="absolute inset-x-0 bottom-24 top-24 z-[700] mx-auto max-w-lg overflow-hidden rounded-3xl bg-neutral-900/95 p-4 shadow-2xl backdrop-blur-md border border-white/15 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white">Turn-by-Turn Route Steps</h2>
              <p className="text-xs text-neutral-400">
                {activeRoute.name} • {formatDistance(remainingDistanceMeters)} remaining
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowStepList(false)}
              className="rounded-full bg-neutral-800 p-1.5 text-neutral-300 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="no-scrollbar mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1">
            {activeRoute.steps.map((st, idx) => {
              const isPast = idx < currentStepIndex
              const isCurrent = idx === currentStepIndex
              return (
                <div
                  key={st.id}
                  className={cn(
                    'flex items-start gap-3 rounded-2xl p-3 text-xs transition-all border',
                    isCurrent
                      ? 'bg-[#055a33]/60 border-emerald-500/50 text-white shadow-md'
                      : isPast
                      ? 'bg-neutral-900/40 border-white/5 text-neutral-500 line-through'
                      : 'bg-neutral-800/40 border-white/10 text-neutral-300'
                  )}
                >
                  <div
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-xl',
                      isCurrent ? 'bg-emerald-500 text-white' : 'bg-neutral-800 text-neutral-400'
                    )}
                  >
                    <ManeuverIcon maneuver={st.maneuver} className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{st.instruction}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{st.roadName}</p>
                  </div>
                  <span className="font-mono font-bold text-[11px] text-neutral-400 shrink-0">
                    {formatDistance(st.distanceMeters)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5. ALTERNATIVE ROUTES MODAL */}
      {showAlternativesModal && (
        <div className="absolute inset-0 z-[800] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-neutral-900 p-5 border border-white/15 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white">Select Road Corridor</h3>
              <button
                type="button"
                onClick={() => setShowAlternativesModal(false)}
                className="rounded-full bg-neutral-800 p-1 text-neutral-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {[activeRoute, ...alternativeRoutes].filter(Boolean).map((rt, i) => {
                const isSelected = rt?.id === activeRoute?.id
                return (
                  <button
                    key={rt!.id}
                    type="button"
                    onClick={() => {
                      if (rt) {
                        setActiveRoute(rt)
                        setShowAlternativesModal(false)
                        voiceGuidance.speak(`Switched to ${rt.name}`)
                      }
                    }}
                    className={cn(
                      'w-full flex items-center justify-between rounded-2xl p-3 text-left transition-all border',
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/40 text-white'
                        : 'border-white/10 bg-neutral-800/40 text-neutral-300 hover:border-white/20'
                    )}
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{rt!.name}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {formatDuration(rt!.durationSeconds)} • {formatDistance(rt!.distanceMeters)}
                      </p>
                    </div>
                    {isSelected && <Check className="size-4 text-emerald-400" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. REPORT ROAD ISSUE MODAL */}
      {showReportModal && (
        <div className="absolute inset-0 z-[800] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-neutral-900 p-5 border border-white/15 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Report Road Condition</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded-full bg-neutral-800 p-1 text-neutral-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false)
                  voiceGuidance.speak('Traffic congestion reported. Requesting police green corridor priority.')
                }}
                className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-neutral-800/60 p-3 text-center hover:bg-neutral-800 active:scale-95"
              >
                <span className="text-xl">🚗🚙</span>
                <span className="mt-1 text-xs font-bold text-white">Heavy Traffic</span>
                <span className="text-[10px] text-neutral-400">Request Clearance</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false)
                  triggerDevDeviation()
                }}
                className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-neutral-800/60 p-3 text-center hover:bg-neutral-800 active:scale-95"
              >
                <span className="text-xl">🚧</span>
                <span className="mt-1 text-xs font-bold text-white">Road Blocked</span>
                <span className="text-[10px] text-neutral-400">Trigger Reroute</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false)
                  voiceGuidance.speak('Green wave signal priority confirmed with Chennai Traffic Command.')
                }}
                className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-center hover:bg-emerald-950/50 active:scale-95"
              >
                <span className="text-xl">🚦</span>
                <span className="mt-1 text-xs font-bold text-emerald-300">Signal Priority</span>
                <span className="text-[10px] text-emerald-400/80">Green Wave Ready</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false)
                  voiceGuidance.speak('Emergency transit issue reported.')
                }}
                className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-neutral-800/60 p-3 text-center hover:bg-neutral-800 active:scale-95"
              >
                <span className="text-xl">⚠️</span>
                <span className="mt-1 text-xs font-bold text-white">Other Hazard</span>
                <span className="text-[10px] text-neutral-400">Log Event</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. BOTTOM NAVIGATION PANEL (Google Maps Navigation Style) */}
      <footer className="relative z-[500] w-full bg-neutral-900 border-t border-white/10 px-4 py-3 sm:px-6 shadow-[0_-8px_30px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between gap-3">
          {/* Main ETA & Distance Display */}
          <div className="flex items-baseline gap-3">
            {/* Big Green Duration */}
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black text-emerald-400 tabular-nums tracking-tight">
                {formatDuration(remainingDurationSeconds)}
              </span>
            </div>

            {/* Distance & ETA Clock */}
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-neutral-400">
              <span>•</span>
              <span className="tabular-nums font-bold text-neutral-200">
                {formatDistance(remainingDistanceMeters)}
              </span>
              <span>•</span>
              <span className="font-bold text-neutral-200">
                ETA {formatEtaClock(remainingDurationSeconds)}
              </span>
            </div>
          </div>

          {/* Stop / Exit Navigation Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition-all hover:bg-rose-700 active:scale-95"
              title="Stop navigation"
              aria-label="Exit navigation"
            >
              <X className="size-6 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* Jeevan Blood Delivery Telemetry Strip & PIN Handshake */}
        {deliveryDetails && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-coral-strong px-2 py-0.5 font-black text-white text-[10px]">
                {deliveryDetails.bloodGroup} {deliveryDetails.component}
              </span>
              <span className="text-neutral-400">
                To <strong className="text-neutral-200">{destination.short}</strong>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-cyan-400">
                <ThermometerSnowflake className="size-3" />
                3.8°C Safe
              </span>
            </div>

            {/* Handshake PIN & Custody Button */}
            <div className="flex items-center gap-2">
              {deliveryDetails.lockId && (
                <button
                  type="button"
                  onClick={() => handleCopyOtp(otpForLock(deliveryDetails.lockId || null))}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold text-neutral-200 hover:bg-white/20 active:scale-95"
                  title="Click to copy security handshake PIN"
                >
                  <KeyRound className="size-3 text-emerald-400" />
                  <span>PIN: {otpForLock(deliveryDetails.lockId || null)}</span>
                  {copiedOtp ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                </button>
              )}

              {onCompleteDelivery && (
                <button
                  type="button"
                  onClick={onCompleteDelivery}
                  className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white hover:bg-emerald-700 active:scale-95 shadow-sm"
                >
                  <CheckCircle2 className="size-3" />
                  <span>Release Custody</span>
                </button>
              )}
            </div>
          </div>
        )}
      </footer>
    </div>
  )
}
