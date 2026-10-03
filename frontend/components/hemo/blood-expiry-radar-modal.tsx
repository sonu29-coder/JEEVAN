'use client'

import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Baby,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  CornerDownRight,
  Droplet,
  Droplets,
  ExternalLink,
  Flame,
  HelpCircle,
  Info,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Truck,
  X,
  Zap,
} from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import {
  BANKS,
  BLOOD_GROUPS,
  COMPONENT_LABELS,
  COMPONENTS,
  computeExpiryRadarUnits,
  siteById,
  type BloodGroup,
  type ComponentType,
  type ExpiryRadarUnit,
} from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'

export function BloodExpiryRadarModal() {
  const {
    expiryRadarOpen,
    dismissExpiryRadar,
    stock,
    prioritizeStockUnit,
    redistributeStockUnit,
    quarantineStockUnit,
    prioritizedUnits,
    redistributedUnits,
    notify,
  } = useGrid()
  const now = useNow()

  const [activeComponent, setActiveComponent] = useState<string>('All')
  const [activeTier, setActiveTier] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [isProtocolsOpen, setIsProtocolsOpen] = useState(false)
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null)

  // Compute all radar units with clinical rule engine
  const radarUnits = useMemo(() => computeExpiryRadarUnits(stock, now), [stock, now])

  // Filtered units
  const filteredUnits = useMemo(() => {
    return radarUnits.filter((u) => {
      if (activeComponent !== 'All' && u.component !== activeComponent) return false
      if (activeTier === 'CRITICAL' && u.urgencyTier !== 'CRITICAL') return false
      if (activeTier === 'WARNING' && u.urgencyTier !== 'WARNING') return false
      if (activeTier === 'SAFE' && u.urgencyTier !== 'SAFE' && u.urgencyTier !== 'MONITORING') return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchGroup = u.group.toLowerCase().includes(q)
        const matchComp = u.component.toLowerCase().includes(q)
        const matchBank = u.bankName.toLowerCase().includes(q)
        const matchId = u.id.toLowerCase().includes(q)
        if (!matchGroup && !matchComp && !matchBank && !matchId) return false
      }
      return true
    })
  }, [radarUnits, activeComponent, activeTier, searchQuery])

  // Summary Metrics
  const criticalUnitsCount = useMemo(
    () => radarUnits.filter((u) => u.urgencyTier === 'CRITICAL').reduce((sum, u) => sum + u.units, 0),
    [radarUnits],
  )
  const warningUnitsCount = useMemo(
    () => radarUnits.filter((u) => u.urgencyTier === 'WARNING').reduce((sum, u) => sum + u.units, 0),
    [radarUnits],
  )
  const fefoCandidateCount = useMemo(
    () => radarUnits.filter((u) => u.expiresInDays <= 5).reduce((sum, u) => sum + u.units, 0),
    [radarUnits],
  )
  const totalUnits = useMemo(() => radarUnits.reduce((sum, u) => sum + u.units, 0), [radarUnits])
  const adherenceRate = totalUnits > 0 ? Math.round(((totalUnits - criticalUnitsCount * 0.2) / totalUnits) * 100) : 100

  const selectedUnit = useMemo(
    () => radarUnits.find((u) => u.id === selectedUnitId) || null,
    [radarUnits, selectedUnitId],
  )

  if (!expiryRadarOpen) return null

  const handlePrioritize = async (unit: ExpiryRadarUnit) => {
    setIsProcessingId(unit.id)
    await prioritizeStockUnit(unit.id, 'FEFO Surgical Allocation Priority')
    setIsProcessingId(null)
    notify(`Unit ${unit.group} (${unit.component}) prioritized for next surgery list.`, 'success')
  }

  const handleRedistribute = async (unit: ExpiryRadarUnit) => {
    if (!unit.recommendedTransferTargetId) return
    setIsProcessingId(unit.id)
    const code = await redistributeStockUnit(unit.id, unit.recommendedTransferTargetId, 'Cold-chain rapid transit')
    setIsProcessingId(null)
    notify(`Redistribution initiated: ${code} to ${unit.recommendedTransferTargetName || 'Regional Center'}.`, 'success')
  }

  const handleQuarantine = async (unit: ExpiryRadarUnit) => {
    setIsProcessingId(unit.id)
    await quarantineStockUnit(unit.id)
    setIsProcessingId(null)
    notify(`Unit ${unit.group} moved to biohazard quarantine.`, 'info')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="radar-modal-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-0 backdrop-blur-md sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-background text-foreground shadow-2xl sm:h-[92vh] sm:rounded-3xl sm:border sm:border-border/60"
      >
        {/* Top Header */}
        <header className="relative flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-card via-card to-muted/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl bg-coral/10 text-coral ring-1 ring-coral/30">
              <Compass className="size-5 animate-spin" style={{ animationDuration: '14s' }} />
              <span className="absolute -top-1 -right-1 flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-coral" />
              </span>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="radar-modal-title" className="text-xl font-black tracking-tight text-foreground">
                  Blood Expiry Radar
                </h2>
                <span className="rounded-full bg-coral/15 px-2 py-0.5 text-[11px] font-black tracking-wide text-coral uppercase">
                  FEFO Live
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Clinical prioritization & zero-wastage redistribution engine
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissExpiryRadar}
            className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-coral focus-visible:outline-none"
            aria-label="Close Blood Expiry Radar"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Scrollable Content Container */}
        <div className="no-scrollbar flex-1 overflow-y-auto p-4 sm:p-5">
          {/* KPI Summary HUD */}
          <section aria-label="Radar summary metrics" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-2xl border border-coral/30 bg-coral/5 p-3.5 dark:bg-coral/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-coral-strong uppercase dark:text-coral">
                  Critical &lt; 48h
                </span>
                <Clock className="size-4 text-coral" />
              </div>
              <p className="mt-1 text-2xl font-black text-coral-strong dark:text-coral">{criticalUnitsCount}</p>
              <p className="text-[11px] text-muted-foreground">Units need urgent issue</p>
            </div>

            <div className="rounded-2xl border border-amber-300/40 bg-amber-500/5 p-3.5 dark:border-amber-700/40 dark:bg-amber-500/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase dark:text-amber-300">
                  FEFO Queue (3-5d)
                </span>
                <Flame className="size-4 text-amber-500" />
              </div>
              <p className="mt-1 text-2xl font-black text-amber-900 dark:text-amber-200">{fefoCandidateCount}</p>
              <p className="text-[11px] text-muted-foreground">First-out candidates</p>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 dark:bg-emerald-500/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-800 uppercase dark:text-emerald-300">
                  Wastage Shield
                </span>
                <ShieldCheck className="size-4 text-emerald-500" />
              </div>
              <p className="mt-1 text-2xl font-black text-emerald-900 dark:text-emerald-200">{adherenceRate}%</p>
              <p className="text-[11px] text-muted-foreground">Adherence efficiency</p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">Active Stock</span>
                <Droplets className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-2xl font-black text-foreground">{totalUnits}</p>
              <p className="text-[11px] text-muted-foreground">Across regional grid</p>
            </div>
          </section>

          {/* Radar Scanner Visual Display */}
          <section
            aria-label="Interactive Radar Scanner"
            className="relative mt-4 flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-slate-950 p-6 text-slate-100 shadow-inner"
          >
            {/* Top Radar HUD Bar */}
            <div className="mb-3 flex w-full items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Radio className="size-3.5 text-coral animate-pulse" />
                <span>SCAN FREQ: 2.4 GHz</span>
              </span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                CIRCLES: 24h · 48h · 5d · 10d · 20d
              </span>
            </div>

            {/* Radar Scope Circle */}
            <div className="relative flex size-64 items-center justify-center sm:size-72">
              {/* Concentric distance rings */}
              <div className="absolute inset-0 rounded-full border border-slate-800/80" />
              <div className="absolute inset-8 rounded-full border border-slate-800/70" />
              <div className="absolute inset-16 rounded-full border border-dashed border-amber-900/40" />
              <div className="absolute inset-24 rounded-full border border-dashed border-coral/40" />

              {/* Crosshair Axes */}
              <div className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-slate-800/60" />
              <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-slate-800/60" />

              {/* Rotating Sweep Beam */}
              <div className="radar-sweep-beam pointer-events-none absolute inset-0 rounded-full" />

              {/* Center Radar Core */}
              <div className="z-10 flex size-8 items-center justify-center rounded-full bg-slate-900 border border-slate-700 shadow-lg">
                <span className="size-2 rounded-full bg-coral animate-ping" />
              </div>

              {/* Ring Labels */}
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-mono text-slate-500">SAFE</span>
              <span className="absolute top-10 left-1/2 -translate-x-1/2 text-[9px] font-mono text-slate-400">5d</span>
              <span className="absolute top-18 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-amber-400">
                48h
              </span>
              <span className="absolute top-25 left-1/2 -translate-x-1/2 text-[9px] font-mono font-black text-coral">
                24h
              </span>

              {/* Pulsing Blips for Blood Units */}
              {radarUnits.map((u) => {
                const rad = (u.radarAngleDeg * Math.PI) / 180
                const maxRadiusPx = 130 // fits 260px radius
                const rPx = u.radarRadiusNorm * maxRadiusPx
                const x = Math.cos(rad) * rPx
                const y = Math.sin(rad) * rPx

                const isCritical = u.urgencyTier === 'CRITICAL'
                const isWarning = u.urgencyTier === 'WARNING'
                const isSelected = selectedUnitId === u.id
                const isPrioritized = Boolean(prioritizedUnits[u.id])
                const isRedistributed = Boolean(redistributedUnits[u.id])

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUnitId(isSelected ? null : u.id)}
                    style={{
                      transform: `translate(${x}px, ${y}px)`,
                    }}
                    className={cn(
                      'group absolute z-20 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-transform focus:outline-none',
                      isSelected ? 'scale-125 ring-2 ring-white' : 'hover:scale-125',
                    )}
                    aria-label={`${u.group} ${u.component} at ${u.bankName}, expires in ${u.expiresInDays} days`}
                  >
                    {/* Glowing blip aura */}
                    <span
                      className={cn(
                        'radar-blip-pulse absolute size-full rounded-full opacity-75',
                        isCritical
                          ? 'bg-coral'
                          : isWarning
                            ? 'bg-amber-400'
                            : 'bg-emerald-400',
                      )}
                    />
                    {/* Inner pip */}
                    <span
                      className={cn(
                        'relative flex size-4 items-center justify-center rounded-full text-[9px] font-black text-white shadow-md',
                        isPrioritized
                          ? 'bg-indigo-600 ring-2 ring-indigo-300'
                          : isRedistributed
                            ? 'bg-sky-600 ring-2 ring-sky-300'
                            : isCritical
                              ? 'bg-coral ring-1 ring-coral-strong'
                              : isWarning
                                ? 'bg-amber-500'
                                : 'bg-emerald-600',
                      )}
                    >
                      {u.group.slice(0, 2)}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Quick Selected Blip Popover (within Radar scope) */}
            <AnimatePresence>
              {selectedUnit && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="mt-4 flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-slate-700 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-coral/20 px-2 py-0.5 text-xs font-black text-coral">
                        {selectedUnit.group}
                      </span>
                      <span className="text-xs font-bold text-slate-200">
                        {COMPONENT_LABELS[selectedUnit.component]}
                      </span>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        selectedUnit.urgencyTier === 'CRITICAL'
                          ? 'bg-coral/20 text-coral'
                          : selectedUnit.urgencyTier === 'WARNING'
                            ? 'bg-amber-400/20 text-amber-300'
                            : 'bg-emerald-400/20 text-emerald-300',
                      )}
                    >
                      {selectedUnit.expiresInDays <= 1 ? 'Expires in 24h' : `${selectedUnit.expiresInDays} days left`}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300">
                    <span className="font-semibold">{selectedUnit.bankName}</span> · {selectedUnit.units} units ready
                  </p>

                  <p className="text-[11px] text-slate-400 italic">{selectedUnit.suggestedAction}</p>

                  <div className="mt-1 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedUnitId(null)}
                      className="rounded-lg px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrioritize(selectedUnit)}
                      className="rounded-lg bg-coral px-3 py-1 text-xs font-bold text-white transition hover:bg-coral-strong"
                    >
                      Prioritize FEFO
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Filter Bar */}
          <section aria-label="Radar filters" className="mt-5 flex flex-col gap-3">
            {/* Component Filter Pills */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Filter by Component
              </span>
              <button
                type="button"
                onClick={() => setIsProtocolsOpen((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-coral transition hover:underline"
              >
                <HelpCircle className="size-3.5" />
                {isProtocolsOpen ? 'Hide Clinical Rules' : 'View Clinical Rules'}
              </button>
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {['All', ...COMPONENTS].map((c) => {
                const active = activeComponent === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setActiveComponent(c)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                      active
                        ? 'border-coral bg-coral text-white shadow-sm'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {c === 'All' ? 'All Components' : COMPONENT_LABELS[c as ComponentType]}
                  </button>
                )
              })}
            </div>

            {/* Urgency Horizon Filter & Search */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {[
                  { id: 'All', label: 'All Horizons' },
                  { id: 'CRITICAL', label: 'Critical (≤ 48h)' },
                  { id: 'WARNING', label: 'Watch (3–5d)' },
                  { id: 'SAFE', label: 'Safe (> 5d)' },
                ].map((tier) => {
                  const active = activeTier === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setActiveTier(tier.id)}
                      className={cn(
                        'shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold transition',
                        active
                          ? 'bg-muted-foreground/15 text-foreground font-extrabold ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-muted/60',
                      )}
                    >
                      {tier.label}
                    </button>
                  )
                })}
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search group, bank..."
                  className="w-full rounded-xl border border-border bg-card py-1.5 pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral"
                />
              </div>
            </div>
          </section>

          {/* Clinical Protocols Guide (Collapsible) */}
          <AnimatePresence>
            {isProtocolsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 rounded-2xl border border-sky-300/40 bg-sky-500/5 p-4 text-xs dark:border-sky-800/40 dark:bg-sky-950/20">
                  <h4 className="flex items-center gap-1.5 font-bold text-sky-900 dark:text-sky-200">
                    <Info className="size-4 text-sky-600" />
                    Clinical Decision & Inventory Prioritization Rules
                  </h4>
                  <ul className="mt-2.5 grid gap-2 sm:grid-cols-2 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 rounded bg-amber-500/20 px-1 py-0.2 text-[10px] font-black text-amber-700 dark:text-amber-300">
                        FEFO-01
                      </span>
                      <span>
                        <strong className="text-foreground">First Expiring, First Out:</strong> Prioritize units with
                        &le;5 days shelf life for elective surgeries and routine transfusion.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 rounded bg-rose-500/20 px-1 py-0.2 text-[10px] font-black text-rose-700 dark:text-rose-300">
                        PEDI-04
                      </span>
                      <span>
                        <strong className="text-foreground">Pediatric Age Restriction:</strong> Stored RBCs &gt;7 days
                        accumulate extracellular potassium; contraindicated for neonatal exchange or pediatric cardiac
                        bypass.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 rounded bg-coral/20 px-1 py-0.2 text-[10px] font-black text-coral">
                        PLT-02
                      </span>
                      <span>
                        <strong className="text-foreground">Platelet Rapid Cycle:</strong> Platelets strictly expire in
                        5 days at 20-24°C; units &le;48h trigger immediate emergency issue or redistribution.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 rounded bg-emerald-500/20 px-1 py-0.2 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                        REDIST-09
                      </span>
                      <span>
                        <strong className="text-foreground">Zero-Waste Cold Chain:</strong> High-risk surplus units are
                        rerouted to regional high-intake trauma centers (e.g. GMC Thrissur) via Green Corridor.
                      </span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Ranked Units Queue (FEFO Order) */}
          <section aria-labelledby="fefo-queue-title" className="mt-5">
            <div className="flex items-center justify-between pb-2">
              <h3 id="fefo-queue-title" className="text-sm font-extrabold tracking-tight text-foreground">
                FEFO Clinical Prioritization Queue ({filteredUnits.length})
              </h3>
              <span className="text-[11px] text-muted-foreground">Ranked by days remaining</span>
            </div>

            {filteredUnits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <AlertCircle className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-bold text-foreground">No units found matching this criteria</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Try clearing your filters or search term.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {filteredUnits.map((item) => {
                  const isCritical = item.urgencyTier === 'CRITICAL'
                  const isWarning = item.urgencyTier === 'WARNING'
                  const isPrioritized = Boolean(prioritizedUnits[item.id])
                  const isRedistributed = Boolean(redistributedUnits[item.id])
                  const redistributeData = redistributedUnits[item.id]
                  const isProcessing = isProcessingId === item.id

                  return (
                    <li
                      key={item.id}
                      className={cn(
                        'group relative flex flex-col gap-3 rounded-2xl border p-4 transition-all',
                        isPrioritized
                          ? 'border-indigo-500/40 bg-indigo-500/5 dark:bg-indigo-950/20'
                          : isRedistributed
                            ? 'border-sky-500/40 bg-sky-500/5 dark:bg-sky-950/20'
                            : isCritical
                              ? 'border-coral/40 bg-coral/5 dark:border-coral/30 dark:bg-coral/10'
                              : isWarning
                                ? 'border-amber-400/40 bg-amber-500/5 dark:border-amber-700/40 dark:bg-amber-950/20'
                                : 'border-border bg-card hover:border-border/80',
                      )}
                    >
                      {/* Top Row: Rank, Group, Status badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-xs font-black text-foreground">
                            #{item.fefoPriorityRank}
                          </span>
                          <span
                            className={cn(
                              'text-xl font-black tracking-tight',
                              isCritical ? 'text-coral' : isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
                            )}
                          >
                            {item.group}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
                            {COMPONENT_LABELS[item.component]}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground">· {item.units} units</span>
                        </div>

                        {/* Expiry Pill */}
                        <div className="flex items-center gap-1.5">
                          {isPrioritized && (
                            <span className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-black text-indigo-700 dark:text-indigo-300">
                              <CheckCircle2 className="size-3" />
                              Prioritized
                            </span>
                          )}
                          {isRedistributed && (
                            <span className="flex items-center gap-1 rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-black text-sky-700 dark:text-sky-300">
                              <Truck className="size-3" />
                              Dispatched
                            </span>
                          )}
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-extrabold',
                              isCritical
                                ? 'bg-coral text-white'
                                : isWarning
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
                                  : 'bg-muted text-foreground',
                            )}
                          >
                            {item.expiresInDays <= 1 ? '1 day left' : `${item.expiresInDays} days left`}
                          </span>
                        </div>
                      </div>

                      {/* Location & Expiry Date */}
                      <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="size-3.5 text-muted-foreground" />
                          <span>{item.bankName}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3.5 text-muted-foreground" />
                          <span>Expires {item.expiryDateStr}</span>
                        </span>
                      </div>

                      {/* Clinical Rules & Compatibility Tags */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {item.clinicalRules.map((r) => (
                          <span
                            key={r.id}
                            title={r.description}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold',
                              r.severity === 'critical'
                                ? 'bg-coral/15 text-coral dark:bg-coral/25'
                                : r.severity === 'warning'
                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                  : 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
                            )}
                          >
                            {r.id === 'FEFO_PRIORITY' && <Flame className="size-3" />}
                            {r.id === 'PLATELET_URGENT_CYCLE' && <Zap className="size-3" />}
                            {r.id === 'PEDIATRIC_RESTRICTION' && <Baby className="size-3" />}
                            {r.id === 'TRAUMA_MASSIVE_MATCH' && <Droplet className="size-3" />}
                            {r.id === 'INTER_FACILITY_TRANSFER_RECOMMENDED' && <Truck className="size-3" />}
                            {r.badge}
                          </span>
                        ))}

                        {!item.pediatricSafe && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:text-rose-300">
                            <AlertTriangle className="size-3" />
                            Adult Recipients Only
                          </span>
                        )}

                        {item.traumaCandidate && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                            <Sparkles className="size-3" />
                            Trauma MTP Ready
                          </span>
                        )}
                      </div>

                      {/* Clinical Action Recommendation Box */}
                      <div className="rounded-xl bg-background/80 p-2.5 text-xs text-foreground/90 border border-border/60">
                        <p className="flex items-start gap-1.5">
                          <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-coral" />
                          <span>
                            <strong className="font-bold">Clinical Directive:</strong> {item.suggestedAction}
                          </span>
                        </p>
                        {isRedistributed && redistributeData && (
                          <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-300">
                            Cold-chain courier tracking: <strong>{redistributeData.dispatchCode}</strong> &rarr;{' '}
                            {redistributeData.targetBankName}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        {item.urgencyTier === 'EXPIRED' ? (
                          <button
                            type="button"
                            onClick={() => handleQuarantine(item)}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                          >
                            <Trash2 className="size-3.5" />
                            Quarantine Biohazard
                          </button>
                        ) : (
                          <>
                            {item.recommendedTransferTargetId && !isRedistributed && (
                              <button
                                type="button"
                                onClick={() => handleRedistribute(item)}
                                disabled={isProcessing}
                                className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                              >
                                <Truck className="size-3.5" />
                                Transfer to {siteById(BANKS, item.recommendedTransferTargetId)?.short}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handlePrioritize(item)}
                              disabled={isProcessing || isPrioritized}
                              className={cn(
                                'flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-sm',
                                isPrioritized
                                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                                  : 'bg-coral text-white hover:bg-coral-strong active:scale-95',
                              )}
                            >
                              {isPrioritized ? (
                                <>
                                  <CheckCircle2 className="size-3.5" />
                                  Prioritized for Surgery
                                </>
                              ) : (
                                <>
                                  <Flame className="size-3.5" />
                                  Prioritize FEFO
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Modal Footer */}
        <footer className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-mint animate-pulse" />
            <span>FEFO Protocol Engine Active · Next Audit in 14m</span>
          </div>

          <button
            type="button"
            onClick={dismissExpiryRadar}
            className="rounded-xl border border-border bg-card px-4 py-1.5 font-bold text-foreground transition hover:bg-muted"
          >
            Done
          </button>
        </footer>
      </motion.div>
    </div>
  )
}
