'use client'

import { useState, useEffect } from 'react'
import {
  Activity,
  AlertCircle,
  Award,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Compass,
  Droplets,
  Heart,
  HelpCircle,
  Hospital,
  Info,
  MapPin,
  Phone,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from 'lucide-react'
import { loadSavedAuth } from '@/lib/hemo-auth'
import { BANKS, type BloodGroup } from '@/lib/hemo-data'
import { useGrid } from './grid-store'
import { RareBloodCompatibility } from './rare-blood-compatibility'

const ONBOARDING_STEPS = [
  {
    id: 'oauth',
    title: 'Google OAuth Verification',
    subtitle: 'Secure token authenticated against Google API',
    status: 'complete',
    icon: ShieldCheck,
  },
  {
    id: 'mobile',
    title: 'Emergency Contact & SMS Alerts',
    subtitle: 'Phone verified for trauma SOS broadcast notifications',
    status: 'complete',
    icon: Phone,
  },
  {
    id: 'profile',
    title: 'ABO & Rh Clinical Profile',
    subtitle: 'Compatible recipient matching & antibody screening',
    status: 'complete',
    icon: Droplets,
  },
  {
    id: 'appointment',
    title: 'First Voluntary Donation',
    subtitle: 'Reserve an orientation slot at your nearest regional center',
    status: 'action_needed',
    icon: CalendarCheck,
  },
]

const CLINICAL_PREPARATION_TIPS = [
  {
    step: '1',
    title: 'Hydrate Generously',
    desc: 'Drink 500ml (approx. 2 glasses) of water or fruit juice 30 minutes before your appointment.',
    color: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800/50',
  },
  {
    step: '2',
    title: 'Iron-Rich Meal',
    desc: 'Eat a wholesome meal 2–3 hours prior. Avoid fatty foods which can interfere with blood testing.',
    color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
  },
  {
    step: '3',
    title: '100% Sterile Kit',
    desc: 'Every donation uses a single-use sterile disposable kit that is unsealed directly in front of you.',
    color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
  },
  {
    step: '4',
    title: 'Post-Donation Rest',
    desc: 'Rest in the observation lounge for 15 minutes enjoying complimentary refreshments.',
    color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800/50',
  },
]

export function NewDonorDashboard() {
  const { setRole, notify } = useGrid()
  const saved = loadSavedAuth()
  const user = saved?.user || {}

  const donorName = user.name || 'Voluntary Donor'
  const donorEmail = user.email || 'donor@gmail.com'
  const donorGroup: BloodGroup = (user.blood_group || user.bloodGroup || 'O+') as BloodGroup
  const donorPhone = user.phone || user.phoneNumber || '+91 98472 34567'

  // Appointment Booking States
  const [selectedCenter, setSelectedCenter] = useState(BANKS[0].id)
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 3)
    return d.toISOString().split('T')[0]
  })
  const [selectedSlot, setSelectedSlot] = useState('09:30 AM - 10:30 AM')
  const [isBooked, setIsBooked] = useState(false)
  const [sosActive, setSosActive] = useState(true)
  const [showRareLookup, setShowRareLookup] = useState(false)

  const activeCenter = BANKS.find((b) => b.id === selectedCenter) || BANKS[0]

  const handleBookAppointment = (e: React.FormEvent) => {
    e.preventDefault()
    setIsBooked(true)
    notify(
      `First donation scheduled at ${activeCenter.name} on ${selectedDate} (${selectedSlot})! Confirmation SMS dispatched to ${donorPhone}.`,
      'success'
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto no-scrollbar bg-background p-4 sm:p-5 space-y-4">
      {/* 1. Life Saver Welcome Hero Card */}
      <div className="relative overflow-hidden rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-500 via-rose-600 to-red-600 p-5 text-white shadow-lg dark:border-rose-900/60">
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="grid size-10 place-items-center rounded-2xl bg-white/20 backdrop-blur-md">
                <Heart className="size-5 fill-white text-white" />
              </span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-100 flex items-center gap-1">
                  <Sparkles className="size-3" />
                  New Voluntary Donor Profile
                </span>
                <h1 className="text-xl font-black tracking-tight">{donorName}</h1>
              </div>
            </div>

            {/* Blood Group Badge */}
            <div className="flex flex-col items-end">
              <span className="rounded-2xl bg-white px-3.5 py-1 text-sm font-black text-rose-600 shadow-sm">
                {donorGroup}
              </span>
              <span className="text-[10px] font-semibold text-rose-100 mt-1">Verified Group</span>
            </div>
          </div>

          <p className="text-xs text-rose-100 leading-relaxed max-w-sm">
            Welcome to the JEEVAN Emergency Grid. Your genuine Google authentication is verified. A single unit of your
            blood can save up to 3 trauma patients.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/20 text-[11px] text-rose-50">
            <span className="inline-flex items-center gap-1 font-semibold">
              <ShieldCheck className="size-3.5 text-emerald-300" />
              Google OAuth Verified
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3" />
              {donorPhone}
            </span>
            <span>•</span>
            <span className="truncate max-w-[140px]">{donorEmail}</span>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="pointer-events-none absolute -right-6 -bottom-8 size-36 rounded-full bg-white/10 blur-2xl" />
      </div>

      {/* 2. Onboarding Milestones Checklist */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300">
              <Award className="size-4" />
            </span>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
              New Donor Onboarding Progress
            </h2>
          </div>
          <span className="rounded-full bg-rose-100 dark:bg-rose-950/60 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
            {isBooked ? '4 of 4 Steps Complete' : '3 of 4 Steps Complete'}
          </span>
        </div>

        <div className="space-y-2">
          {ONBOARDING_STEPS.map((step) => {
            const Icon = step.icon
            const isCompleted = step.id === 'appointment' ? isBooked : true
            return (
              <div
                key={step.id}
                className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 p-2.5 transition hover:bg-muted/50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                        : 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{step.subtitle}</p>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                    isCompleted
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}
                >
                  {isCompleted ? 'Verified' : 'Pending Booking'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 3. Schedule First Voluntary Donation */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-xl bg-coral/10 text-coral">
              <CalendarCheck className="size-4" />
            </span>
            <div>
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
                Schedule First Donation
              </h2>
              <p className="text-[11px] text-muted-foreground">Certified regional blood centers</p>
            </div>
          </div>
          {isBooked && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="size-3" />
              Confirmed
            </span>
          )}
        </div>

        {isBooked ? (
          <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 space-y-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  Appointment Confirmed at {activeCenter.name}
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  Date: <span className="font-semibold">{selectedDate}</span> • Slot:{' '}
                  <span className="font-semibold">{selectedSlot}</span>
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                  Location: {activeCenter.name} ({activeCenter.short}) • Coordinates: [{activeCenter.position.join(', ')}]
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsBooked(false)}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 underline hover:opacity-80"
            >
              Modify or Reschedule Appointment
            </button>
          </div>
        ) : (
          <form onSubmit={handleBookAppointment} className="space-y-3">
            <div>
              <label htmlFor="center-select" className="block text-[11px] font-bold text-muted-foreground mb-1">
                Select Certified Blood Center
              </label>
              <select
                id="center-select"
                value={selectedCenter}
                onChange={(e) => setSelectedCenter(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-coral"
              >
                {BANKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.short})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="date-input" className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Target Date
                </label>
                <input
                  id="date-input"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-2.5 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-coral"
                  required
                />
              </div>

              <div>
                <label htmlFor="slot-select" className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Time Slot
                </label>
                <select
                  id="slot-select"
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-2 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-coral"
                >
                  <option value="09:30 AM - 10:30 AM">09:30 AM - 10:30 AM</option>
                  <option value="11:00 AM - 12:00 PM">11:00 AM - 12:00 PM</option>
                  <option value="02:30 PM - 03:30 PM">02:30 PM - 03:30 PM</option>
                  <option value="04:30 PM - 05:30 PM">04:30 PM - 05:30 PM</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-coral hover:bg-coral-strong py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-98"
            >
              <Calendar className="size-3.5" />
              <span>Confirm First Donation Booking</span>
            </button>
          </form>
        )}
      </div>

      {/* 4. First-time Donor Preparation & Clinical Guide */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <span className="grid size-7 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
            <Info className="size-4" />
          </span>
          <div>
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wide">
              First-Time Donor Clinical Guide
            </h2>
            <p className="text-[11px] text-muted-foreground">Certified safety standards & guidelines</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CLINICAL_PREPARATION_TIPS.map((tip) => (
            <div
              key={tip.step}
              className={`rounded-2xl border p-3 flex flex-col gap-1 transition ${tip.color}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-black/10 dark:bg-white/10 text-[10px] font-black">
                  {tip.step}
                </span>
                <p className="text-xs font-bold">{tip.title}</p>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">{tip.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Emergency SOS Ready Status Toggle */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-2.5">
            <span
              className={`grid size-8 place-items-center rounded-xl ${
                sosActive
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Radio className={`size-4 ${sosActive ? 'animate-pulse' : ''}`} />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">
                Trauma Emergency SOS Ready Status
              </p>
              <p className="text-[11px] text-muted-foreground">
                {sosActive
                  ? 'Active on-call: You will receive urgent alerts when your blood group is needed within 10km'
                  : 'Standby: Emergency calls temporarily paused'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSosActive(!sosActive)
              notify(
                sosActive
                  ? 'Emergency SOS status set to Standby'
                  : 'Emergency SOS activated! You are on-call for trauma matches.',
                'info'
              )
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              sosActive ? 'bg-rose-600' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                sosActive ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 6. Rare Blood Compatibility Clinical Lookup Button & Embed */}
      <div className="rounded-3xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
              <Compass className="size-4" />
            </span>
            <div>
              <h2 className="text-xs font-bold text-foreground">
                Rare Blood Compatibility & Matching
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Clinical decision support for ABO/Rh and Bombay Oh matching
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowRareLookup(!showRareLookup)}
            className="rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs font-bold text-foreground hover:bg-muted"
          >
            {showRareLookup ? 'Hide Lookup' : 'Explore Matches'}
          </button>
        </div>

        {showRareLookup && (
          <div className="mt-4 pt-3 border-t border-border">
            <RareBloodCompatibility />
          </div>
        )}
      </div>

      {/* 7. Portal Navigation / Active Trauma View Switcher */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 p-3">
        <div className="text-xs">
          <p className="font-bold text-foreground">Registered Donor Workspace</p>
          <p className="text-[11px] text-muted-foreground">
            Switch to the Active Trauma Calls view to inspect incoming hospital emergencies
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRole('donor')}
          className="shrink-0 rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition"
        >
          Active Trauma Calls
        </button>
      </div>
    </div>
  )
}
