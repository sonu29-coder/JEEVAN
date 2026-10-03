'use client'

import { Building2, ChevronRight, Compass, SearchX, X } from 'lucide-react'
import { useState } from 'react'
import { useGridPost } from '@/hooks/use-grid-post'
import { useNow } from '@/hooks/use-now'
import { extractDetail } from '@/lib/hemo-api'
import {
  BANKS,
  BLOOD_GROUPS,
  COMPONENT_LABELS,
  ICUS,
  LOCK_DURATION_MS,
  OUR_ICU_ID,
  isLocked,
  siteById,
  type StockItem,
} from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { ConflictModal, type ConflictInfo } from './conflict-modal'
import { useGrid } from './grid-store'
import { StockCard } from './stock-card'
import { SectionTitle, ViewHeader } from './view-header'

interface ReservePayload {
  stock_id: string
  bank_id: string
  icu_id: string
  blood_group: string
  component_type: string
  units: number
}

interface ReserveResponse {
  lock_id?: string
  expires_in?: number
  detail?: string
  locked_until?: number
}

function matches(item: StockItem, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const bank = siteById(BANKS, item.bankId)
  if (/^(a|b|ab|o)[+-]$/.test(q)) return item.group.toLowerCase() === q
  return [item.group, item.component, COMPONENT_LABELS[item.component], bank?.name ?? '', bank?.short ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q)
}

export function StockView() {
  const { stock, lockStock, notify, query, setQuery, openExpiryRadar } = useGrid()
  const now = useNow()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const { trigger } = useGridPost<ReservePayload, ReserveResponse>('/reserve-stock')

  const results = stock.filter((s) => matches(s, query))

  async function reserve(item: StockItem) {
    setPendingId(item.id)
    const res = await trigger(
      {
        stock_id: item.id,
        bank_id: item.bankId,
        icu_id: OUR_ICU_ID,
        blood_group: item.group,
        component_type: item.component,
        units: 1,
      },
      () => {
        if (isLocked(item, Date.now())) {
          const holder = siteById(ICUS, item.lockedByIcuId)?.name ?? 'another hospital'
          return {
            status: 409,
            data: { detail: `This unit is on hold for ${holder}.`, locked_until: item.lockedUntil ?? undefined },
          }
        }
        return {
          status: 200,
          data: { lock_id: `LCK-${Math.random().toString(16).slice(2, 6).toUpperCase()}`, expires_in: 900 },
        }
      },
    )
    setPendingId(null)

    if (res.status === 409) {
      setConflict({
        item,
        detail: extractDetail(res.data, 'This unit is already on hold for another hospital.'),
        lockedUntil: res.data?.locked_until ?? item.lockedUntil,
      })
      return
    }
    if (!res.ok) {
      notify(extractDetail(res.data, `Could not hold this unit (error ${res.status})`), 'error')
      return
    }
    const lockId = res.data?.lock_id ?? `LCK-${item.id.toUpperCase()}`
    lockStock(item.id, OUR_ICU_ID, lockId, (res.data?.expires_in ?? 900) * 1000 || LOCK_DURATION_MS)
    notify(`${item.group} held for you for 15 minutes`, 'success')
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-10">
      <div className="px-5">
        <ViewHeader
          eyebrow="Blood banks near you"
          title="Find blood"
          description="Tap a blood group to filter. Hold a unit for 15 minutes while it is collected."
        />

        {/* Blood Expiry Radar Action Banner */}
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-coral/10 p-3 shadow-xs dark:border-amber-800/60 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <Compass className="size-5 animate-spin" style={{ animationDuration: '16s' }} />
            </span>
            <div>
              <p className="text-xs font-black text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                <span>Blood Expiry Radar</span>
                <span className="size-2 rounded-full bg-coral animate-ping" />
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                FEFO clinical rules & inter-hospital redistribution
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openExpiryRadar}
            className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-600 active:scale-95 dark:bg-amber-600"
          >
            <span>Scan Radar</span>
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Filter by blood group">
          {['All', ...BLOOD_GROUPS].map((g) => {
            const active = g === 'All' ? !query : query.trim().toLowerCase() === g.toLowerCase()
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setQuery(g === 'All' ? '' : g)}
                className={cn(
                  'shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors',
                  active ? 'border-coral bg-coral text-white' : 'border-border bg-card text-foreground hover:bg-muted',
                )}
              >
                {g}
              </button>
            )
          })}
        </div>

        {query && (
          <p className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{`${results.length} ${results.length === 1 ? 'result' : 'results'} for “${query}”`}</span>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex items-center gap-1 font-semibold text-coral-strong dark:text-coral"
            >
              <X className="size-4" aria-hidden="true" />
              Clear
            </button>
          </p>
        )}
      </div>

      <section aria-label="Available units" className="mt-4">
        {results.length > 0 ? (
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5 pb-2">
            {results.map((item) => (
              <StockCard
                key={item.id}
                item={item}
                now={now}
                isPending={pendingId === item.id}
                onReserve={() => reserve(item)}
              />
            ))}
          </div>
        ) : (
          <div className="mx-5 flex flex-col items-center rounded-3xl border bg-card px-6 py-10 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-lg font-bold">No blood found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another blood group, or send an emergency request so donors are alerted.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="banks-label" className="mt-8 px-5">
        <SectionTitle eyebrow="Connected" title="Blood banks in Thrissur" />
        <ul className="divide-y rounded-3xl border bg-card shadow-sm" id="banks-label">
          {BANKS.map((bank) => {
            const items = stock.filter((s) => s.bankId === bank.id)
            const units = items.filter((s) => !isLocked(s, now)).reduce((sum, s) => sum + s.units, 0)
            const groups = [...new Set(items.map((s) => s.group))].join(', ')
            return (
              <li key={bank.id} className="flex items-center gap-3 px-4 py-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{bank.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{groups || 'No stock listed'}</span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-extrabold">{units}</span>
                  <span className="block text-xs text-muted-foreground">units</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <ConflictModal conflict={conflict} now={now} onClose={() => setConflict(null)} />
    </div>
  )
}
