'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bike,
  CheckCircle2,
  Droplets,
  Eye,
  EyeOff,
  HeartHandshake,
  Hospital,
  Info,
  Lock,
  Mail,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  X,
} from 'lucide-react'
import { GoogleAuthButton } from './google-auth-button'
import {
  PORTAL_ACCESS,
  loginUser,
  type AuthRole,
  type Portal,
} from '@/lib/hemo-auth'
import { useGrid } from './grid-store'
import { JeevanLogo } from './jeevan-logo'

interface CentralizedAuthFlowProps {
  initialStage?: 'auth' | 'select'
  onCancel?: () => void
}

export function CentralizedAuthFlow({ initialStage = 'auth', onCancel }: CentralizedAuthFlowProps) {
  const router = useRouter()
  const { login, currentUser: existingUser } = useGrid()

  const [stage, setStage] = useState<'auth' | 'select'>(
    initialStage === 'select' && existingUser ? 'select' : 'auth'
  )

  // Form inputs - strictly un-prefilled as per requirements
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  // UI States
  const [showPassword, setShowPassword] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordInput, setForgotPasswordInput] = useState('')
  const [forgotPasswordSubmitted, setForgotPasswordSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [authenticatedUser, setAuthenticatedUser] = useState<any>(existingUser || null)

  // Helpful client-side validation
  const validateForm = () => {
    const cleanName = fullName.trim()
    const cleanEmail = email.trim()
    const cleanPassword = password.trim()

    if (!cleanName) {
      setErrorMessage('Please enter your full name.')
      return false
    }

    if (!cleanEmail) {
      setErrorMessage('Please enter your email address.')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address (e.g., name@example.com).')
      return false
    }

    if (!cleanPassword) {
      setErrorMessage('Please enter your password.')
      return false
    }

    if (cleanPassword.length < 4) {
      setErrorMessage('Password must be at least 4 characters long.')
      return false
    }

    return true
  }

  // Handle Form Submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage('')

    if (!validateForm()) return

    const cleanEmail = email.trim()
    const cleanName = fullName.trim()
    const cleanPhone = phone.trim()
    const cleanPassword = password.trim()

    setIsLoading(true)

    try {
      // Determine probable role by email or check all portals
      const targetPortal: Portal =
        cleanEmail.includes('donor')
          ? 'donor'
          : cleanEmail.includes('driver') || cleanEmail.includes('rider')
          ? 'driver'
          : 'hospital'

      const authRes = await loginUser(targetPortal, cleanEmail, cleanPassword)

      if (authRes.success) {
        const userObj = {
          ...authRes.user,
          name: cleanName || authRes.user?.name || cleanEmail.split('@')[0],
          email: cleanEmail,
          phone: cleanPhone || authRes.user?.phone,
          role: authRes.role,
          allowed_roles: authRes.user?.allowed_roles || authRes.role,
          token: authRes.token,
        }
        setAuthenticatedUser(userObj)
        setStage('select')
      } else {
        setErrorMessage(
          authRes.message || 'Invalid email or password. Please verify your details and try again.'
        )
      }
    } catch {
      setErrorMessage('Unable to connect to the authentication service. Please check your connection and try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Google Auth Success
  const handleGoogleSuccess = (result: { message: string; user?: any; role?: any }) => {
    setErrorMessage('')
    const gUser = result.user || {}
    const userRole = result.role || gUser.role || 'ICU_HOSPITAL'

    const userObj = {
      ...gUser,
      name: gUser.name || fullName || 'Google Verified User',
      email: gUser.email || email || 'user@gmail.com',
      phone: gUser.phone || phone || '+91 98765 43210',
      role: userRole,
      allowed_roles: gUser.allowed_roles || userRole,
      token: gUser.token || 'GOOGLE-AUTH-TOKEN',
    }

    setAuthenticatedUser(userObj)
    setStage('select')
  }

  // Handle Dashboard Selection & Strict Role Authorization Check
  const handleDashboardSelect = (targetPortal: Portal) => {
    setErrorMessage('')

    const requiredAuthRole = PORTAL_ACCESS[targetPortal].required
    const userRole = authenticatedUser?.role as AuthRole | undefined
    const allowedRoles = (authenticatedUser?.allowed_roles || '').split(',')

    // Check authorization: does the user's role match or is it allowed?
    const isAuthorized =
      userRole === requiredAuthRole ||
      userRole === ('ADMIN' as any) ||
      allowedRoles.includes(requiredAuthRole)

    if (isAuthorized) {
      login(targetPortal, requiredAuthRole, authenticatedUser)
      if (onCancel) onCancel()

      const targetRoute =
        targetPortal === 'hospital'
          ? '/icu/dashboard'
          : targetPortal === 'donor'
          ? '/donor/dashboard'
          : '/delivery/dashboard'
      try {
        router.push(targetRoute)
      } catch {}
    } else {
      const currentRoleLabel =
        userRole === 'ICU_HOSPITAL'
          ? 'Hospital / ICU'
          : userRole === 'REGISTERED_DONOR'
          ? 'Blood Donor'
          : userRole === 'DELIVERY_PARTNER'
          ? 'Delivery Partner'
          : userRole || 'Current'

      const targetTitle =
        targetPortal === 'hospital'
          ? 'Hospital / ICU'
          : targetPortal === 'donor'
          ? 'Blood Donor'
          : 'Delivery Partner'

      setErrorMessage(
        `Access Restricted: Your account (${currentRoleLabel}) is not authorized for the ${targetTitle} dashboard. Please select your authorized dashboard or contact your administrator.`
      )
    }
  }

  // Helper to test if a dashboard is authorized
  const isDashboardAuthorized = (targetPortal: Portal) => {
    const requiredAuthRole = PORTAL_ACCESS[targetPortal].required
    const userRole = authenticatedUser?.role as AuthRole | undefined
    const allowedRoles = (authenticatedUser?.allowed_roles || '').split(',')
    return (
      userRole === requiredAuthRole ||
      userRole === ('ADMIN' as any) ||
      allowedRoles.includes(requiredAuthRole)
    )
  }

  return (
    <div className="flex w-full flex-col bg-card">
      {/* Top Header */}
      <header className="z-30 shrink-0 border-b border-border/80 px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <JeevanLogo iconSize="md" showText={true} showSubtitle={true} />
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
            >
              Back
            </button>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border/60">
            <ShieldCheck className="size-3 text-emerald-500" />
            <span>Secure RBAC</span>
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-5 sm:p-6 flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {stage === 'auth' ? (
            /* STAGE 1: Clean, Modern, User-Friendly Login Form */
            <motion.div
              key="auth-stage"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* Friendly Heading & Subtitle */}
              <div className="text-left sm:text-center pt-1 pb-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Welcome to JEEVAN
                </h1>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Connecting hospitals, blood donors, and delivery partners.
                </p>
              </div>

              {/* Prominent Google Sign-in */}
              <div className="pt-1">
                <GoogleAuthButton
                  portal="hospital"
                  className="w-full py-2.5 text-xs font-semibold"
                  onSuccess={handleGoogleSuccess}
                  onError={(err) => setErrorMessage(err)}
                />
              </div>

              {/* Clear Divider */}
              <div className="relative flex items-center justify-center my-3">
                <div className="w-full border-t border-border" />
                <span className="absolute bg-card px-3 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  or sign in with details
                </span>
              </div>

              {/* Login Form Fields: Full Name, Email, Mobile Number, Password */}
              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                {/* 1. Full Name */}
                <div className="space-y-1">
                  <label htmlFor="login-fullname" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <User className="size-3.5 text-coral" />
                    <span>Full Name</span>
                  </label>
                  <input
                    id="login-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value)
                      if (errorMessage) setErrorMessage('')
                    }}
                    placeholder="Enter your full name"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral transition-colors"
                  />
                </div>

                {/* 2. Email Address */}
                <div className="space-y-1">
                  <label htmlFor="login-email" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Mail className="size-3.5 text-coral" />
                    <span>Email Address</span>
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (errorMessage) setErrorMessage('')
                    }}
                    placeholder="Enter your email address"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral transition-colors"
                  />
                </div>

                {/* 3. Mobile Number */}
                <div className="space-y-1">
                  <label htmlFor="login-phone" className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Phone className="size-3.5 text-coral" />
                      <span>Mobile Number</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
                  </label>
                  <input
                    id="login-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value)
                      if (errorMessage) setErrorMessage('')
                    }}
                    placeholder="Enter your mobile number"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral transition-colors"
                  />
                </div>

                {/* 4. Password with Show/Hide & Forgot Password */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Lock className="size-3.5 text-coral" />
                      <span>Password</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs font-medium text-coral hover:underline focus:outline-none cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (errorMessage) setErrorMessage('')
                      }}
                      placeholder="Enter your password"
                      className="w-full rounded-xl border border-border bg-background pl-3.5 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Helpful Validation / Error Banner */}
                {errorMessage && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2.5 animate-in fade-in duration-200">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <span className="flex-1 leading-relaxed font-medium">{errorMessage}</span>
                  </div>
                )}

                {/* Prominent Primary Login Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-coral hover:bg-coral-strong py-3 text-xs font-bold text-white shadow-md active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer mt-3"
                >
                  {isLoading ? (
                    <>
                      <Activity className="size-4 animate-spin text-white" />
                      <span>Signing In...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In & Continue</span>
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          ) : (
            /* STAGE 2: Simplified Dashboard Selection with Role Authorization */
            <motion.div
              key="select-stage"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <div className="text-center pt-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 mb-2">
                  <CheckCircle2 className="size-3.5" />
                  <span>Authenticated Successfully</span>
                </span>
                <h2 className="text-xl font-bold text-foreground">
                  Welcome, {authenticatedUser?.name || 'User'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select your authorized dashboard to continue:
                </p>
              </div>

              {/* Only Authorized Workspaces Displayed */}
              <div className="space-y-2.5 pt-1">
                {isDashboardAuthorized('hospital') && (
                  <button
                    type="button"
                    onClick={() => handleDashboardSelect('hospital')}
                    className="w-full text-left rounded-2xl border border-border bg-background hover:border-red-500/50 hover:bg-red-500/5 shadow-xs cursor-pointer p-3.5 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl shrink-0 bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                        <Hospital className="size-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-foreground">Hospital & ICU Workspace</h3>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            <span>Authorized</span>
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          Emergency transfusions, patient blood requests, and live inventory management.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/50 text-[11px]">
                      <span className="text-muted-foreground">Workspace: Hospital Clinical Staff</span>
                      <span className="font-bold flex items-center gap-1 text-red-600 dark:text-red-400">
                        <span>Open Workspace</span>
                        <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </button>
                )}

                {isDashboardAuthorized('donor') && (
                  <button
                    type="button"
                    onClick={() => handleDashboardSelect('donor')}
                    className="w-full text-left rounded-2xl border border-border bg-background hover:border-rose-500/50 hover:bg-rose-500/5 shadow-xs cursor-pointer p-3.5 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl shrink-0 bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                        <Droplets className="size-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-foreground">Blood Donor Workspace</h3>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            <span>Authorized</span>
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          View active donation alerts, schedule appointments, and donate blood.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/50 text-[11px]">
                      <span className="text-muted-foreground">Workspace: Registered Voluntary Donor</span>
                      <span className="font-bold flex items-center gap-1 text-rose-600 dark:text-rose-400">
                        <span>Open Workspace</span>
                        <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </button>
                )}

                {isDashboardAuthorized('driver') && (
                  <button
                    type="button"
                    onClick={() => handleDashboardSelect('driver')}
                    className="w-full text-left rounded-2xl border border-border bg-background hover:border-emerald-500/50 hover:bg-emerald-500/5 shadow-xs cursor-pointer p-3.5 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 place-items-center rounded-xl shrink-0 bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                        <Bike className="size-5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-foreground">Logistics Courier Workspace</h3>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            <span>Authorized</span>
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          Rapid cold-chain logistics dispatch, route navigation, and secure OTP handovers.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/50 text-[11px]">
                      <span className="text-muted-foreground">Workspace: Medical Courier</span>
                      <span className="font-bold flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <span>Open Workspace</span>
                        <ArrowRight className="size-3" />
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* Role Rejection Error Message */}
              {errorMessage && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 animate-in fade-in duration-200">
                  <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <p className="flex-1 leading-relaxed">{errorMessage}</p>
                </div>
              )}

              {/* Switch Account Option */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('')
                    setStage('auth')
                  }}
                  className="text-xs font-semibold text-coral hover:underline cursor-pointer"
                >
                  ← Sign in with a different account
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Subtle, Non-Distracting Footer */}
        <div className="pt-4 border-t border-border mt-4 text-center">
          <p className="text-[11px] text-muted-foreground font-medium">
            JEEVAN Emergency Blood Transmission Grid • Secure Portal
          </p>
        </div>
      </main>

      {/* Forgot Password Modal Dialog */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => {
                setShowForgotPassword(false)
                setForgotPasswordSubmitted(false)
                setForgotPasswordInput('')
              }}
              className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="grid size-10 place-items-center rounded-xl bg-coral/10 text-coral">
                <Lock className="size-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Reset Your Password</h3>
                <p className="text-[11px] text-muted-foreground">JEEVAN Account Recovery</p>
              </div>
            </div>

            {forgotPasswordSubmitted ? (
              <div className="space-y-3 pt-2 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-6" />
                </div>
                <h4 className="text-sm font-bold text-foreground">Recovery Instructions Sent</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  If an account matches <strong>{forgotPasswordInput}</strong>, password reset instructions and a verification code have been dispatched.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false)
                    setForgotPasswordSubmitted(false)
                    setForgotPasswordInput('')
                  }}
                  className="w-full rounded-xl bg-coral py-2.5 text-xs font-bold text-white shadow-xs hover:bg-coral-strong transition-colors cursor-pointer mt-2"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!forgotPasswordInput.trim()) return
                  setForgotPasswordSubmitted(true)
                }}
                className="space-y-3.5 mt-2"
              >
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter your registered email address or mobile number to receive a secure recovery code.
                </p>
                <div className="space-y-1">
                  <label htmlFor="recovery-input" className="text-xs font-semibold text-foreground">
                    Email or Mobile Number
                  </label>
                  <input
                    id="recovery-input"
                    type="text"
                    required
                    value={forgotPasswordInput}
                    onChange={(e) => setForgotPasswordInput(e.target.value)}
                    placeholder="e.g. name@example.com or +91 98765 43210"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral transition-colors"
                  />
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
                  <Info className="size-3.5 shrink-0 mt-0.5 text-coral" />
                  <span>Hospital staff can also contact their node administrator for immediate access reset.</span>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-coral hover:bg-coral-strong py-2.5 text-xs font-bold text-white transition-colors shadow-xs cursor-pointer"
                >
                  <span>Send Recovery Instructions</span>
                  <ArrowRight className="size-3.5" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
