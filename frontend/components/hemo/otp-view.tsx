'use client'

import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { Droplets, Loader2, PackageCheck, Truck } from 'lucide-react'
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useGridPost } from '@/hooks/use-grid-post'
import { useNow } from '@/hooks/use-now'
import { extractDetail } from '@/lib/hemo-api'
import { BANKS, COMPONENT_LABELS, OUR_ICU_ID, formatRemaining, isLocked, otpForLock, siteById, type StockItem } from '@/lib/hemo-data'
import { cn } from '@/lib/utils'
import { useGrid } from './grid-store'
import { SimulatedBadge, ViewHeader } from './view-header'

const EMPTY = ['', '', '', '']

interface VerifyPayload {
  lock_id: string | null
  stock_id: string
  otp: string
}

interface VerifyResponse {
  status?: string
  detail?: string
}

export function OtpView() {
  const { stock, setTab } = useGrid()
  const now = useNow()
  const pending = stock.filter((s) => s.lockedByIcuId === OUR_ICU_ID && isLocked(s, now))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ item: StockItem; simulated: boolean } | null>(null)
  const selected = pending.find((s) => s.id === selectedId) ?? pending[0]

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pb-10">
      <ViewHeader
        eyebrow="Delivery"
        title="Confirm blood delivery"
        description="When the courier arrives, ask them for the 4-digit code and type it below."
      />

      {pending.length > 1 && (
        <div className="no-scrollbar -mx-5 mb-4 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Deliveries on the way">
          {pending.map((item) => {
            const active = item.id === selected?.id
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  'shrink-0 rounded-full border-2 px-4 py-2 text-sm font-bold',
                  active ? 'border-coral bg-coral text-white' : 'border-border bg-card',
                )}
              >
                {`${item.group} · ${COMPONENT_LABELS[item.component]}`}
              </button>
            )
          })}
        </div>
      )}

      {selected ? (
        <HandshakePanel
          key={selected.id}
          item={selected}
          now={now}
          onConfirmed={(item, simulated) => setConfirmed({ item, simulated })}
        />
      ) : (
        !confirmed && (
          <div className="flex flex-col items-center rounded-3xl border bg-card px-6 py-10 text-center shadow-sm">
            <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Truck className="size-7" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-xl font-bold">No deliveries on the way</h2>
            <p className="mt-1 text-base text-muted-foreground">Hold a unit of blood first and it will appear here.</p>
            <button
              type="button"
              onClick={() => setTab('blood')}
              className="mt-5 flex items-center gap-2 rounded-2xl bg-coral-strong px-5 py-3.5 text-base font-bold text-white"
            >
              <Droplets className="size-5" aria-hidden="true" />
              Find blood
            </button>
          </div>
        )
      )}

      <SuccessOverlay confirmed={confirmed} onDone={() => setConfirmed(null)} />
    </div>
  )
}

