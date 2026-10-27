'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Building2, CheckCircle2, Loader2, MapPin, Minus, Plus, Siren } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { useGridPost } from '@/hooks/use-grid-post'
import { extractDetail } from '@/lib/hemo-api'
import {
  BLOOD_GROUPS,
  COMPONENTS,
  COMPONENT_LABELS,
  ICUS,
  OUR_ICU_ID,
  URGENCIES,
  URGENCY_LABELS,
  siteById,
  type BloodGroup,
  type ComponentType,
  type Urgency,
} from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'
import { SimulatedBadge, ViewHeader } from './view-header'

export const CLINICAL_REASON_KEYS = [
  { id: 'trauma', labelKey: 'traumaBleed', descKey: 'traumaDesc' },
  { id: 'surgery', labelKey: 'surgeryOt', descKey: 'surgeryDesc' },
  { id: 'maternal', labelKey: 'pphMaternal', descKey: 'pphDesc' },
  { id: 'shock', labelKey: 'sepsisShock', descKey: 'sepsisDesc' },
] as const

interface DispatchPayload {
  icu_id: string
  blood_group: BloodGroup
  component_type: ComponentType
  urgency: Urgency
  units: number
  location: { lat: number; lng: number }
}

interface DispatchResponse {
  request_id: string
  status: string
  matched_donors: number
  eta_minutes: number
}

const URGENCY_ACTIVE: Record<Urgency, string> = {
  CRITICAL: 'border-coral bg-coral-soft text-coral-strong dark:text-coral',
  HIGH: 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  ROUTINE: 'border-sky-400 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
}

