'use client'

import dynamic from 'next/dynamic'
import { CalendarCheck, CheckCircle2, Loader2, MapPin, Navigation } from 'lucide-react'
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
const DONOR_GROUP = 'B+'
const CASCADE_TIERS = ['Tier 1 • 0–3km', 'Tier 2 • 3–7km', 'Tier 3 • 7–15km']

export function DonorDashboard() {
  const { emergencies, responses, respond, notify } = useGrid()
  const pending = emergencies.filter((e) => !responses[e.id])
  const alert = pending.find((e) => e.group === DONOR_GROUP) ?? pending[0] ?? emergencies[0]
  const hospital = alert ? siteById(ICUS, alert.icuId) : undefined
  const km = hospital ? distanceKm(USER_LOCATION, hospital.position) : 0
  const response = alert ? responses[alert.id] : undefined

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
      <ViewHeader
        eyebrow="Volunteer portal"
        title="Your blood can save a life today"
        description={`Registered donor · ${DONOR_GROUP}`}
      />

      <div className="flex flex-col gap-5">
        {alert && hospital && (
          <section
            aria-labelledby="donor-alert-title"
            className="relative overflow-hidden rounded-[30px] bg-coral p-6 text-white shadow-[0_18px_40px_-18px_rgba(232,82,74,0.7)]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-20 size-56 rounded-full border-[30px] border-white/10"
            />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-wide uppercase">
                <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
                {URGENCY_LABELS[alert.urgency].title} alert
              </span>
              <h2 id="donor-alert-title" className="mt-4 text-[26px] leading-tight font-extrabold tracking-tight text-balance">
                {`🚨 ${alert.group} blood needed`}
              </h2>
              <p className="mt-1 text-lg font-bold text-white">
                {`${alert.units} ${alert.units === 1 ? 'unit' : 'units'} • ${km.toFixed(1)} km away`}
              </p>
              <p className="mt-2 text-base text-white/85">
                {`${hospital.name} needs ${COMPONENT_LABELS[alert.component].toLowerCase()}.`}
              </p>

              {response ? (
                <p className="mt-5 flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-sm font-semibold">
                  {response === 'help' && <CheckCircle2 className="size-4" aria-hidden="true" />}
                  {response === 'help' ? 'You are on your way. The hospital has been notified.' : 'Marked as not available'}
                </p>
              ) : (
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      respond(alert.id, 'help')
                      notify(`Thank you! ${hospital.short} knows you are coming.`, 'success')
                    }}
                    className="flex-1 rounded-2xl bg-white py-3.5 text-base font-extrabold text-coral-strong shadow-lg"
                  >
                    Yes, I can help
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(alert.id, 'declined')}
                    className="rounded-2xl border border-white/40 px-4 py-3.5 text-base font-semibold hover:bg-white/10"
                  >
                    Not available
                  </button>
                </div>
              )}

              <ul aria-label="Donor cascade tiers" className="mt-4 flex flex-wrap gap-2">
                {CASCADE_TIERS.map((tier) => (
                  <li
                    key={tier}
                    className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold"
                  >
                    {tier}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {hospital && (
          <section aria-labelledby="donor-route-title" className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="flex items-center gap-3 p-5 pb-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted">
                <Navigation className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="donor-route-title" className="text-lg font-bold">
                  Route to hospital
                </h2>
                <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {`${hospital.name} · ~${Math.max(4, Math.round(km * 3))} min`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Geofenced
              </span>
            </div>
            <div className="h-56 border-t">
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
