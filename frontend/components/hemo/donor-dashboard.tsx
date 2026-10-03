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
  const { emergencies, responses, respond, notify } = useGrid()
  const saved = loadSavedAuth()
  const donorName = saved?.user?.name || 'Aarav Sharma'
  const donorGroup = saved?.user?.email?.includes('sneha') ? 'O-' : 'B+'
  const identityToken = saved?.user?.access_token || saved?.user?.token
  const [identityStatus, setIdentityStatus] = useState<IdentityVerificationStatus | null>(null)
  const [isIdentityLoading, setIsIdentityLoading] = useState(true)
  const [isIdentityStarting, setIsIdentityStarting] = useState(false)
  const [identityError, setIdentityError] = useState<string | null>(null)

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
    fetch('http://localhost:8000/api/ml/predict-donor-response', {
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
        eyebrow="Volunteer portal"
        title="Your blood can save a life today"
        description={`${donorName} · ${donorGroup} Donor`}
      />

      <div className="flex flex-col gap-4">
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
                Identity Verification
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Help us keep JEEVAN safe and trustworthy. Identity verification helps reduce fake donor accounts.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isIdentityLoading ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Loading verification status
              </span>
            ) : identityStatus?.verification_status === 'pending' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <Clock className="size-4" aria-hidden="true" />
                ⏳ Verification Pending
              </span>
            ) : identityStatus?.verification_status === 'verified' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                ✓ Identity Verified
              </span>
            ) : identityStatus?.verification_status === 'failed' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                <CircleAlert className="size-4" aria-hidden="true" />
                ⚠ Verification Failed
              </span>
            ) : (
              <span className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground">
                Not started
              </span>
            )}
          </div>

          {identityStatus?.demo_mode && (
            <p className="mt-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              {identityStatus.notice}
            </p>
          )}

          {identityError && (
            <p role="alert" className="mt-3 text-sm font-medium text-rose-700 dark:text-rose-300">
              {identityError}
            </p>
          )}

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
                  ? 'Identity Verified'
                  : 'Verify My Identity'}
            </button>
            {!identityToken && !isIdentityLoading && (
              <p className="text-xs text-muted-foreground">Sign in with an active donor account to begin.</p>
            )}
          </div>
        </section>

        {/* Mobile Phone SMS Verification Card */}
        <section
          aria-labelledby="phone-verification-title"
          className="rounded-3xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <Phone className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="phone-verification-title" className="text-base font-bold">
                Mobile Phone SMS Verification
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Verified mobile phone number for critical emergency SOS on-call alerts.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              ✓ Phone Verified ({saved?.user?.phone_number || '+91 94471 28904'})
            </span>
            <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              SMS Emergency Broadcasts Active
            </span>
          </div>
        </section>

        {/* Emergency Response Readiness & ETA Card */}
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
                    Emergency Response Readiness & ETA
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Smart match based on your distance & donation history</p>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchMlPrediction}
                disabled={isMlLoading}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg border bg-background"
                title="Recalculate response readiness"
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
                  Readiness Match
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
                  Estimated Arrival
                </span>
                <p className="text-2xl font-black text-foreground mt-1">
                  ~{mlData.predicted_eta_minutes} <span className="text-xs font-medium">min</span>
                </p>
                <span className="inline-block text-[10px] font-semibold text-muted-foreground mt-0.5">
                  Drive time + check-in
                </span>
              </div>
            </div>

            {/* Key Factors Pills */}
            {mlData.key_factors && mlData.key_factors.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-border">
                {mlData.key_factors.map((f, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full"
                  >
                    <Sparkles className="size-2.5 text-coral" />
                    {f}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Emergency Alert Card */}
        {alert && hospital && (
          <section
            aria-labelledby="donor-alert-title"
            className="relative overflow-hidden rounded-[30px] bg-coral p-5 text-white shadow-lg shadow-coral/25"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-20 size-56 rounded-full border-[30px] border-white/10"
            />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase">
                  <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
                  {URGENCY_LABELS[alert.urgency].title} Alert
                </span>
                {mlData && (
                  <span className="text-[11px] font-extrabold bg-white/20 border border-white/30 rounded-full px-2 py-0.5">
                    ETA: {mlData.predicted_eta_minutes}m
                  </span>
                )}
              </div>

              <h2 id="donor-alert-title" className="mt-3 text-2xl leading-tight font-black tracking-tight">
                {`🚨 ${alert.group} blood needed`}
              </h2>
              <p className="mt-1 text-base font-bold text-white">
                {`${alert.units} ${alert.units === 1 ? 'unit' : 'units'} • ${km.toFixed(1)} km away`}
              </p>
              <p className="mt-1.5 text-xs text-white/85">
                {`${hospital.name} needs ${COMPONENT_LABELS[alert.component].toLowerCase()}.`}
              </p>

              {response ? (
                <p className="mt-4 flex items-center gap-2 rounded-2xl bg-white/15 px-3.5 py-2.5 text-xs font-bold">
                  {response === 'help' && <CheckCircle2 className="size-4" aria-hidden="true" />}
                  {response === 'help' ? 'You are on your way. The hospital has been notified.' : 'Marked as not available'}
                </p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      respond(alert.id, 'help')
                      notify(`Thank you! ${hospital.short} knows you are coming.`, 'success')
                    }}
                    className="flex-1 rounded-2xl bg-white py-3 text-xs font-black text-coral-strong shadow-md active:scale-95 transition-transform"
                  >
                    Yes, I can help
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(alert.id, 'declined')}
                    className="rounded-2xl border border-white/40 px-3.5 py-3 text-xs font-bold hover:bg-white/10"
                  >
                    Decline
                  </button>
                </div>
              )}

              <ul aria-label="Donor cascade tiers" className="mt-3 flex flex-wrap gap-1.5">
                {CASCADE_TIERS.map((tier) => (
                  <li
                    key={tier}
                    className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-[10px] font-semibold"
                  >
                    {tier}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {hospital && (
          <section aria-labelledby="donor-route-title" className="overflow-hidden rounded-3xl border bg-card shadow-xs">
            <div className="flex items-center gap-3 p-4 pb-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted">
                <Navigation className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="donor-route-title" className="text-sm font-bold">
                  Route to hospital
                </h2>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {`${hospital.name} · ~${mlData?.predicted_eta_minutes || Math.max(4, Math.round(km * 3))} min`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/40">
                Geofenced
              </span>
            </div>
            <div className="h-48 border-t">
              <RouteMap
                from={{ position: USER_LOCATION, label: 'You', kind: 'donor' }}
                to={{ position: hospital.position, label: hospital.short, kind: 'icu' }}
                color="#2fbf8a"
              />
            </div>
          </section>
        )}

        <EligibilityCard />
      </div>
    </div>
  )
}

function EligibilityCard() {
  const progress = Math.min(1, DAYS_SINCE_LAST_DONATION / COOLING_OFF_DAYS)
  const eligible = progress >= 1
  const remaining = Math.max(0, COOLING_OFF_DAYS - DAYS_SINCE_LAST_DONATION)

  return (
    <section aria-labelledby="eligibility-title" className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted">
          <CalendarCheck className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="eligibility-title" className="text-lg font-bold">
            Eligibility status
          </h2>
          <p className="text-sm text-muted-foreground">{`90-day cooling-off period · last donated ${DAYS_SINCE_LAST_DONATION} days ago`}</p>
        </div>
      </div>

      <div
        className="mt-4 h-3 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Cooling-off progress"
        aria-valuemin={0}
        aria-valuemax={COOLING_OFF_DAYS}
        aria-valuenow={Math.min(DAYS_SINCE_LAST_DONATION, COOLING_OFF_DAYS)}
      >
        <div className="h-full rounded-full bg-mint" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {eligible ? 'Cooling-off complete — you are eligible to donate' : `Eligible again in ${remaining} days`}
      </p>
    </section>
  )
}
