'use client'

import { useState, useMemo } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Droplets,
  Heart,
  Info,
  MapPin,
  Phone,
  Radio,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import {
  BLOOD_GROUPS,
  DONORS,
  RARE_BLOOD_DEFINITIONS,
  USER_LOCATION,
  distanceKm,
  tierFor,
  type BloodGroup,
} from '@/lib/hemo-data'
import { useGrid } from './grid-store'

interface RareDonorMatch {
  id: string
  name: string
  group: string
  isExactMatch: boolean
  isRare: boolean
  distanceKm: number
  tier: string
  coolingOffDays: number
  isEligible: boolean
  responseRatePct: number
  priorityScore: number
  priorityRank: number
}

// Baseline known donors with geolocations in Chennai
const SEED_RARE_DONORS = [
  { id: 'rd-01', name: 'Sneha Menon', group: 'O-', position: [13.0600, 80.2400] as [number, number], daysSince: 110, rate: 98, phone: '+91 98472 34567' },
  { id: 'rd-02', name: 'Kavya Suresh', group: 'B-', position: [13.0450, 80.2300] as [number, number], daysSince: 95, rate: 92, phone: '+91 94471 88291' },
  { id: 'rd-03', name: 'Arjun Das', group: 'A-', position: [13.0800, 80.2150] as [number, number], daysSince: 120, rate: 89, phone: '+91 97453 11092' },
  { id: 'rd-04', name: 'Farhan Akhtar', group: 'AB-', position: [13.0350, 80.1600] as [number, number], daysSince: 104, rate: 95, phone: '+91 99954 66120' },
  { id: 'rd-05', name: 'Deepa Natarajan', group: 'O-', position: [13.0528, 80.2508] as [number, number], daysSince: 140, rate: 94, phone: '+91 98460 77334' },
  { id: 'rd-06', name: 'Meenakshi Sundaram', group: 'Bombay Oh', position: [13.0784, 80.2415] as [number, number], daysSince: 130, rate: 100, phone: '+91 94470 55441' },
  { id: 'rd-07', name: 'Vikram Ramachandran', group: 'B-', position: [13.0850, 80.2101] as [number, number], daysSince: 80, rate: 88, phone: '+91 97452 44991' },
  { id: 'rd-08', name: 'Ananya Pillai', group: 'Rh-null', position: [13.0382, 80.1565] as [number, number], daysSince: 160, rate: 100, phone: '+91 99950 33221' },
]

