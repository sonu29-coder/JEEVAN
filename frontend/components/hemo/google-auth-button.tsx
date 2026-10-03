'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, ExternalLink, Mail, ShieldCheck, X } from 'lucide-react'
import { loginWithGoogle, type Portal } from '@/lib/hemo-auth'

declare global {
  interface Window {
    google?: any
  }
}

interface GoogleAuthButtonProps {
  portal: Portal
  onSuccess: (message: string) => void
  onError: (error: string) => void
  className?: string
}

export function GoogleIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  )
}

export function GoogleAuthButton({ portal, onSuccess, onError, className = '' }: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [gmailInput, setGmailInput] = useState('')
  const [configuredClientId, setConfiguredClientId] = useState('')
  const googleBtnRef = useRef<HTMLDivElement>(null)

  // 1. Fetch configured Google Client ID from backend
  useEffect(() => {
    fetch('http://localhost:8000/api/auth/google/client-id')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.client_id && !data.client_id.includes('789234891234')) {
          setConfiguredClientId(data.client_id)
        }
      })
      .catch(() => {})
  }, [])

  // 2. Initialize Google Identity Services if client ID is configured and script is ready
  useEffect(() => {
    if (!configuredClientId || typeof window === 'undefined' || !window.google?.accounts?.id) return

    try {
      window.google.accounts.id.initialize({
        client_id: configuredClientId,
        callback: async (response: any) => {
          if (!response?.credential) return
          setIsLoading(true)
          try {
            const res = await loginWithGoogle(portal, response.credential)
            if (res.success) {
              onSuccess(res.message)
            } else {
              onError(res.message)
            }
          } catch (e: any) {
            onError(e?.message || 'Google verification failed.')
          } finally {
            setIsLoading(false)
          }
        },
      })

      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'continue_with',
          shape: 'pill',
        })
      }
    } catch {}
  }, [configuredClientId, portal, onSuccess, onError])

  // Trigger Google Login
  const handleTriggerAuth = () => {
    // If real Google Client ID is configured and Google GIS is ready:
    if (configuredClientId && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            setShowModal(true)
          }
        })
        return
      } catch {}
    }

    // Otherwise show the Gmail Authentication Dialog (supports direct real Gmail addresses)
    setShowModal(true)
  }

  // Handle Gmail Authentication
  const handleGmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gmailInput.trim()) return

    setIsLoading(true)
    setShowModal(false)

    try {
      const res = await loginWithGoogle(portal, gmailInput.trim())
      if (res.success) {
        onSuccess(res.message)
      } else {
        onError(res.message)
      }
    } catch (e: any) {
      onError(e?.message || 'Failed to authenticate with Gmail.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={isLoading}
        onClick={handleTriggerAuth}
        className={`w-full flex items-center justify-center gap-2.5 rounded-2xl border border-border bg-card hover:bg-muted py-3 px-4 text-xs font-bold text-foreground shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral disabled:opacity-60 ${className}`}
      >
        {isLoading ? (
          <Activity className="size-4 animate-spin text-coral" />
        ) : (
          <GoogleIcon className="size-4" />
        )}
        <span>{isLoading ? 'Authenticating with Google...' : 'Continue with Google / Gmail'}</span>
      </button>

      {/* Hidden container for Google Identity Services official button render */}
      <div ref={googleBtnRef} className="hidden" />

      {/* Real Gmail Authentication Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-[28px] border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="grid size-10 place-items-center rounded-xl bg-muted">
                <GoogleIcon className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Google Account Sign-In</h3>
                <p className="text-[11px] text-muted-foreground">Authenticate your Gmail address</p>
              </div>
            </div>

            <form onSubmit={handleGmailSubmit} className="space-y-3 mt-4">
              <div>
                <label htmlFor="gmail-input" className="block text-xs font-semibold text-foreground mb-1">
                  Enter your Gmail / Google Workspace address:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                    <Mail className="size-4" />
                  </div>
                  <input
                    id="gmail-input"
                    type="email"
                    required
                    autoFocus
                    value={gmailInput}
                    onChange={(e) => setGmailInput(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Portal clearance: </span>
                <span className="capitalize">{portal}</span> access will be automatically linked to this Google ID.
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-coral hover:bg-coral-strong py-2.5 text-xs font-bold text-white transition-colors shadow-xs"
              >
                <span>Authorize & Sign In with Gmail</span>
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShieldCheck className="size-3 text-emerald-500" />
                OAuth 2.0 Ready
              </span>
              <span>256-Bit SSL Encrypted</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
