'use client'

import { useState, useMemo } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Droplets,
  Flame,
  Info,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import {
  CLINICAL_STORAGE_LIMITS,
  siteById,
  BANKS,
  type StockItem,
} from '@/lib/hemo-data'
import { useNow } from '@/hooks/use-now'
import { useGrid } from './grid-store'

export interface ScheduledProcedure {
  scheduleId: string
  stockId: string
  bloodGroup: string
  component: string
  expiryDateStr: string
  expiryTimestamp: number
  scheduledDateStr: string
  procedureType: string
  remainingMonths: number
  maxApprovedMonths: number
  maxApprovedDays: number
  isValid: boolean
}

export function BloodExpiryScheduler({
  stockItems,
  className = '',
}: {
  stockItems?: StockItem[]
  className?: string
}) {
  const { stock, notify } = useGrid()
  const now = useNow()
  const items = stockItems || stock

  const [selectedStockId, setSelectedStockId] = useState<string>(items[0]?.id || 's1')
  const [scheduledDateInput, setScheduledDateInput] = useState<string>(() => {
    const d = new Date(Date.now() + 86400000 * 2) // default +2 days
    return d.toISOString().split('T')[0]
  })
  const [procedureType, setProcedureType] = useState<string>('Elective Trauma Surgery')
  const [scheduledList, setScheduledList] = useState<ScheduledProcedure[]>([
    {
      scheduleId: 'SCHED-8801',
      stockId: 's3',
      bloodGroup: 'A+',
      component: 'Platelets',
      expiryDateStr: new Date(Date.now() + 86400000 * 2).toLocaleDateString(),
      expiryTimestamp: Date.now() + 86400000 * 2,
      scheduledDateStr: new Date(Date.now() + 86400000 * 1).toLocaleDateString(),
      procedureType: 'Emergency Platelet Infusion',
      remainingMonths: 0.07,
      maxApprovedMonths: 0.16,
      maxApprovedDays: 5,
      isValid: true,
    },
  ])
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null)

  // Sort and prioritize units by expiry date (FEFO Algorithm)
  const prioritizedUnits = useMemo(() => {
    return [...items].sort((a, b) => a.expiresInDays - b.expiresInDays)
  }, [items])

  const activeUnit = useMemo(() => {
    return items.find((u) => u.id === selectedStockId) || prioritizedUnits[0]
  }, [items, prioritizedUnits, selectedStockId])

  // Component storage limit specs
  const limitSpec = useMemo(() => {
    if (!activeUnit) return CLINICAL_STORAGE_LIMITS['PRBC']
    return (
      CLINICAL_STORAGE_LIMITS[activeUnit.component] ||
      CLINICAL_STORAGE_LIMITS['PRBC']
    )
  }, [activeUnit])

  // Storage duration in months calculation
  const remainingStorageMonths = useMemo(() => {
    if (!activeUnit) return 0
    return Math.round(Math.max(0, (activeUnit.expiresInDays / 30.44)) * 100) / 100
  }, [activeUnit])

  // Scheduling Algorithm & Safety Limits Validation
  const handleScheduleUnit = (e: React.FormEvent) => {
    e.preventDefault()
    setScheduleError(null)
    setScheduleSuccess(null)

    if (!activeUnit) return

    const targetExpiryMs = now + activeUnit.expiresInDays * 86400000
    const chosenDateMs = new Date(scheduledDateInput + 'T23:59:59').getTime()

    // 1. Strict Clinical Safety Validation: NEVER EXCEED CLINICALLY APPROVED EXPIRY DATES
    if (chosenDateMs > targetExpiryMs) {
      const expiryDateStr = new Date(targetExpiryMs).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      const err = `Schedule rejected: Scheduled procedure date (${new Date(chosenDateMs).toLocaleDateString()}) exceeds the clinically approved expiry date (${expiryDateStr}) for ${activeUnit.component}. Valid clinical storage limit is ${limitSpec.maxDays} days (${limitSpec.maxMonths} months). Never exceed clinically approved expiry dates.`
      setScheduleError(err)
      notify('Schedule rejected: Exceeds clinically approved expiry date!', 'error')
      return
    }

    // 2. Approved schedule
    const newSched: ScheduledProcedure = {
      scheduleId: `SCHED-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
      stockId: activeUnit.id,
      bloodGroup: activeUnit.group,
      component: activeUnit.component,
      expiryDateStr: new Date(targetExpiryMs).toLocaleDateString(),
      expiryTimestamp: targetExpiryMs,
      scheduledDateStr: new Date(chosenDateMs).toLocaleDateString(),
      procedureType,
      remainingMonths: remainingStorageMonths,
      maxApprovedMonths: limitSpec.maxMonths,
      maxApprovedDays: limitSpec.maxDays,
      isValid: true,
    }

    setScheduledList((prev) => [newSched, ...prev])
    setScheduleSuccess(
      `Unit ${activeUnit.group} (${activeUnit.component}) successfully scheduled for ${newSched.scheduledDateStr} within approved storage limits (${remainingStorageMonths} mo remaining).`,
    )
    notify(`Procedure scheduled within safe clinical storage limits!`, 'success')
  }

  return (
    <div
      aria-label="Blood Expiry & Scheduling Manager"
      className={`rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-500/5 via-card to-card p-4 shadow-xs dark:border-amber-800/60 dark:bg-amber-950/10 ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-amber-500 text-white shadow-sm shrink-0">
            <CalendarClock className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Blood Expiry & Clinical Scheduling
              </h3>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                FEFO Priority Engine
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Prioritizes units by expiry date & manages schedules within valid storage limits
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-200 shrink-0">
          <ShieldCheck className="size-3 text-emerald-600" />
          Storage Limits Active
        </span>
      </div>

      {/* FEFO Prioritized Units Reel */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <Flame className="size-3 text-amber-500" />
            <span>Select Blood Unit (Prioritized strictly by Expiry Date):</span>
          </span>
          <span className="text-[10px] text-muted-foreground">FEFO Rank 1 = Shortest Shelf Life</span>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {prioritizedUnits.map((u, index) => {
            const isSelected = activeUnit?.id === u.id
            const bank = siteById(BANKS, u.bankId)
            const days = u.expiresInDays
            const estMonths = Math.round(Math.max(0, days / 30.44) * 100) / 100
            const compLimit = CLINICAL_STORAGE_LIMITS[u.component] || CLINICAL_STORAGE_LIMITS['PRBC']

            return (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  setSelectedStockId(u.id)
                  setScheduleError(null)
                  setScheduleSuccess(null)
                }}
                className={`shrink-0 text-left p-2.5 rounded-xl border transition-all cursor-pointer min-w-[145px] ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-foreground ring-2 ring-amber-500/40 shadow-xs'
                    : 'border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-foreground">{u.group}</span>
                  <span className="text-[10px] font-bold px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                    Rank #{index + 1}
                  </span>
                </div>
                <p className="text-[10px] font-semibold text-foreground mt-0.5 truncate">{u.component}</p>
                <div className="mt-1 pt-1 border-t border-border/60 flex items-center justify-between text-[10px]">
                  <span className={days <= 3 ? 'text-coral font-bold' : 'text-amber-700 dark:text-amber-300'}>
                    {days}d left
                  </span>
                  <span className="text-muted-foreground font-mono">
                    ~{estMonths} mo
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected Unit Shelf-Life & Clinical Storage Limits HUD */}
      {activeUnit && (
        <div className="rounded-xl border border-border/80 bg-background/80 p-3 mb-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div>
              <p className="text-xs font-bold text-foreground">
                Unit {activeUnit.id.toUpperCase()} • {activeUnit.group} {activeUnit.component}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Expires in {activeUnit.expiresInDays} days ({activeUnit.expiresInDays * 24} hours)
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Estimated Storage:</span>
              <p className="text-xs font-mono font-bold text-amber-800 dark:text-amber-300">
                {remainingStorageMonths} months remaining
              </p>
            </div>
          </div>

          {/* Clinically Approved Limits Reference Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-muted/60 p-2 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">Max Approved Limit:</span>
              <span className="font-bold text-foreground">{limitSpec.maxDays} days ({limitSpec.maxMonths} mo)</span>
            </div>
            <div className="rounded-lg bg-muted/60 p-2 border border-border/60">
              <span className="text-[10px] text-muted-foreground block">Storage Temperature:</span>
              <span className="font-bold text-foreground">{limitSpec.tempRange}</span>
            </div>
            <div className="rounded-lg bg-muted/60 p-2 border border-border/60 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-muted-foreground block">Regulatory Protocol:</span>
              <span className="font-semibold text-foreground truncate block">{limitSpec.regulatorySource}</span>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Form with Strict Never-Exceed Clinical Expiry Enforcement */}
      <form onSubmit={handleScheduleUnit} className="space-y-3 mb-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label htmlFor="sched-date-input" className="block text-[11px] font-semibold text-muted-foreground mb-1">
              Scheduled Transfusion / Surgery Date:
            </label>
            <div className="relative">
              <input
                id="sched-date-input"
                type="date"
                required
                value={scheduledDateInput}
                onChange={(e) => {
                  setScheduledDateInput(e.target.value)
                  setScheduleError(null)
                  setScheduleSuccess(null)
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sched-procedure-input" className="block text-[11px] font-semibold text-muted-foreground mb-1">
              Clinical Procedure / Patient Type:
            </label>
            <select
              id="sched-procedure-input"
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            >
              <option value="Elective Trauma Surgery">Elective Trauma Surgery</option>
              <option value="High-Risk Cardiovascular Resuscitation">High-Risk Cardiovascular Resuscitation</option>
              <option value="Oncology Packed Cell Support">Oncology Packed Cell Support</option>
              <option value="Massive Transfusion Protocol (MTP)">Massive Transfusion Protocol (MTP)</option>
              <option value="Neonatal Pediatric Exchange">Neonatal Pediatric Exchange</option>
            </select>
          </div>
        </div>

        {/* Error Warning (Hard safety enforcement: Never exceed expiry dates) */}
        {scheduleError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
            <div className="leading-relaxed font-medium">
              <strong className="font-bold">Clinical Constraint Violation:</strong> {scheduleError}
            </div>
          </div>
        )}

        {/* Success Alert */}
        {scheduleSuccess && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <span>{scheduleSuccess}</span>
          </div>
        )}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-95 cursor-pointer"
        >
          <CalendarCheck className="size-4" />
          <span>Confirm Clinical Schedule within Expiry Limit</span>
        </button>
      </form>

      {/* Active Clinical Schedules Queue */}
      <div>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="size-3 text-amber-600" />
          <span>Active Scheduled Transfusions ({scheduledList.length}):</span>
        </p>

        <div className="space-y-1.5">
          {scheduledList.map((sched) => (
            <div
              key={sched.scheduleId}
              className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-black text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-lg shrink-0">
                  {sched.bloodGroup}
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{sched.procedureType}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Scheduled for: <strong>{sched.scheduledDateStr}</strong> • Expires: {sched.expiryDateStr}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="size-2.5" />
                  ~{sched.remainingMonths} mo valid
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
