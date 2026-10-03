'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { hasPortalAccess } from '@/lib/hemo-auth'
import { AccessDenied, AuthBanner, ForbiddenModal, SessionBar } from './access-control'
import { AlertsView } from './alerts-view'
import { AppHeader } from './app-header'
import { BottomDock } from './bottom-dock'
import { DispatchView } from './dispatch-view'
import { DonorDashboard } from './donor-dashboard'
import { DriverDashboard } from './driver-dashboard'
import { GridProvider, useGrid } from './grid-store'
import { GridToast } from './grid-toast'
import { HomeView } from './home-view'
import { MapView } from './map-view'
import { OtpView } from './otp-view'
import { StockView } from './stock-view'
import { NccEmergencyModal } from './ncc-emergency-modal'
import { BloodExpiryRadarModal } from './blood-expiry-radar-modal'

const VIEWS = {
  home: HomeView,
  map: MapView,
  blood: StockView,
  alerts: AlertsView,
  verify: OtpView,
  request: DispatchView,
}

export function HemoApp() {
  return (
    <GridProvider>
      <div className="min-h-dvh w-full bg-muted sm:py-6">
        <AppShell />
      </div>
    </GridProvider>
  )
}

function AppShell() {
  const { tab, role, session } = useGrid()
  const authorized = hasPortalAccess(session, role)
  const PortalView = role === 'donor' ? DonorDashboard : role === 'driver' ? DriverDashboard : VIEWS[tab]
  const View = authorized ? PortalView : AccessDenied
  const viewKey = `${authorized ? 'ok' : 'denied'}-${role === 'hospital' ? `hospital-${tab}` : role}`

  return (
    <div className="relative mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-background sm:h-[min(920px,calc(100dvh-3rem))] sm:rounded-[36px] sm:border sm:shadow-xl">
      <SessionBar />
      <AppHeader />
      {authorized && <AuthBanner session={session} />}
      <main className="relative isolate min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            <View />
          </motion.div>
        </AnimatePresence>
        <GridToast />
      </main>
      {role === 'hospital' && authorized && <BottomDock />}
      <ForbiddenModal />
      <NccEmergencyModal />
      <BloodExpiryRadarModal />
    </div>
  )
}
