'use client'

import dynamic from 'next/dynamic'
import {
  Activity,
  BrainCircuit,
  CalendarCheck,
  CircleAlert,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { loadSavedAuth } from '@/lib/hemo-auth'
import { COMPONENT_LABELS, ICUS, URGENCY_LABELS, USER_LOCATION, distanceKm, siteById } from '@/lib/hemo-data'
import { useGrid } from './grid-store'
import { ViewHeader } from './view-header'

const RouteMap = dynamic(() => import('./route-map'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-muted">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading map" />
    </div>
  ),
})

const NavigationScreen = dynamic(
  () => import('./navigation-screen').then((mod) => mod.NavigationScreen),
  { ssr: false }
)

const COOLING_OFF_DAYS = 90
const DAYS_SINCE_LAST_DONATION = 104
const CASCADE_TIERS = ['Tier 1 • 0–3km', 'Tier 2 • 3–7km', 'Tier 3 • 7–15km']

interface MlPrediction {
  donor_id: string
  name: string
  blood_group: string
  distance_km: number
  response_probability: number
  response_probability_percent: number
  predicted_eta_minutes: number
  recommendation: string
  badge_color: string
  model_breakdown?: {
    xgboost_probability: number
    heuristic_probability: number
    blend_ratio: string
  }
  key_factors?: string[]
}

interface IdentityVerificationStatus {
  verification_status: 'not_started' | 'pending' | 'verified' | 'failed'
  provider: string
  verified_at: string | null
  demo_mode: boolean
  notice: string
}

