'use client'

import { HeartHandshake, Siren } from 'lucide-react'
import { ICUS, TIERS, USER_LOCATION, distanceKm, siteById, tierFor } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

export function DonorCascadeCard() {
  const { emergencies, responses, respond, notify } = useGrid()
  const alert = emergencies.find((e) => !responses[e.id])

  if (!alert) {
    return (
      <section className="flex items-center gap-4 rounded-[30px] bg-ink p-6 text-white">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-mint">
          <HeartHandshake className="size-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-lg font-bold">No donor requests right now</p>
          <p className="mt-0.5 text-sm text-white/70">Thank you for staying ready to help.</p>
        </div>
      </section>
    )
  }

  const hospital = siteById(ICUS, alert.icuId)
  const km = hospital ? distanceKm(USER_LOCATION, hospital.position) : 0
  const tier = tierFor(km)

  return (
    <section aria-labelledby="cascade-title" className="relative overflow-hidden rounded-[30px] bg-ink p-6 text-white">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-14 -right-14 size-48 rounded-full border-[26px] border-white/5"
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2.5 text-sm font-bold tracking-[0.2em] text-rose-300 uppercase">
            <span className="size-2.5 rounded-full bg-rose-300" aria-hidden="true" />
            Donor cascade
          </p>
          <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-semibold">{tier.label}</span>
        </div>

        <h2 id="cascade-title" className="mt-5 flex items-center gap-2.5 text-[28px] leading-tight font-extrabold">
          <Siren className="size-7 shrink-0 text-coral" aria-hidden="true" />
          {`${alert.group} blood needed`}
        </h2>
        <p className="mt-2 text-base text-white/75">
          {`${alert.units} ${alert.units === 1 ? 'unit' : 'units'} · ${km.toFixed(1)} km away · Can you help?`}
        </p>
        {hospital && <p className="mt-1 text-sm text-white/55">{hospital.name}</p>}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              respond(alert.id, 'help')
              notify(`Thank you! ${hospital?.short ?? 'The hospital'} knows you are coming.`, 'success')
            }}
            className="flex-1 rounded-2xl bg-white py-4 text-base font-bold text-ink transition-transform active:scale-[0.98] dark:text-[#1f2a2e]"
          >
            Yes, I can help
          </button>
          <button
            type="button"
            onClick={() => {
              respond(alert.id, 'declined')
              notify('No problem. We will ask the next nearest donors.', 'info')
            }}
            className="rounded-2xl border border-white/20 px-5 py-4 text-base font-bold text-white hover:bg-white/5"
          >
            Not available
          </button>
        </div>

        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Donor tiers by distance">
          {TIERS.map((t) => (
            <li
              key={t.id}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-semibold text-white',
                t.className,
                t.id === tier.id ? 'ring-2 ring-white' : 'opacity-80',
              )}
            >
              {`${t.label} · ${t.range}`}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