function HandshakePanel({
  item,
  now,
  onConfirmed,
}: {
  item: StockItem
  now: number
  onConfirmed: (item: StockItem, simulated: boolean) => void
}) {
  const { completeDelivery } = useGrid()
  const [digits, setDigits] = useState<string[]>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const shake = useAnimationControls()
  const { trigger, isLoading } = useGridPost<VerifyPayload, VerifyResponse>('/verify-otp')
  const bank = siteById(BANKS, item.bankId)
  const code = digits.join('')
  const expectedPin = otpForLock(item.lockId)

  function fill(start: number, value: string) {
    const chars = value.replace(/\D/g, '').slice(0, 4 - start).split('')
    if (chars.length === 0) return
    setDigits((prev) => {
      const next = [...prev]
      chars.forEach((c, i) => (next[start + i] = c))
      return next
    })
    setError(null)
    inputs.current[Math.min(start + chars.length, 3)]?.focus()
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      setDigits((prev) => {
        const next = [...prev]
        if (next[index]) next[index] = ''
        else if (index > 0) {
          next[index - 1] = ''
          inputs.current[index - 1]?.focus()
        }
        return next
      })
    } else if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus()
    else if (e.key === 'ArrowRight' && index < 3) inputs.current[index + 1]?.focus()
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) verify()
  }

  function onPaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    fill(index, e.clipboardData.getData('text'))
  }

  async function verify() {
    if (code.length !== 4 || isLoading) return
    const res = await trigger({ lock_id: item.lockId, stock_id: item.id, otp: code }, () =>
      code === expectedPin
        ? { status: 200, data: { status: 'DELIVERY_CONFIRMED' } }
        : { status: 401, data: { detail: 'That code is not right. Ask the courier to read it again.' } },
    )
    if (res.status === 200) {
      completeDelivery(item.id)
      onConfirmed(item, res.simulated)
      return
    }
    setError(extractDetail(res.data, `Could not confirm (error ${res.status})`))
    setDigits(EMPTY)
    inputs.current[0]?.focus()
    shake.start({ x: [0, -10, 10, -8, 8, -4, 0], transition: { duration: 0.45 } })
  }

  return (
    <section aria-labelledby="handshake-title" className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-coral-soft text-xl font-extrabold text-coral-strong dark:text-coral">
          {item.group}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="handshake-title" className="text-lg font-bold">
            {COMPONENT_LABELS[item.component]}
          </h2>
          <p className="truncate text-sm text-muted-foreground">{`From ${bank?.short}`}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Hold ends in</p>
          <p className="text-lg font-extrabold text-amber-700 tabular-nums dark:text-amber-300">
            {item.lockedUntil !== null ? formatRemaining(item.lockedUntil, now) : '--:--'}
          </p>
        </div>
      </div>

      <motion.div animate={shake} className="mt-6 flex justify-center gap-3" role="group" aria-label="Courier code">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el
            }}
            value={digit}
            onChange={(e) => fill(i, e.target.value.slice(-1))}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'size-16 rounded-2xl border-2 bg-background text-center text-3xl font-extrabold caret-coral outline-none transition-colors',
              error ? 'border-coral' : digit ? 'border-mint' : 'border-border focus:border-coral',
            )}
          />
        ))}
      </motion.div>

      <p role="alert" className="mt-3 min-h-5 text-center text-sm font-medium text-coral-strong dark:text-coral">
        {error}
      </p>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={verify}
        disabled={code.length !== 4 || isLoading}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-coral-strong py-4 text-base font-bold text-white transition-opacity disabled:opacity-40"
      >
        {isLoading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <PackageCheck className="size-5" aria-hidden="true" />}
        {isLoading ? 'Checking…' : 'Confirm delivery'}
      </motion.button>

      <p className="mt-3 text-center text-sm text-muted-foreground">{`Courier's code is shown in the Delivery Driver view (demo: ${expectedPin})`}</p>
    </section>
  )
}

function SuccessOverlay({
  confirmed,
  onDone,
}: {
  confirmed: { item: StockItem; simulated: boolean } | null
  onDone: () => void
}) {
  return (
    <AnimatePresence>
      {confirmed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-background px-8 text-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-title"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="relative grid size-28 place-items-center"
          >
            <svg viewBox="0 0 100 100" className="size-28" aria-hidden="true">
              <motion.circle
                cx="50"
                cy="50"
                r="44"
                fill="rgba(47,191,138,0.12)"
                stroke="#2fbf8a"
                strokeWidth="5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
              <motion.path
                d="M30 52 L44 66 L71 37"
                fill="none"
                stroke="#2fbf8a"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, delay: 0.5, ease: 'easeOut' }}
              />
            </svg>
          </motion.div>

          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}>
            <h2 id="success-title" className="mt-6 text-[28px] leading-tight font-extrabold text-balance">
              Delivery confirmed
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {`${confirmed.item.group} ${COMPONENT_LABELS[confirmed.item.component].toLowerCase()} has reached the hospital. Thank you for helping save a life.`}
            </p>
            {confirmed.simulated && (
              <div className="mt-3 flex justify-center">
                <SimulatedBadge />
              </div>
            )}
            <button
              type="button"
              onClick={onDone}
              autoFocus
              className="mt-6 w-full rounded-2xl bg-ink py-4 text-base font-bold text-white"
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