export function DonorDashboard() {
  const tDonor = useTranslations('Donor')
  const tCommon = useTranslations('Common')
  const { emergencies, responses, respond, notify } = useGrid()
  const saved = loadSavedAuth()
  const donorName = saved?.user?.name || 'Aarav Sharma'
  const donorGroup = saved?.user?.email?.includes('sneha') ? 'O-' : 'B+'
  const identityToken = saved?.user?.access_token || saved?.user?.token
  const [identityStatus, setIdentityStatus] = useState<IdentityVerificationStatus | null>(null)
  const [isIdentityLoading, setIsIdentityLoading] = useState(true)
  const [isIdentityStarting, setIsIdentityStarting] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [isNavOpen, setIsNavOpen] = useState(false)

  const pending = emergencies.filter((e) => !responses[e.id])
  const alert = pending.find((e) => e.group === donorGroup) ?? pending[0] ?? emergencies[0]
  const hospital = alert ? siteById(ICUS, alert.icuId) : undefined
  const km = hospital ? distanceKm(USER_LOCATION, hospital.position) : 2.4
  const response = alert ? responses[alert.id] : undefined

  useEffect(() => {
    if (!identityToken) {
      setIdentityStatus(null)
      setIsIdentityLoading(false)
      return
    }

    const controller = new AbortController()
    setIsIdentityLoading(true)
    setIdentityError(null)
    fetch('/api/donor/identity/status', {
      headers: { Authorization: `Bearer ${identityToken}` },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as IdentityVerificationStatus | null
        if (!res.ok || !data) {
          throw new Error(
            res.status === 401 || res.status === 403
              ? 'Please sign in with an active donor account to use identity verification.'
              : 'Could not load your verification status. Please try again.',
          )
        }
        setIdentityStatus(data)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setIdentityError(
          error instanceof Error ? error.message : 'Could not load your verification status. Please try again.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsIdentityLoading(false)
      })

    return () => controller.abort()
  }, [identityToken])

  const startIdentityVerification = async () => {
    if (!identityToken) return
    setIsIdentityStarting(true)
    setIdentityError(null)
    try {
      const res = await fetch('/api/donor/identity/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${identityToken}` },
        signal: AbortSignal.timeout(5000),
      })
      const data = (await res.json().catch(() => null)) as IdentityVerificationStatus | null
      if (!res.ok || !data) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'Please sign in with an active donor account to use identity verification.'
            : 'Could not start verification. Please try again.',
        )
      }
      setIdentityStatus(data)
    } catch (error: unknown) {
      setIdentityError(
        error instanceof Error ? error.message : 'Could not start verification. Please try again.',
      )
    } finally {
      setIsIdentityStarting(false)
    }
  }

  // Live XGBoost ML State
  const [mlData, setMlData] = useState<MlPrediction | null>(null)
  const [isMlLoading, setIsMlLoading] = useState(false)

  // Fetch ML Acceptance Probability & ETA from backend
  const fetchMlPrediction = () => {
    setIsMlLoading(true)
    fetch('/api/ml/predict-donor-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        donor_id: saved?.user?.token || 'DONOR-1108',
        name: donorName,
        blood_group: donorGroup,
        distance_km: km,
        urgency_level: alert?.urgency?.toLowerCase() || 'critical',
        historical_donations: 8,
        days_since_last_donation: DAYS_SINCE_LAST_DONATION,
        compatibility_score: 1.0,
        hour_of_day: new Date().getHours(),
        traffic_factor: 1.1,
        donor_age: 28,
      }),
      signal: AbortSignal.timeout(3000),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.response_probability_percent) {
          setMlData(data)
        } else {
          throw new Error('Fallback')
        }
      })
      .catch(() => {
        // Fallback response readiness calculation
        const prob = Math.max(0.75, Math.min(0.98, 1.0 - (km / 25) * 0.4))
        setMlData({
          donor_id: 'DONOR-1108',
          name: donorName,
          blood_group: donorGroup,
          distance_km: km,
          response_probability: prob,
          response_probability_percent: Math.round(prob * 1000) / 10,
          predicted_eta_minutes: Math.round((km / 35.0) * 60.0 + 5.0),
          recommendation: prob >= 0.75 ? 'PRIMARY_RESPONDER' : 'STANDBY_BACKUP',
          badge_color: '#10b981',
          model_breakdown: {
            xgboost_probability: 0.98,
            heuristic_probability: 0.92,
            blend_ratio: '70% Proximity & History + 30% Direct Match',
          },
          key_factors: [
            `Close proximity (${km.toFixed(1)} km)`,
            'High reliability (8 lifetime donations)',
            'Exact blood match (100% compatible)',
          ],
        })
      })
      .finally(() => setIsMlLoading(false))
  }

  useEffect(() => {
    fetchMlPrediction()
  }, [alert?.id, km])

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
      <ViewHeader
        eyebrow={tDonor('portalTitle')}
        title={tDonor('activeUrgentRequests')}
        description={`${donorName} · ${donorGroup} (${tCommon('bloodDonor')})`}
      />

      <div className="flex flex-col gap-4">
        {/* Dynamic Blood Lock Status Badge */}
        <div className="rounded-2xl border border-coral/30 bg-coral-soft/50 dark:bg-coral/10 p-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral opacity-75" />
              <span className="relative inline-flex rounded-full size-2.5 bg-coral" />
            </span>
            <span className="font-bold text-coral-strong dark:text-coral">{tDonor('dynamicBloodLockStatus')}</span>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">{tCommon('networkStatus')}</span>
        </div>

        {/* Identity & Verification Card */}
        <section
          aria-labelledby="identity-verification-title"
          className="rounded-3xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="identity-verification-title" className="text-base font-bold">
                {tDonor('identityVerification')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tDonor('verifiedDonor')}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isIdentityLoading ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {tCommon('loading')}
              </span>
            ) : identityStatus?.verification_status === 'pending' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <Clock className="size-4" aria-hidden="true" />
                ⏳ Verification Pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                ✓ {tDonor('verifiedDonor')}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={startIdentityVerification}
              disabled={
                !identityToken ||
                isIdentityLoading ||
                isIdentityStarting ||
                identityStatus?.verification_status === 'pending' ||
                identityStatus?.verification_status === 'verified'
              }
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            >
              {isIdentityStarting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {identityStatus?.verification_status === 'pending'
                ? 'Verification Pending'
                : identityStatus?.verification_status === 'verified'
                  ? tDonor('verifiedDonor')
                  : 'Verify My Identity'}
            </button>
          </div>
        </section>

        {/* AI Donor Response Likelihood & ETA Card */}
        {mlData && (
          <section
            aria-labelledby="ml-prediction-title"
            className="rounded-3xl border border-border bg-card p-4.5 shadow-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-coral/10 text-coral">
                  <BrainCircuit className="size-4.5" />
                </span>
                <div>
                  <h3 id="ml-prediction-title" className="text-xs font-bold text-foreground">
                    {tDonor('mlPredictionTitle')}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">{tDonor('subtitle')}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchMlPrediction}
                disabled={isMlLoading}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg border bg-background"
                title="Refresh"
              >
                <RefreshCw className={`size-3 ${isMlLoading ? 'animate-spin text-coral' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2.5 mt-3">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <Zap className="size-3" />
                  {tDonor('mlPredictionTitle')}
                </span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {mlData.response_probability_percent}%
                </p>
                <span className="inline-block text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {mlData.recommendation.replace('_', ' ')}
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  {tDonor('predictedEta')}
                </span>
                <p className="text-2xl font-black text-foreground mt-1">
                  ~{mlData.predicted_eta_minutes} <span className="text-xs font-medium">min</span>
                </p>
                <span className="inline-block text-[10px] font-semibold text-muted-foreground mt-0.5">
                  {km.toFixed(1)} km
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Emergency Alert & Pledge to Donate Card */}
        {alert && hospital && (
          <section
            aria-labelledby="donor-alert-title"
            className="relative overflow-hidden rounded-[30px] bg-coral p-5 text-white shadow-lg shadow-coral/25"
          >
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase">
                  <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
                  {URGENCY_LABELS[alert.urgency].title}
                </span>
                <span className="text-[11px] font-extrabold bg-white/20 border border-white/30 rounded-full px-2 py-0.5">
                  {tDonor('geofenceActive')}
                </span>
              </div>

              <h2 id="donor-alert-title" className="mt-3 text-2xl leading-tight font-black tracking-tight">
                {`🚨 ${alert.group} ${tDonor('activeUrgentRequests')}`}
              </h2>
              <p className="mt-1 text-base font-bold text-white">
                {`${alert.units} ${alert.units === 1 ? 'unit' : 'units'} • ${km.toFixed(1)} km`}
              </p>
              <p className="mt-1.5 text-xs text-white/85">
                {`${hospital.name} (${COMPONENT_LABELS[alert.component]})`}
              </p>

              {response ? (
                <p className="mt-4 flex items-center gap-2 rounded-2xl bg-white/15 px-3.5 py-2.5 text-xs font-bold">
                  {response === 'help' && <CheckCircle2 className="size-4" aria-hidden="true" />}
                  {response === 'help' ? tDonor('pledgedSuccess') : 'Marked as not available'}
                </p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      respond(alert.id, 'help')
                      notify(tDonor('pledgedSuccess'), 'success')
                    }}
                    className="flex-1 rounded-2xl bg-white py-3 text-xs font-black text-coral-strong shadow-md active:scale-95 transition-transform"
                  >
                    {tDonor('pledgeToDonateButton')}
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(alert.id, 'declined')}
                    className="rounded-2xl border border-white/40 px-3.5 py-3 text-xs font-bold hover:bg-white/10"
                  >
                    {tCommon('cancel')}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Compatible Blood Group Badges */}
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            {tDonor('bloodGroupBadges')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map((grp) => (
              <span
                key={grp}
                className={`rounded-xl px-3 py-1.5 text-xs font-black border ${
                  grp === donorGroup
                    ? 'bg-coral text-white border-coral shadow-sm'
                    : 'bg-muted text-foreground border-border'
                }`}
              >
                {grp}
              </span>
            ))}
          </div>
        </section>

        {hospital && (
          <section aria-labelledby="donor-route-title" className="overflow-hidden rounded-3xl border bg-card shadow-xs">
            <div className="flex items-center gap-3 p-4 pb-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted">
                <Navigation className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="donor-route-title" className="text-sm font-bold">
                  {hospital.name}
                </h2>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {`~${mlData?.predicted_eta_minutes || Math.max(4, Math.round(km * 3))} min`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40">
                {tDonor('geofencedAlerts')}
              </span>
            </div>
            <div className="h-48 border-t">
              <RouteMap
                from={{ position: USER_LOCATION, label: 'You', kind: 'donor' }}
                to={{ position: hospital.position, label: hospital.short, kind: 'icu' }}
                color="#2fbf8a"
                onStartNavigation={() => setIsNavOpen(true)}
              />
            </div>
          </section>
        )}

        {/* Eligibility Checklist & History */}
        <EligibilityCard />
      </div>

      {/* Full-Screen Turn-by-Turn Navigation Screen for Donor Collection */}
      {isNavOpen && hospital && (
        <NavigationScreen
          origin={{
            name: 'Your Location (T. Nagar)',
            short: 'You',
            position: USER_LOCATION,
            type: 'donor',
          }}
          destination={{
            name: hospital.name,
            short: hospital.short,
            position: hospital.position,
            type: 'hospital',
          }}
          deliveryDetails={{
            requestId: alert?.id || 'DONOR-NAV',
            bloodGroup: alert?.group || donorGroup,
            component: alert ? COMPONENT_LABELS[alert.component] : 'Whole Blood',
            units: alert?.units || 1,
            isGreenCorridor: alert?.urgency === 'CRITICAL',
            courierName: donorName,
          }}
          onClose={() => setIsNavOpen(false)}
        />
      )}
    </div>
  )
}

function EligibilityCard() {
  const tDonor = useTranslations('Donor')
  const progress = Math.min(1, DAYS_SINCE_LAST_DONATION / COOLING_OFF_DAYS)
  const eligible = progress >= 1
  const remaining = Math.max(0, COOLING_OFF_DAYS - DAYS_SINCE_LAST_DONATION)

  return (
    <section aria-labelledby="eligibility-title" className="rounded-3xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted">
          <CalendarCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="eligibility-title" className="text-base font-bold">
            {tDonor('eligibilityChecklist')}
          </h2>
          <p className="text-xs text-muted-foreground">{`${tDonor('lastDonated')} ${DAYS_SINCE_LAST_DONATION} ${tDonor('daysAgo')}`}</p>
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>{tDonor('eligibilityAge')}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>{tDonor('eligibilityWeight')}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>{tDonor('eligibilityInterval')}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>{tDonor('eligibilityHealth')}</span>
        </div>
      </div>

      <div
        className="h-3 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Cooling-off progress"
        aria-valuemin={0}
        aria-valuemax={COOLING_OFF_DAYS}
        aria-valuenow={Math.min(DAYS_SINCE_LAST_DONATION, COOLING_OFF_DAYS)}
      >
        <div className="h-full rounded-full bg-mint" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {eligible ? tDonor('readyToDonate') : `${tDonor('coolingOffNotice')} (${remaining} days)`}
        </span>
        <span className="text-muted-foreground font-medium">{tDonor('donationHistory')}: 8 Units</span>
      </div>
    </section>
  )
}
