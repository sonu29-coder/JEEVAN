'use client'

import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  const id = setInterval(callback, 1000)
  return () => clearInterval(id)
}

const getSnapshot = () => Math.floor(Date.now() / 1000) * 1000
const getServerSnapshot = () => 0

/** Ticking clock (1s). Returns 0 during SSR/hydration to avoid mismatches. */
export function useNow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
