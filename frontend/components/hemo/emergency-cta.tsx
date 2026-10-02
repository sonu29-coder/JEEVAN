'use client'

import { motion } from 'framer-motion'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { useGrid } from './grid-store'

export function EmergencyCta() {
  const { setTab } = useGrid()

  return (
    <section
      aria-labelledby="emergency-cta-title"
      className="relative overflow-hidden rounded-[30px] bg-coral p-6 text-white shadow-[0_18px_40px_-18px_rgba(232,82,74,0.7)]"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-20 size-60 rounded-full border-[34px] border-white/10"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 left-16 size-64 rounded-full border-[34px] border-white/10"
      />

      <div className="relative">
        <span className="grid size-14 place-items-center rounded-2xl bg-white/15">
          <CircleAlert className="size-7" aria-hidden="true" />
        </span>
        <p className="mt-6 text-lg font-semibold text-white/85">Need blood urgently?</p>
        <h2 id="emergency-cta-title" className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight">
          Create an emergency request
        </h2>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => setTab('request')}
          className="mt-6 flex items-center gap-3 rounded-2xl bg-white px-6 py-4 text-base font-extrabold tracking-wide text-coral-strong uppercase shadow-lg"
        >
          Start in a few taps
          <ArrowRight className="size-5" aria-hidden="true" />
        </motion.button>
      </div>
    </section>
  )
}
