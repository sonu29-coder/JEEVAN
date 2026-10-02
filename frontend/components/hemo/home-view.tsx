'use client'

import { useEffect, useState } from 'react'
import { AvailabilityStrip } from './availability-strip'
import { DonorCascadeCard } from './donor-cascade-card'
import { EmergencyCta } from './emergency-cta'
import { ExpiryCard } from './expiry-card'
import { LockMatrixCard } from './lock-matrix-card'
import { RoleSwitcher } from './role-switcher'
import { VerifyHandshakeCard } from './verify-handshake-card'

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return 'Good morning, neighbor 🌅'
  if (hour >= 12 && hour < 17) return 'Good afternoon, neighbor ☀️'
  if (hour >= 17 && hour < 22) return 'Good evening, neighbor 🌙'
  return 'Standing by for emergencies, neighbor 🚨'
}

export function HomeView() {
  const [greeting, setGreeting] = useState('Hello, neighbor')

  useEffect(() => {
    const update = () => setGreeting(greetingForHour(new Date().getHours()))
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pt-7 pb-10">
      <p className="text-lg font-medium text-muted-foreground">{greeting}</p>
      <RoleSwitcher className="mt-3" />
      <h1 className="mt-4 text-[34px] leading-[1.1] font-extrabold tracking-tight text-balance">
        Every second counts. How can we help?
      </h1>
      <p className="mt-4 flex items-center gap-2 text-base text-muted-foreground">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-mint" />
        </span>
        Network updated just now
      </p>

      <div className="mt-7 flex flex-col gap-8">
        <EmergencyCta />
        <LockMatrixCard />
        <VerifyHandshakeCard />
        <AvailabilityStrip />
        <DonorCascadeCard />
        <ExpiryCard />
      </div>
    </div>
  )
}
