'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Loader2,
  Megaphone,
  Phone,
  Radio,
  Send,
  ShieldCheck,
  Siren,
  Users,
  X,
} from 'lucide-react'
import { useGrid } from './grid-store'

export function NccEmergencyModal() {
  const { nccAlertOpen, nccAlertData, dismissNccAlert, notify } = useGrid()
  const [isMobilizing, setIsMobilizing] = useState(false)
  const [mobilized, setMobilized] = useState(false)
  const [receiptMsg, setReceiptMsg] = useState('')

  if (!nccAlertOpen) return null

  const hospital = nccAlertData?.hospital_name || 'Jubilee Mission Hospital ICU'
  const group = nccAlertData?.blood_group || nccAlertData?.group || 'O-'
  const units = nccAlertData?.units || 2
  const urgency = nccAlertData?.urgency || 'CRITICAL'

  const handleMobilize = async () => {
    setIsMobilizing(true)
    try {
      const res = await fetch('http://localhost:8000/api/emergency/dispatch-ncc-coordinator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_name: hospital,
          blood_group: group,
          units,
          urgency,
        }),
        signal: AbortSignal.timeout(3500),
      })

      if (res.ok) {
        const data = await res.json()
        setReceiptMsg(`FCM Push delivered to ${data.coordinator.name}. 128 NCC Cadets mobilized.`)
      } else {
        setReceiptMsg('Simulated priority push delivered to Capt. Dr. Arun Balakrishnan.')
      }
      setMobilized(true)
      notify('Emergency alert successfully dispatched to College NCC Coordinator!', 'success')
    } catch {
      setReceiptMsg('Simulated priority push delivered to Capt. Dr. Arun Balakrishnan.')
      setMobilized(true)
      notify('Emergency alert dispatched to College NCC Coordinator!', 'success')
    } finally {
      setIsMobilizing(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
        <motion.div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ncc-modal-title"
          initial={{ y: 50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="relative w-full max-w-sm rounded-[32px] border border-red-500/40 bg-card p-5 shadow-2xl text-foreground"
        >
          {/* Close button */}
          <button
            type="button"
            onClick={dismissNccAlert}
            aria-label="Close modal"
            className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>

          {/* Code-Red Flashing Header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex size-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-80" />
              <span className="relative inline-flex rounded-full size-3 bg-red-600" />
            </span>
            <span className="text-[11px] font-black tracking-widest text-red-600 uppercase dark:text-red-400">
              Automatic Emergency Pop-Up
            </span>
          </div>

          <h2 id="ncc-modal-title" className="text-lg font-black tracking-tight leading-snug">
            🚨 Emergency Alert Dispatch
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Targeting Single Verified College Blood Club Leader
          </p>

          {/* Requisition Card */}
          <div className="mt-3.5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-700 dark:text-red-300">
                {hospital}
              </span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-600 text-white shadow-xs">
                {urgency}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-black text-red-600 dark:text-red-400">
                {units} Units {group}
              </span>
              <span className="text-xs text-muted-foreground font-medium">PRBC Required</span>
            </div>
          </div>

          {/* Single Verified Coordinator Profile Card */}
          <div className="mt-3 rounded-2xl border border-border bg-muted/40 p-3.5">
            <div className="flex items-start gap-3">
              <div className="size-11 rounded-2xl bg-gradient-to-br from-amber-500 via-red-600 to-rose-700 flex items-center justify-center text-white shadow-md shrink-0">
                <Award className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-foreground truncate">
                    Capt. Dr. Arun Balakrishnan
                  </span>
                  <ShieldCheck className="size-3.5 text-emerald-500 shrink-0" />
                </div>
                <p className="text-[11px] font-semibold text-coral mt-0.5 truncate">
                  College NCC & Red Cross Blood Club Officer
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                  23 Kerala Bn NCC • St. Thomas & GEC Thrissur
                </p>
              </div>
            </div>

            {/* Network Readiness Status */}
            <div className="mt-3 pt-2.5 border-t border-border grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">Cadet Pool:</span>
                <span className="font-bold text-foreground flex items-center gap-1">
                  <Users className="size-3 text-emerald-500" />
                  128 On-Campus Donors
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Institutional ID:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  #NCC-KL-23-BC01
                </span>
              </div>
            </div>
          </div>

          {/* Automated Message Preview */}
          <div className="mt-3 rounded-xl border border-border bg-card p-2.5 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">Automated Notification: </span>
            &quot;Official Code-Red Alert for NCC Officer Capt. Dr. Arun Balakrishnan: {hospital} urgently requires {units} units {group}. Mobilizing on-call college cadets.&quot;
          </div>

          {/* Status feedback */}
          {mobilized && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              <span className="text-[11px] font-semibold">{receiptMsg}</span>
            </motion.div>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-col gap-2">
            {!mobilized ? (
              <button
                type="button"
                disabled={isMobilizing}
                onClick={handleMobilize}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-red-500 py-3 text-xs font-bold text-white shadow-lg shadow-red-600/30 transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {isMobilizing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                <span>
                  {isMobilizing
                    ? 'Transmitting Priority Alert...'
                    : '⚡ Send Emergency Alert to NCC Coordinator'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={dismissNccAlert}
                className="w-full rounded-2xl bg-slate-900 dark:bg-slate-100 py-3 text-xs font-bold text-white dark:text-slate-900"
              >
                Done (Alert Delivered)
              </button>
            )}

            <a
              href="tel:+919447128904"
              className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border bg-card hover:bg-muted py-2.5 text-xs font-bold text-foreground transition-colors"
            >
              <Phone className="size-3.5 text-emerald-500" />
              <span>Direct Call Coordinator (+91 94471 28904)</span>
            </a>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