export function RareBloodCompatibility({ className = '' }: { className?: string }) {
  const { notify } = useGrid()
  const [selectedGroup, setSelectedGroup] = useState<string>('O-')
  const [selectedComponent, setSelectedComponent] = useState<'PRBC' | 'Whole Blood' | 'Platelets' | 'FFP'>('PRBC')
  const [alertedDonors, setAlertedDonors] = useState<Record<string, boolean>>({})

  const rareKeys = Object.keys(RARE_BLOOD_DEFINITIONS)
  const isRareGroup = rareKeys.includes(selectedGroup)
  const currentDef = RARE_BLOOD_DEFINITIONS[selectedGroup]

  // Standard ABO/Rh Compatibility Algorithm
  const compatibleGroups = useMemo<string[]>(() => {
    if (selectedGroup === 'Bombay Oh') return ['Bombay Oh']
    if (selectedGroup === 'Rh-null') return ['Rh-null']

    if (selectedComponent === 'FFP') {
      // Plasma compatibility rules: AB is universal donor, O is universal recipient
      const abo = selectedGroup.replace(/[+-]/g, '')
      if (abo === 'O') return ['AB-', 'AB+']
      if (abo === 'A') return ['A-', 'A+', 'AB-', 'AB+']
      if (abo === 'B') return ['B-', 'B+', 'AB-', 'AB+']
      return ['AB-', 'AB+']
    }

    if (selectedComponent === 'Platelets') {
      const abo = selectedGroup.replace(/[+-]/g, '')
      return BLOOD_GROUPS.filter((g) => g.startsWith(abo))
    }

    // Standard Red Blood Cells (PRBC / Whole Blood) rules
    switch (selectedGroup) {
      case 'O-':
        return ['O-']
      case 'O+':
        return ['O-', 'O+']
      case 'A-':
        return ['A-', 'O-']
      case 'A+':
        return ['A+', 'A-', 'O+', 'O-']
      case 'B-':
        return ['B-', 'O-']
      case 'B+':
        return ['B+', 'B-', 'O+', 'O-']
      case 'AB-':
        return ['AB-', 'A-', 'B-', 'O-']
      case 'AB+':
        return [...BLOOD_GROUPS]
      default:
        return ['O-']
    }
  }, [selectedGroup, selectedComponent])

  // Matching & Prioritization Algorithm
  const matchedDonors = useMemo<RareDonorMatch[]>(() => {
    const list: RareDonorMatch[] = []

    for (const d of SEED_RARE_DONORS) {
      if (compatibleGroups.includes(d.group)) {
        const km = distanceKm(USER_LOCATION, d.position)
        const tier = tierFor(km).label
        const isExact = d.group === selectedGroup
        const coolingOffCleared = d.daysSince >= 90

        // Prioritization score:
        // Exact match (+100) > Universal substitute (+30)
        // Cooling-off cleared (+30)
        // Proximity bonus (max 15)
        // Historical response rate (max 10)
        let score = isExact ? 100 : 30
        if (coolingOffCleared) score += 30
        score += Math.max(0, 15 - km)
        score += Math.round((d.rate / 100) * 10)

        list.push({
          id: d.id,
          name: d.name,
          group: d.group,
          isExactMatch: isExact,
          isRare: rareKeys.includes(d.group),
          distanceKm: Math.round(km * 10) / 10,
          tier,
          coolingOffDays: d.daysSince,
          isEligible: coolingOffCleared,
          responseRatePct: d.rate,
          priorityScore: score,
          priorityRank: 1,
        })
      }
    }

    // Sort by priority score descending
    list.sort((a, b) => b.priorityScore - a.priorityScore)
    list.forEach((item, idx) => {
      item.priorityRank = idx + 1
    })

    return list
  }, [selectedGroup, compatibleGroups, rareKeys])

  const handleAlertDonor = (donor: RareDonorMatch) => {
    setAlertedDonors((prev) => ({ ...prev, [donor.id]: true }))
    notify(
      `Priority alert dispatched to ${donor.name} (${donor.group}) • ${donor.distanceKm} km away.`,
      'success',
    )
  }

  return (
    <div
      aria-label="Rare Blood Compatibility & Matching Feature"
      className={`rounded-2xl border border-rose-300/80 bg-gradient-to-br from-rose-500/5 via-card to-amber-500/5 p-4 shadow-xs dark:border-rose-900/60 dark:bg-rose-950/10 ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-rose-600 text-white shadow-sm shrink-0">
            <Droplets className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Rare Blood Compatibility & Matching
              </h3>
              <span className="rounded-full bg-rose-600/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wide">
                ABO / Rh Engine
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Identifies compatible rare blood groups & prioritizes matching donors
            </p>
          </div>
        </div>

        {/* Mandatory Decision Support Label */}
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200 shrink-0">
          <ShieldAlert className="size-3 text-amber-600" />
          Decision Support Only
        </span>
      </div>

      {/* Recipient Blood Group Selector Chips */}
      <div className="mb-3">
        <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
          <Sparkles className="size-3 text-rose-500" />
          <span>Select Recipient Blood Group (Rare & Negative Phenotypes):</span>
        </label>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {['O-', 'A-', 'B-', 'AB-', 'Bombay Oh', 'Rh-null', 'O+', 'A+', 'B+', 'AB+'].map((grp) => {
            const isSelected = selectedGroup === grp
            const isRare = rareKeys.includes(grp)
            return (
              <button
                key={grp}
                type="button"
                onClick={() => setSelectedGroup(grp)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-600/40'
                    : isRare
                    ? 'border border-rose-300/80 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
                    : 'border border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{grp}</span>
                {isRare && <span className="ml-1 text-[9px] opacity-80">★</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Compatibility Identification Card */}
      <div className="rounded-xl border border-border/80 bg-background/80 p-3 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-border/60">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground">Recipient Group:</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-sm font-black text-foreground">{selectedGroup}</span>
              {currentDef && (
                <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                  • {currentDef.label} ({currentDef.prevalenceIndia})
                </span>
              )}
            </div>
          </div>

          {/* Component Toggle */}
          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/60 text-[10px] font-bold">
            {(['PRBC', 'Whole Blood', 'Platelets', 'FFP'] as const).map((comp) => (
              <button
                key={comp}
                type="button"
                onClick={() => setSelectedComponent(comp)}
                className={`px-2 py-0.5 rounded transition ${
                  selectedComponent === comp
                    ? 'bg-rose-600 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {comp}
              </button>
            ))}
          </div>
        </div>

        {/* Compatible Donor Blood Groups Identified */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-foreground flex items-center gap-1">
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Compatible Donor Groups per Standard ABO/Rh Rules:</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {compatibleGroups.map((g) => {
              const isExact = g === selectedGroup
              return (
                <span
                  key={g}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    isExact
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  <span>{g}</span>
                  {isExact ? (
                    <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.2 rounded font-black">
                      Exact Priority
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground">Universal Sub</span>
                  )}
                </span>
              )
            })}
          </div>

          <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
            {currentDef?.ruleSummary ||
              `Recipients of ${selectedGroup} can receive red cells from ${compatibleGroups.join(', ')}.`}
          </p>
        </div>
      </div>

      {/* Prioritized Matching Donors List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Radio className="size-3.5 text-rose-600 animate-pulse" />
            <span>Prioritized Matching Donors ({matchedDonors.length} in Chennai Grid):</span>
          </p>
          <span className="text-[10px] text-muted-foreground">
            Ranked by Exact Match &gt; Proximity &gt; Cooling-Off
          </span>
        </div>

        {matchedDonors.length > 0 ? (
          <div className="space-y-2">
            {matchedDonors.map((donor) => {
              const isAlerted = alertedDonors[donor.id]
              return (
                <div
                  key={donor.id}
                  className={`rounded-xl border p-2.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    donor.isExactMatch
                      ? 'border-emerald-300/80 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`grid size-9 place-items-center rounded-xl font-black text-xs shrink-0 ${
                        donor.isExactMatch
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}
                    >
                      {donor.group}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">{donor.name}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                            donor.priorityRank === 1
                              ? 'border-amber-400 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
                              : 'border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          Rank #{donor.priorityRank}
                        </span>
                        {donor.isExactMatch && (
                          <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-300">
                            • Exact Match
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-0.5">
                          <MapPin className="size-3 text-rose-500" />
                          <span>{donor.distanceKm} km ({donor.tier})</span>
                        </span>
                        <span>•</span>
                        <span className={donor.isEligible ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                          {donor.isEligible ? 'Eligible to Donate (Cooling-off OK)' : `${donor.coolingOffDays}d since last`}
                        </span>
                        <span>•</span>
                        <span>{donor.responseRatePct}% response</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isAlerted}
                      onClick={() => handleAlertDonor(donor)}
                      className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold shadow-xs transition-all cursor-pointer ${
                        isAlerted
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                          : 'bg-rose-600 hover:bg-rose-700 text-white active:scale-95'
                      }`}
                    >
                      {isAlerted ? (
                        <>
                          <CheckCircle2 className="size-3" />
                          <span>Alert Dispatched</span>
                        </>
                      ) : (
                        <>
                          <Send className="size-3" />
                          <span>Alert Match</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No active matching donors currently registered for {selectedGroup}. Contacting State Rare Blood Depot.
          </div>
        )}
      </div>

      {/* Prominent Clinical Decision Support Banner */}
      <div className="mt-3 rounded-xl border border-amber-300/80 bg-amber-500/10 p-2.5 text-[11px] text-amber-900 dark:border-amber-800/60 dark:text-amber-200 flex items-start gap-2">
        <Info className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="leading-relaxed">
          <strong className="font-bold">Clinical Decision Support:</strong> Algorithmic compatibility match.
          Mandatory pre-transfusion serological cross-match, Rh phenotype subtyping, and antibody screening
          must be completed before release per NABH & DGHS clinical guidelines.
        </div>
      </div>
    </div>
  )
}
