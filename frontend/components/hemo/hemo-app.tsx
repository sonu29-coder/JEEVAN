'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { hasPortalAccess } from '@/lib/hemo-auth'
import { AccessDenied, ForbiddenModal } from './access-control'
import { AlertsView } from './alerts-view'
import { AppHeader } from './app-header'
import { BottomDock } from './bottom-dock'
import { CentralizedAuthFlow } from './centralized-auth-flow'
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
import { SplashScreen } from './splash-screen'
import { WorkspaceSwitcherModal } from './workspace-switcher-modal'

const VIEWS = {
  home: HomeView,
  map: MapView,
  blood: StockView,
  alerts: AlertsView,
  verify: OtpView,
  request: DispatchView,
}

export function HemoApp({ initialRole }: { initialRole?: import('./grid-store').Role } = {}) {
  return (
    <GridProvider initialRole={initialRole}>
      <AppShell />
    </GridProvider>
  )
}

function AppShell() {
  const [showSplash, setShowSplash] = useState(true)
  const {
    tab,
    role,
    session,
    isAuthenticated,
    isWorkspaceLoading,
    finishWorkspaceLoading,
    showDashboardSelector,
    setShowDashboardSelector,
  } = useGrid()
  const authorized = hasPortalAccess(session, role)
  const PortalView = role === 'donor' ? DonorDashboard : role === 'driver' ? DriverDashboard : VIEWS[tab]
  const View = authorized ? PortalView : AccessDenied
  const viewKey = `${authorized ? 'ok' : 'denied'}-${role === 'hospital' ? `hospital-${tab}` : role}`

  return (
    <>
      {/* 1. Professional Splash Screen & Workspace Loading Transition Screen */}
      <AnimatePresence mode="wait">
        {showSplash ? (
          <SplashScreen key="initial-splash-view" durationMs={1800} onFinish={() => setShowSplash(false)} />
        ) : isWorkspaceLoading ? (
          <SplashScreen
            key="workspace-splash-view"
            durationMs={1200}
            onFinish={() => finishWorkspaceLoading()}
          />
        ) : null}
      </AnimatePresence>

      {/* 2. Unauthenticated: Centralized Login Page */}
      {!isAuthenticated ? (
        <div className="flex min-h-dvh w-full items-center justify-center p-3 sm:p-6 bg-muted/40">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
            <CentralizedAuthFlow initialStage="auth" />
            <GridToast />
          </div>
        </div>
      ) : (
        /* 3. Authenticated: Clean App Container with Workspace Header & Dashboard */
        <div
          className={`relative mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-background sm:h-[min(920px,calc(100dvh-3rem))] sm:rounded-[36px] sm:border sm:shadow-xl transition-opacity duration-300 ${
            isWorkspaceLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <AppHeader />
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

          {/* Switch Workspace Modal (Shows only authorized dashboards) */}
          <WorkspaceSwitcherModal
            open={showDashboardSelector}
            onClose={() => setShowDashboardSelector(false)}
          />

          <ForbiddenModal />
          <NccEmergencyModal />
          <BloodExpiryRadarModal />
        </div>
      )}
    </>
  )
}
