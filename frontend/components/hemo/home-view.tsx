'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AvailabilityStrip } from './availability-strip'
import { DonorCascadeCard } from './donor-cascade-card'
import { EmergencyCta } from './emergency-cta'
import { ExpiryCard } from './expiry-card'
import { LockMatrixCard } from './lock-matrix-card'
import { RoleSwitcher } from './role-switcher'
import { VerifyHandshakeCard } from './verify-handshake-card'

export function HomeView() {
  const t = useTranslations('ICU')
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const update = () => {
      const hour = new Date().getHours()
      if (hour >= 5 && hour < 12) setGreeting(t('greetingMorning'))
      else if (hour >= 12 && hour < 17) setGreeting(t('greetingAfternoon'))
      else if (hour >= 17 && hour < 22) setGreeting(t('greetingEvening'))
      else setGreeting(t('greetingEmergency'))
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [t])

  return (
    <div className="no-scrollbar h-full overflow-y-auto px-5 pt-7 pb-10">
      <p className="text-lg font-medium text-muted-foreground">{greeting || t('greetingEmergency')}</p>
      <h1 className="mt-4 text-[34px] leading-[1.1] font-extrabold tracking-tight text-balance">
        {t('heroTitle')}
      </h1>
      <p className="mt-4 flex items-center gap-2 text-base text-muted-foreground">
        <span className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-mint" />
        </span>
        {t('networkUpdated')}
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