export function DispatchView() {
  const t = useTranslations('ICU')
  const { addEmergency, notify, setTab } = useGrid()
  const [icuId, setIcuId] = useState(OUR_ICU_ID)
  const [clinicalReason, setClinicalReason] = useState<string>('trauma')
  const [group, setGroup] = useState<BloodGroup>('O-')
  const [component, setComponent] = useState<ComponentType>('PRBC')
  const [urgency, setUrgency] = useState<Urgency>('CRITICAL')
  const [units, setUnits] = useState(2)
  const [result, setResult] = useState<(DispatchResponse & { simulated: boolean }) | null>(null)
  const { trigger, isLoading } = useGridPost<DispatchPayload, DispatchResponse>('/request-blood')

  const icu = siteById(ICUS, icuId)!

  async function dispatch() {
    const payload: DispatchPayload = {
      icu_id: icuId,
      blood_group: group,
      component_type: component,
      urgency,
      units,
      location: { lat: icu.position[0], lng: icu.position[1] },
    }
    const res = await trigger(payload, () => ({
      status: 201,
      data: {
        request_id: `REQ-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        status: 'SENT',
        matched_donors: 2 + Math.floor(Math.random() * 4),
        eta_minutes: urgency === 'CRITICAL' ? 9 : urgency === 'HIGH' ? 24 : 60,
      },
    }))

    if (!res.ok || !res.data) {
      notify(extractDetail(res.data, `Could not send request (error ${res.status})`), 'error')
      return
    }
    setResult({ ...res.data, simulated: res.simulated })
    const activeReason = t(CLINICAL_REASON_KEYS.find((r) => r.id === clinicalReason)?.labelKey as any) ?? 'Acute Trauma'
    addEmergency({ id: res.data.request_id, icuId, group, component, urgency, units, clinicalReason: activeReason })
    notify(t('requestSent'), 'success')
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
      <ViewHeader
        eyebrow="JEEVAN ICU"
        title={t('requestTitle')}
        description={t('requestSubtitle')}
        onBack={() => setTab('home')}
      />

      <div className="flex flex-col gap-4">
        <Step number={1} title={t('clinicalReason')}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Clinical emergency reason">
            {CLINICAL_REASON_KEYS.map((item) => (
              <Choice
                key={item.id}
                active={item.id === clinicalReason}
                onClick={() => setClinicalReason(item.id)}
                className="flex flex-col items-start text-left p-3"
              >
                <span className="text-xs font-bold leading-tight">{t(item.labelKey as any)}</span>
                <span className="text-[10px] text-muted-foreground mt-1">{t(item.descKey as any)}</span>
              </Choice>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Building2 className="size-3.5 text-coral" />
              {t('requestingFacility')}:
            </span>
            <span className="font-bold text-foreground">{icu.name}</span>
          </div>
        </Step>

        <Step number={2} title={t('patientBloodGroup')}>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Blood group">
            {BLOOD_GROUPS.map((g) => (
              <Choice key={g} active={g === group} onClick={() => setGroup(g)} className="py-3.5 text-lg font-extrabold">
                {g}
              </Choice>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t('bloodGroupHint')}</p>
        </Step>

        <Step number={3} title={t('componentNeeded')}>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Blood component">
            {COMPONENTS.map((c) => (
              <Choice key={c} active={c === component} onClick={() => setComponent(c)}>
                {COMPONENT_LABELS[c]}
              </Choice>
            ))}
          </div>
        </Step>

        <Step number={4} title={t('urgencyLevel')}>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Urgency">
            {URGENCIES.map((u) => {
              const active = u === urgency
              const urgencyTitle = u === 'CRITICAL' ? t('urgencyCritical') : u === 'HIGH' ? t('urgencyHigh') : t('urgencyRoutine')
              return (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setUrgency(u)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-2xl border-2 py-3 transition-colors',
                    active ? URGENCY_ACTIVE[u] : 'border-border bg-background text-foreground hover:bg-muted',
                  )}
                >
                  <span className="text-base font-bold">{urgencyTitle}</span>
                  <span className="text-xs opacity-80">{URGENCY_LABELS[u].hint}</span>
                </button>
              )
            })}
          </div>
        </Step>

        <Step number={5} title={t('unitsToOrder')}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Up to 6 per request</p>
            <div className="flex items-center gap-2 rounded-2xl border bg-background p-1.5">
              <button
                type="button"
                aria-label="Fewer units"
                onClick={() => setUnits((u) => Math.max(1, u - 1))}
                className="grid size-11 place-items-center rounded-xl bg-muted"
              >
                <Minus className="size-5" aria-hidden="true" />
              </button>
              <output aria-live="polite" className="w-8 text-center text-2xl font-extrabold">
                {units}
              </output>
              <button
                type="button"
                aria-label="More units"
                onClick={() => setUnits((u) => Math.min(6, u + 1))}
                className="grid size-11 place-items-center rounded-xl bg-muted"
              >
                <Plus className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </Step>
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={dispatch}
        disabled={isLoading}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-coral-strong py-5 text-lg font-extrabold text-white shadow-[0_14px_30px_-14px_rgba(200,50,43,0.8)] disabled:opacity-70"
      >
        {isLoading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Siren className="size-5" aria-hidden="true" />}
        {isLoading ? t('dispatching') : t('dispatchButton')}
      </motion.button>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        {`${group} · ${COMPONENT_LABELS[component]} · ${units} ${units === 1 ? 'unit' : 'units'} · ${icu.short}`}
      </p>

      <AnimatePresence>
        {result && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            aria-label="Request sent"
            className="mt-6 rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/30"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-lg font-extrabold text-emerald-900 dark:text-emerald-100">
                <CheckCircle2 className="size-5 text-mint" aria-hidden="true" />
                {t('requestSent')}
              </p>
              {result.simulated && <SimulatedBadge />}
            </div>
            <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">{`Reference number ${result.request_id}`}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white p-3.5 dark:bg-white/5">
                <dt className="text-sm text-muted-foreground">{t('donorsAlerted')}</dt>
                <dd className="text-2xl font-extrabold">{result.matched_donors}</dd>
              </div>
              <div className="rounded-2xl bg-white p-3.5 dark:bg-white/5">
                <dt className="text-sm text-muted-foreground">{t('expectedIn')}</dt>
                <dd className="text-2xl font-extrabold">{`${result.eta_minutes} min`}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setTab('map')}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-base font-bold text-white"
            >
              <MapPin className="size-5" aria-hidden="true" />
              {t('trackOnMap')}
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border bg-card p-5 shadow-sm">
      <h2 className="mb-3.5 flex items-center gap-2.5 text-base font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-coral-soft text-sm font-extrabold text-coral-strong dark:text-coral">
          {number}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Choice({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'rounded-2xl border-2 px-2 py-3 text-sm font-semibold transition-colors',
        active
          ? 'border-coral bg-coral-soft text-coral-strong dark:text-coral'
          : 'border-border bg-background text-foreground hover:bg-muted',
        className,
      )}
    >
      {children}
    </button>
  )
}
