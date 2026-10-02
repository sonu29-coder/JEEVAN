'use client'

import { ArrowRight, ShieldCheck } from 'lucide-react'
import { useNow } from '@/hooks/use-now'
import { OUR_ICU_ID, isLocked } from '@/lib/hemo-data'
import { useGrid } from './grid-store'

export function VerifyHandshakeCard() {
  const { stock, setTab } = useGrid()
  const now = useNow()
  const incoming = stock.filter((s) => s.lockedByIcuId === OUR_ICU_ID && isLocked(s, now)).length

  return (
    <section aria-labelledby="verify-card-title" className="rounded-3xl bg-ink p-5 text-white shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="verify-card-title" className="text-lg font-extrabold">
            Verify handshake OTP
          </h2>
          <p className="text-sm text-white/70">
            {incoming > 0
              ? `${incoming} ${incoming === 1 ? 'delivery' : 'deliveries'} on the way to your ICU`
              : 'No deliveries on the way yet'}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/80">
        When the courier arrives, enter the 4-digit PIN they show you to confirm the blood was received.
      </p>
      <button
        type="button"
        onClick={() => setTab('verify')}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-coral py-3.5 text-base font-bold text-white"
      >
        Enter courier PIN
        <ArrowRight className="size-5" aria-hidden="true" />
      </button>
    </section>
  )
}
