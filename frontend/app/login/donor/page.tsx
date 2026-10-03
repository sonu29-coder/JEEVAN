'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Droplets,
  Eye,
  EyeOff,
  Heart,
  KeyRound,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react'
import { GoogleAuthButton } from '@/components/hemo/google-auth-button'
import {
  DEMO_USERS,
  loginUser,
  registerDonorUser,
  sendDonorOtp,
  verifyDonorOtp,
} from '@/lib/hemo-auth'

const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

export default function DonorLoginPage() {
  const router = useRouter()
  const donors = DEMO_USERS.donor
  const defaultDonor = donors[0] // Sneha Menon

  // Mode: Sign In vs Sign Up
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')

  // Sign In States
  const [identifier, setIdentifier] = useState(defaultDonor.email)
  const [password, setPassword] = useState(defaultDonor.defaultPassword)
  const [selectedDonor, setSelectedDonor] = useState(defaultDonor)
  const [showPassword, setShowPassword] = useState(false)

  // Sign Up / Registration States
  const [regName, setRegName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regBloodGroup, setRegBloodGroup] = useState('O+')

  // OTP Verification States
  const [mobileNumber, setMobileNumber] = useState('')
  const [formattedPhone, setFormattedPhone] = useState('')
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpSent, setOtpSent] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [verificationToken, setVerificationToken] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [otpTimeLeft, setOtpTimeLeft] = useState(120) // Exactly 2 minutes validity
  const [demoOtp, setDemoOtp] = useState<string | null>(null)
  const [gatewayNotice, setGatewayNotice] = useState<string | null>(null)

  // Common UI States
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [configNotice, setConfigNotice] = useState<string | null>(null)

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // 2-minute OTP validity countdown (02:00 -> 00:00)
  useEffect(() => {
    if (!otpSent || phoneVerified || otpTimeLeft <= 0) return
    const timer = setInterval(() => {
      setOtpTimeLeft((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [otpSent, phoneVerified, otpTimeLeft])

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`
  }

  // Reset errors on mode change
  const handleModeSwitch = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setErrorMsg('')
    setSuccessMsg('')
    setConfigNotice(null)
  }

  const handleSelectDonor = (donor: typeof defaultDonor) => {
    setSelectedDonor(donor)
    setIdentifier(donor.email)
    setPassword(donor.defaultPassword)
    setErrorMsg('')
  }

  // -----------------------------------------------------------------
  // Returning Donor Login
  // -----------------------------------------------------------------
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setIsLoading(true)

    try {
      const res = await loginUser('donor', identifier, password)
      if (res.success) {
        setSuccessMsg(res.message)
        setTimeout(() => {
          router.push('/?role=donor')
        }, 500)
      } else {
        setErrorMsg(res.message)
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  // -----------------------------------------------------------------
  // Step 1: Send REAL SMS OTP
  // -----------------------------------------------------------------
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setConfigNotice(null)
    setDemoOtp(null)
    setGatewayNotice(null)

    const clean = mobileNumber.replace(/\D/g, '')
    if (clean.length < 10) {
      setErrorMsg('Please enter a valid mobile number.')
      return
    }

    setIsLoading(true)
    try {
      const res = await sendDonorOtp(clean)
      if (res.success) {
        setOtpSent(true)
        setFormattedPhone(res.formattedPhone || `+91 ${clean.slice(-10)}`)
        setOtpTimeLeft(res.expiresInSeconds || 120)
        setResendCooldown(res.cooldownSeconds || 45)
        setOtpDigits(['', '', '', '', '', ''])
        setSuccessMsg(res.message)
        if (res.demoOtp) {
          setDemoOtp(res.demoOtp)
        }
        if (res.gatewayNotice) {
          setGatewayNotice(res.gatewayNotice)
        }
        // Focus first OTP input on next render
        setTimeout(() => otpInputsRef.current[0]?.focus(), 150)
      } else {
        setErrorMsg(res.message)
        if (res.status === 503 || res.rawError?.includes('SMS_PROVIDER')) {
          setConfigNotice(res.message)
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to send verification code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // -----------------------------------------------------------------
  // Step 2: Verify Submitted OTP
  // -----------------------------------------------------------------
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setConfigNotice(null)

    if (otpTimeLeft <= 0) {
      setErrorMsg('This code has expired. Request a new code.')
      return
    }

    const enteredOtp = otpDigits.join('').trim()
    if (enteredOtp.length !== 6) {
      setErrorMsg('Please enter the full 6-digit verification code.')
      return
    }

    const clean = mobileNumber.replace(/\D/g, '')
    setIsLoading(true)
    try {
      const res = await verifyDonorOtp(clean, enteredOtp)
      if (res.success && res.verified) {
        setPhoneVerified(true)
        setVerificationToken(res.verificationToken || null)
        setSuccessMsg('Mobile number verified successfully!')
      } else {
        setErrorMsg(res.message)
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Verification failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // OTP input digit change
  const handleOtpDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1)
    const next = [...otpDigits]
    next[index] = char
    setOtpDigits(next)
    setErrorMsg('')

    if (char && index < 5) {
      otpInputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        const next = [...otpDigits]
        next[index - 1] = ''
        setOtpDigits(next)
        otpInputsRef.current[index - 1]?.focus()
      } else {
        const next = [...otpDigits]
        next[index] = ''
        setOtpDigits(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputsRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...otpDigits]
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || ''
    }
    setOtpDigits(next)
    const nextFocus = Math.min(pasted.length, 5)
    otpInputsRef.current[nextFocus]?.focus()
  }

  // -----------------------------------------------------------------
  // Step 3: Complete Donor Registration
  // -----------------------------------------------------------------
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneVerified) {
      setErrorMsg('Please verify your mobile number first.')
      return
    }
    if (!regName.trim() || regName.length < 2) {
      setErrorMsg('Please enter your full legal name.')
      return
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.')
      return
    }
    if (!regPassword || regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.')
      return
    }

    setErrorMsg('')
    setSuccessMsg('')
    setIsLoading(true)

    try {
      const res = await registerDonorUser({
        name: regName.trim(),
        email: regEmail.trim(),
        password: regPassword,
        phoneNumber: mobileNumber,
        verificationToken: verificationToken || undefined,
        bloodGroup: regBloodGroup,
      })

      if (res.success) {
        setSuccessMsg(res.message)
        setTimeout(() => {
          router.push('/?role=donor')
        }, 600)
      } else {
        setErrorMsg(res.message)
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh w-full bg-muted sm:py-6 flex items-center justify-center">
      <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-background sm:h-[min(940px,calc(100dvh-3rem))] sm:rounded-[36px] sm:border sm:shadow-xl">
        {/* Top Header */}
        <header className="z-30 shrink-0 border-b bg-background px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="grid size-9 place-items-center rounded-xl border bg-card text-foreground transition-colors hover:bg-muted"
              aria-label="Back to home"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Droplets className="size-3.5" />
                Donor Portal
              </p>
              <p className="text-xs text-muted-foreground font-medium">Voluntary Blood Donors</p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40 px-2 py-0.5 rounded-full">
            <Heart className="size-3 fill-rose-500/20" />
            Life Saver
          </span>
        </header>

        {/* Mode Switcher Tabs */}
        <div className="shrink-0 p-3 bg-muted/30 border-b border-border">
          <div className="grid grid-cols-2 p-1 bg-card rounded-2xl border border-border">
            <button
              type="button"
              id="donor-tab-signin"
              onClick={() => handleModeSwitch('signin')}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                authMode === 'signin'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Donor Sign In
            </button>
            <button
              type="button"
              id="donor-tab-signup"
              onClick={() => handleModeSwitch('signup')}
              className={`py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                authMode === 'signup'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="size-3.5" />
              New Donor Sign Up
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto no-scrollbar p-5 flex flex-col justify-between">
          <div>
            {/* Title Badge */}
            <div className="flex items-center gap-3 mb-4">
              <div className="grid size-12 place-items-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-600/20 shrink-0">
                <Heart className="size-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-foreground tracking-tight leading-tight">
                  {authMode === 'signin' ? 'Blood Donor Sign-In' : 'Donor Registration'}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {authMode === 'signin'
                    ? 'Emergency SOS on-call response'
                    : 'Verify your phone & join the lifesaving network'}
                </p>
              </div>
            </div>

            {/* Error & Success Messages */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-600 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400 flex items-start gap-2 mb-3"
                >
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}
              {configNotice && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200 flex items-start gap-2 mb-3"
                >
                  <ShieldAlert className="size-4 shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <p className="font-bold">SMS Gateway Configuration Notice:</p>
                    <p className="text-[11px] mt-0.5 opacity-90">{configNotice}</p>
                  </div>
                </motion.div>
              )}
              {successMsg && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2 mb-3"
                >
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{successMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ========================================================= */}
            {/* VIEW A: RETURNING DONOR SIGN IN */}
            {/* ========================================================= */}
            {authMode === 'signin' && (
              <div>
                {/* Real Google / Gmail Authentication Component */}
                <GoogleAuthButton
                  portal="donor"
                  className="mb-3"
                  onSuccess={(msg) => {
                    setSuccessMsg(msg)
                    setTimeout(() => router.push('/?role=donor'), 500)
                  }}
                  onError={(err) => setErrorMsg(err)}
                />

                {/* Divider */}
                <div className="relative flex items-center justify-center my-3">
                  <div className="w-full border-t border-border" />
                  <span className="absolute bg-background px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    or donor account
                  </span>
                </div>

                {/* Demo Donor Selector */}
                <div className="mb-4">
                  <p className="text-[11px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Sparkles className="size-3 text-rose-500" />
                    Select Instant Demo Donor:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {donors.map((d) => {
                      const isSelected = selectedDonor.email === d.email
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleSelectDonor(d)}
                          className={`text-left p-2.5 rounded-2xl border transition-all ${
                            isSelected
                              ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-foreground ring-1 ring-rose-500'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground truncate">
                              {d.name.split(' ')[0]}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200">
                              {d.name.includes('Sneha') ? 'O-' : 'B+'}
                            </span>
                          </div>
                          <p className="text-[10px] truncate text-muted-foreground mt-0.5">{d.email}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <label htmlFor="donor-email" className="block text-xs font-semibold text-foreground mb-1">
                      Donor Email or Mobile Phone
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                        <Mail className="size-4" />
                      </div>
                      <input
                        id="donor-email"
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="e.g. sneha.donor@gmail.com or 9876543210"
                        className="w-full rounded-2xl border border-border bg-card pl-9 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="donor-password" className="text-xs font-semibold text-foreground">
                        Password
                      </label>
                      <span className="text-[10px] text-muted-foreground font-mono">DonorPassword2026!</span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                        <Lock className="size-4" />
                      </div>
                      <input
                        id="donor-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full rounded-2xl border border-border bg-card pl-9 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    id="btn-donor-login"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Activity className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    <span>{isLoading ? 'Verifying Donor Registry...' : 'Sign In as Donor'}</span>
                  </button>
                </form>
              </div>
            )}

            {/* ========================================================= */}
            {/* VIEW B: FIRST-TIME DONOR REGISTRATION + REAL PHONE OTP */}
            {/* ========================================================= */}
            {authMode === 'signup' && (
              <div className="space-y-4">
                {/* Stage 1: Phone Number Verification */}
                {!phoneVerified ? (
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    {!otpSent ? (
                      /* Mobile Number Input Stage */
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="grid size-8 place-items-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            <Phone className="size-4" />
                          </span>
                          <div>
                            <h2 className="text-sm font-bold text-foreground">Verify your mobile number</h2>
                            <p className="text-[11px] text-muted-foreground">
                              Enter your mobile number to receive a verification code.
                            </p>
                          </div>
                        </div>

                        <form onSubmit={handleSendOtp} className="mt-3 space-y-3">
                          <div>
                            <label
                              htmlFor="donor-phone-input"
                              className="block text-[11px] font-semibold text-muted-foreground mb-1"
                            >
                              Mobile Number
                            </label>
                            <div className="relative flex items-center">
                              <span className="absolute left-3 text-xs font-bold text-muted-foreground border-r pr-2 border-border">
                                🇮🇳 +91
                              </span>
                              <input
                                id="donor-phone-input"
                                type="tel"
                                required
                                value={mobileNumber}
                                onChange={(e) => {
                                  setMobileNumber(e.target.value)
                                  setErrorMsg('')
                                }}
                                placeholder="98765 43210"
                                className="w-full rounded-2xl border border-border bg-background pl-20 pr-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors"
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              A 6-digit real SMS code will be sent to your mobile phone.
                            </p>
                          </div>

                          <button
                            type="submit"
                            id="btn-send-otp"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-60"
                          >
                            {isLoading ? (
                              <Activity className="size-4 animate-spin" />
                            ) : (
                              <Phone className="size-4" />
                            )}
                            <span>{isLoading ? 'Sending SMS OTP...' : 'Send OTP'}</span>
                          </button>
                        </form>
                      </div>
                    ) : (
                      /* 6-Digit Code Entry Stage */
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="grid size-8 place-items-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              <ShieldCheck className="size-4" />
                            </span>
                            <div>
                              <h2 className="text-sm font-bold text-foreground">
                                Enter the 6-digit code sent to {formattedPhone}
                              </h2>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="size-3 text-rose-500" />
                                Valid for 2 minutes
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setOtpSent(false)
                              setOtpDigits(['', '', '', '', '', ''])
                              setErrorMsg('')
                            }}
                            className="text-[10px] font-bold text-rose-600 hover:underline"
                          >
                            Edit
                          </button>
                        </div>

                        {/* Live 02:00 Countdown Timer Bar */}
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/60 border border-border/80 my-2">
                          <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                            <Clock className={`size-3.5 ${otpTimeLeft <= 30 ? 'text-red-500 animate-pulse' : 'text-rose-600 dark:text-rose-400'}`} />
                            <span>Code validity:</span>
                          </span>
                          <span
                            id="otp-countdown-display"
                            className={`font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg border transition-colors ${
                              otpTimeLeft > 30
                                ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/60 dark:border-rose-900/60 dark:text-rose-300'
                                : otpTimeLeft > 0
                                ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/60 dark:border-amber-800/60 dark:text-amber-300 animate-pulse'
                                : 'bg-red-50 border-red-300 text-red-700 dark:bg-red-950/60 dark:border-red-800/60 dark:text-red-300'
                            }`}
                          >
                            {otpTimeLeft > 0 ? formatCountdown(otpTimeLeft) : '00:00 (Expired)'}
                          </span>
                        </div>

                        {/* Expiry Warning Message */}
                        {otpTimeLeft <= 0 && (
                          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/40 p-2.5 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2 mb-2">
                            <AlertCircle className="size-4 shrink-0" />
                            <span>This code has expired. Request a new code.</span>
                          </div>
                        )}

                        {/* Demo Mode / Gateway Notice Helper Banner */}
                        {demoOtp && (
                          <div className="my-2.5 flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold shrink-0">Demo Code:</span>
                              <span className="font-mono font-bold tracking-widest text-amber-800 dark:text-amber-100">{demoOtp}</span>
                            </div>
                            <button
                              type="button"
                              id="btn-autofill-otp"
                              onClick={() => {
                                const digits = demoOtp.slice(0, 6).split('')
                                while (digits.length < 6) digits.push('')
                                setOtpDigits(digits)
                                setErrorMsg('')
                              }}
                              className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition shadow-xs cursor-pointer"
                            >
                              Auto-fill
                            </button>
                          </div>
                        )}

                        {gatewayNotice && (
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 my-1">
                            Notice: Fast2SMS requires website verification. Demo mode verification code is active above.
                          </p>
                        )}

                        <form onSubmit={handleVerifyOtp} className="mt-3 space-y-3">
                          {/* 6-Digit Individual Boxes */}
                          <div>
                            <div className="flex items-center justify-between gap-1.5 my-2">
                              {otpDigits.map((digit, idx) => (
                                <input
                                  key={idx}
                                  ref={(el) => {
                                    otpInputsRef.current[idx] = el
                                  }}
                                  id={`otp-digit-${idx}`}
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={1}
                                  value={digit}
                                  disabled={otpTimeLeft <= 0}
                                  onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                                  onPaste={handleOtpPaste}
                                  className={`size-11 sm:size-12 rounded-xl border text-center text-lg font-mono font-bold focus:outline-none transition-all ${
                                    otpTimeLeft <= 0
                                      ? 'border-border/50 bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60'
                                      : digit
                                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-foreground ring-1 ring-rose-500'
                                      : 'border-border bg-background text-foreground focus:border-rose-500'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Verify Button - Disabled after expiry */}
                          <button
                            type="submit"
                            id="btn-verify-otp"
                            disabled={isLoading || otpDigits.join('').length !== 6 || otpTimeLeft <= 0}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoading ? (
                              <Activity className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            <span>
                              {isLoading
                                ? 'Verifying Code...'
                                : otpTimeLeft <= 0
                                ? 'Code Expired - Request New Code'
                                : 'Verify OTP'}
                            </span>
                          </button>

                          {/* Resend OTP Bar */}
                          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                            <span className="text-[11px] text-muted-foreground">Didn&apos;t receive the code?</span>
                            <button
                              type="button"
                              id="btn-resend-otp"
                              onClick={handleSendOtp}
                              disabled={resendCooldown > 0 || isLoading}
                              className="text-xs font-bold text-rose-600 hover:underline disabled:text-muted-foreground disabled:no-underline flex items-center gap-1"
                            >
                              <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
                              <span>
                                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                              </span>
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Verified Phone Badge */
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/40 p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
                        <CheckCircle2 className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1">
                          Phone Verified Successfully
                        </p>
                        <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                          {formattedPhone || mobileNumber}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 dark:text-emerald-200 px-2 py-0.5 rounded-full">
                      Verified
                    </span>
                  </div>
                )}

                {/* Stage 2: Donor Account Registration Details (Unlocked once phone verified) */}
                {phoneVerified && (
                  <motion.form
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleCompleteRegistration}
                    className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
                  >
                    <p className="text-xs font-bold text-foreground mb-1 flex items-center gap-1.5">
                      <Heart className="size-3.5 text-rose-600" />
                      Complete Donor Profile
                    </p>

                    <div>
                      <label htmlFor="reg-name" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        Full Name
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                          <UserIcon className="size-4" />
                        </div>
                        <input
                          id="reg-name"
                          type="text"
                          required
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="e.g. Kavya Nair"
                          className="w-full rounded-2xl border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-email" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                          <Mail className="size-4" />
                        </div>
                        <input
                          id="reg-email"
                          type="email"
                          required
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="kavya.donor@gmail.com"
                          className="w-full rounded-2xl border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        Blood Group
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {BLOOD_GROUPS.map((grp) => (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setRegBloodGroup(grp)}
                            className={`py-1.5 rounded-xl border text-xs font-bold transition-all ${
                              regBloodGroup === grp
                                ? 'border-rose-500 bg-rose-600 text-white shadow-sm'
                                : 'border-border bg-background text-foreground hover:bg-muted'
                            }`}
                          >
                            {grp}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-password" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        Create Password (min 6 chars)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                          <Lock className="size-4" />
                        </div>
                        <input
                          id="reg-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full rounded-2xl border border-border bg-background pl-9 pr-10 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      id="btn-complete-donor-reg"
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-700 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-all focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-60"
                    >
                      {isLoading ? (
                        <Activity className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      <span>
                        {isLoading ? 'Creating Verified Donor...' : 'Complete Donor Registration'}
                      </span>
                    </button>
                  </motion.form>
                )}
              </div>
            )}
          </div>

          {/* Switch Role Links Footer */}
          <div className="pt-4 border-t border-border mt-4 text-center">
            <p className="text-[11px] text-muted-foreground mb-2">Switch to a different portal:</p>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/login/icu"
                className="text-xs font-bold text-coral hover:underline flex items-center gap-1"
              >
                <span>🏥 ICU Login</span>
              </Link>
              <span className="text-muted-foreground text-xs">•</span>
              <Link
                href="/login/driver"
                className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
              >
                <span>🛵 Driver Login</span>
              </Link>
              <span className="text-muted-foreground text-xs">•</span>
              <Link href="/login" className="text-xs font-bold text-foreground hover:underline">
                <span>All</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
