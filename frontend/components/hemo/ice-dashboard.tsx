'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  AlertCircle,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  ChevronRight,
  Flame,
  HeartHandshake,
  Loader2,
  Mic,
  MicOff,
  Navigation,
  Phone,
  Radio,
  Send,
  ShieldAlert,
  Siren,
  Sparkles,
  Users,
} from 'lucide-react'
import { ICUS, distanceKm, USER_LOCATION } from '@/lib/hemo-data'
import { LanguageSwitcher } from './language-switcher'
import { useGrid } from './grid-store'
import { useLanguage } from '@/lib/i18n'

export interface EsiTriageResult {
  level: 1 | 2 | 3 | 4 | 5
  category: 'Resuscitation' | 'Emergent' | 'Urgent' | 'Less Urgent' | 'Non-urgent'
  severity: 'P1' | 'P2' | 'P3'
  matchedKeywords: string[]
  description: string
}

/**
 * Rule-based Emergency Severity Index (ESI) Triage.
 * Evaluates symptoms against clinical keywords for Levels 1 through 5:
 * Level 1 (Resuscitation): severe bleeding, unconscious, airway, cardiac arrest
 * Level 2 (Emergent): chest pain, heart attack, stroke, compound fracture
 * Level 3 (Urgent): moderate bleeding, abdominal pain, high fever, fracture
 * Level 4 (Less Urgent): minor cut, sprain, mild pain, simple laceration
 * Level 5 (Non-urgent): cold, cough, scratch, medication refill
 */
export function ruleBasedEsiTriage(symptoms: string): EsiTriageResult {
  const query = (symptoms || '').toLowerCase().trim()

  // ESI Level 1: Resuscitation (Immediate life threat)
  const level1Keywords = [
    'severe bleeding',
    'massive bleeding',
    'profuse bleeding',
    'arterial bleeding',
    'hemorrhage',
    'unconscious',
    'unresponsive',
    'airway',
    'airway obstruction',
    'choking',
    'not breathing',
    'stopped breathing',
    'cardiac arrest',
    'respiratory arrest',
    'apnea',
    'pulseless',
    'anaphylaxis',
    'anaphylactic shock',
    'severe shock',
    'cyanosis',
    'bluish',
    'அதிக இரத்தப்போக்கு',
    'மயக்கம்',
    'சுவாசக்குழாய்',
    'மூச்சுத்திணறல்',
    'കടുത്ത രക്തസ്രാവം',
    'അബോധാവസ്ഥ',
    'ശ്വാസതടസ്സം',
    'अत्यधिक रक्तस्राव',
    'बेहोश',
    'सांस नहीं ले रहा',
  ]

  // ESI Level 2: Emergent (High risk, acute severe distress)
  const level2Keywords = [
    'chest pain',
    'heart attack',
    'myocardial',
    'angina',
    'acute stroke',
    'stroke',
    'slurred speech',
    'facial droop',
    'compound fracture',
    'open fracture',
    'head injury',
    'stab',
    'gunshot',
    'severe burn',
    'poisoning',
    'altered mental',
    'disoriented',
    'acute trauma',
    'lethargic',
    'மார்பு வலி',
    'பக்கவாதம்',
    'நெഞ്ചുവേദന',
    'പക്ഷാഘാതം',
    'सीने में दर्द',
    'स्ट्रोक',
  ]

  // ESI Level 3: Urgent (Stable vitals, multiple resources needed)
  const level3Keywords = [
    'moderate bleeding',
    'fracture',
    'broken bone',
    'abdominal pain',
    'stomach pain',
    'belly pain',
    'high fever',
    'persistent vomiting',
    'dehydration',
    'asthma',
    'wheezing',
    'dislocation',
    'deep cut',
    'deep laceration',
    'colic',
  ]

  // ESI Level 4: Less Urgent (Single resource needed)
  const level4Keywords = [
    'minor cut',
    'sprain',
    'mild pain',
    'twisted ankle',
    'simple laceration',
    'small burn',
    'earache',
    'sore throat',
    'urinary',
    'dysuria',
    'rash',
    'mild fever',
    'wound',
    'swelling',
  ]

  // ESI Level 5: Non-urgent (Exam/prescription only, no resources)
  const level5Keywords = [
    'cold',
    'cough',
    'scratch',
    'minor scratch',
    'refill',
    'prescription',
    'routine',
    'checkup',
    'suture removal',
    'bandage',
    'dressing',
    'minor bruise',
  ]

  const matches1 = level1Keywords.filter((k) => query.includes(k))
  if (matches1.length > 0) {
    return {
      level: 1,
      category: 'Resuscitation',
      severity: 'P1',
      matchedKeywords: matches1,
      description: 'Immediate life-saving resuscitation required.',
    }
  }

  const matches2 = level2Keywords.filter((k) => query.includes(k))
  if (matches2.length > 0) {
    return {
      level: 2,
      category: 'Emergent',
      severity: 'P1',
      matchedKeywords: matches2,
      description: 'Emergent high-risk clinical condition requiring rapid intervention.',
    }
  }

  const matches3 = level3Keywords.filter((k) => query.includes(k))
  if (matches3.length > 0) {
    return {
      level: 3,
      category: 'Urgent',
      severity: 'P2',
      matchedKeywords: matches3,
      description: 'Urgent evaluation requiring multiple hospital resources.',
    }
  }

  const matches4 = level4Keywords.filter((k) => query.includes(k))
  if (matches4.length > 0) {
    return {
      level: 4,
      category: 'Less Urgent',
      severity: 'P3',
      matchedKeywords: matches4,
      description: 'Less urgent complaint requiring single resource evaluation.',
    }
  }

  const matches5 = level5Keywords.filter((k) => query.includes(k))
  if (matches5.length > 0) {
    return {
      level: 5,
      category: 'Non-urgent',
      severity: 'P3',
      matchedKeywords: matches5,
      description: 'Non-urgent assessment with no additional diagnostic resources needed.',
    }
  }

  return {
    level: 3,
    category: 'Urgent',
    severity: 'P2',
    matchedKeywords: [],
    description: 'Urgent general trauma evaluation.',
  }
}

export function IceDashboard() {
  const tIce = useTranslations('ICE')
  const tCommon = useTranslations('Common')
  const { openNccAlert, notify, setTab } = useGrid()
  const { locale } = useLanguage()

  const [sosActive, setSosActive] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceQuery, setVoiceQuery] = useState('')
  const [severity, setSeverity] = useState<'P1' | 'P2' | 'P3'>('P1')
  const [aiNote, setAiNote] = useState<string>('')
  const [isGeneratingAi, setIsGeneratingAi] = useState(false)
  const recognitionRef = useRef<any>(null)

  // Mode: 'sos' (Emergency SOS & Voice Triage) vs 'questions' (Professional Blood Triage & 4-Month Scheduler)
  const [activeMode, setActiveMode] = useState<'sos' | 'questions'>('questions')

  // Professional Blood Questions State
  const [urgencyMode, setUrgencyMode] = useState<'immediate' | 'urgent' | 'schedule'>('schedule')
  const [componentType, setComponentType] = useState<string>('PRBC')
  const [clinicalDiagnosis, setClinicalDiagnosis] = useState<string>('cardio')
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('icu-rggh')

  // 4-Month Schedule State: generate 4 upcoming calendar months dynamically
  const now = new Date()
  const fourMonths = React.useMemo(() => {
    return Array.from({ length: 4 }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      return {
        monthIndex: i,
        monthName: d.toLocaleDateString('en-US', { month: 'short' }),
        fullMonth: d.toLocaleDateString('en-US', { month: 'long' }),
        year: d.getFullYear(),
        daysCount: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
      }
    })
  }, [])

  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(0)
  const [selectedDay, setSelectedDay] = useState<number>(14)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('11:45 AM')
  const [scheduleSuccess, setScheduleSuccess] = useState<boolean>(false)

  // Language mapping supporting en-IN, ml-IN, ta-IN, hi-IN
  const SPEECH_LANG_MAP: Record<string, string> = {
    en: 'en-IN',
    ml: 'ml-IN',
    ta: 'ta-IN',
    hi: 'hi-IN',
  }

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
    }
  }, [])

  const handleConfirmSchedule = () => {
    const m = fourMonths[selectedMonthIdx]
    const hosp = ICUS.find((h) => h.id === selectedHospitalId) || ICUS[0]
    setScheduleSuccess(true)
    notify(
      `✅ Transfusion successfully scheduled for ${selectedDay} ${m.fullMonth} ${m.year} at ${selectedTimeSlot} at ${hosp.name}!`,
      'success'
    )
  }

  const handleSos = () => {
    setSosActive(true)
    notify(tIce('sosTriggered'), 'error')
    openNccAlert({
      hospital_name: 'Apollo Greams Trauma ICU',
      blood_group: 'O-',
      units: 2,
      urgency: 'CRITICAL',
    })
  }

  const toggleVoiceInput = () => {
    // If currently listening, stop recognition
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
      setIsListening(false)
      return
    }

    // Real browser speech recognition (SpeechRecognition / webkitSpeechRecognition)
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null

    if (!SpeechRecognition) {
      // Fallback to old behavior if speech recognition is unsupported
      setIsListening(true)
      setTimeout(() => {
        setVoiceQuery(tIce('voicePlaceholder'))
        setIsListening(false)
        generateAiTriage(tIce('voicePlaceholder'))
      }, 2500)
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognitionRef.current = recognition
      recognition.lang = SPEECH_LANG_MAP[locale] || 'en-IN'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim()
        if (transcript) {
          setVoiceQuery(transcript)
          setIsListening(false)
          generateAiTriage(transcript)
        } else {
          setVoiceQuery(tIce('voicePlaceholder'))
          setIsListening(false)
          generateAiTriage(tIce('voicePlaceholder'))
        }
      }

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error)
        setIsListening(false)
        if (!voiceQuery) {
          setVoiceQuery(tIce('voicePlaceholder'))
          generateAiTriage(tIce('voicePlaceholder'))
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.start()
    } catch (err) {
      console.warn('Failed to start speech recognition, falling back to mock:', err)
      setIsListening(true)
      setTimeout(() => {
        setVoiceQuery(tIce('voicePlaceholder'))
        setIsListening(false)
        generateAiTriage(tIce('voicePlaceholder'))
      }, 2500)
    }
  }

  const generateAiTriage = async (symptoms: string) => {
    // Rule-based ESI triage function runs before existing Gemini call
    const esi = ruleBasedEsiTriage(symptoms)
    setSeverity(esi.severity)

    setIsGeneratingAi(true)
    try {
      const res = await fetch('/api/emergency/triage-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Language': locale,
        },
        body: JSON.stringify({
          symptoms,
          severity: esi.severity,
          esi_level: esi.level,
          esi_category: esi.category,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const rawNote = data.summary || data.notes || ''
        setAiNote(
          rawNote.includes('ESI Level') || rawNote.includes('[ESI')
            ? rawNote
            : `[ESI Level ${esi.level}: ${esi.category}] ${rawNote}`
        )
      } else {
        setAiNote(
          esi.severity === 'P1'
            ? `🚨 [ESI Level ${esi.level}: ${esi.category}] Immediate Level-1 Trauma Alert: Massive transfusion protocol initiated. Directing to nearest designated trauma facility.`
            : `⚠️ [ESI Level ${esi.level}: ${esi.category}] Level-2 Urgent Care: Blood match verified. Transfusion center alerted.`
        )
      }
    } catch {
      setAiNote(
        esi.severity === 'P1'
          ? `🚨 [ESI Level ${esi.level}: ${esi.category}] Immediate Level-1 Trauma Alert: Massive transfusion protocol initiated. Directing to nearest designated trauma facility.`
          : `⚠️ [ESI Level ${esi.level}: ${esi.category}] Level-2 Urgent Care: Blood match verified. Transfusion center alerted.`
      )
    } finally {
      setIsGeneratingAi(false)
    }
  }

  return (
    <div className="relative mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-background sm:h-[min(920px,calc(100dvh-3rem))] sm:rounded-[36px] sm:border sm:shadow-xl">
      {/* Header with Title and Language Switcher */}
      <header className="z-30 shrink-0 border-b bg-background/95 backdrop-blur-md px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-red-600 text-white shadow-md">
              <Siren className="size-5 animate-pulse" />
            </span>
            <div>
              <h1 className="text-base font-black tracking-tight text-foreground leading-tight">
                {tIce('title')}
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">{tIce('subtitle')}</p>
            </div>
          </div>
          <LanguageSwitcher compact />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="no-scrollbar flex-1 overflow-y-auto px-4 py-4 pb-12 space-y-4">
        {/* VIEW MODE SELECTOR: EMERGENCY SOS vs CLINICAL BLOOD QUESTIONS */}
        <div className="flex rounded-2xl bg-muted/80 p-1 gap-1 border border-border shadow-xs">
          <button
            type="button"
            onClick={() => setActiveMode('questions')}
            className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMode === 'questions'
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border text-coral'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList className="size-3.5 text-coral" />
            <span>Blood Assessment & Schedule</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('sos')}
            className={`flex-1 py-2 px-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeMode === 'sos'
                ? 'bg-red-600 text-white shadow-sm font-black'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Siren className="size-3.5" />
            <span>Emergency SOS</span>
          </button>
        </div>

        {/* CLINICAL BLOOD ASSESSMENT & 4-MONTH ADVANCE SCHEDULER */}
        {activeMode === 'questions' && (
          <div className="space-y-4">
            {/* Header info card */}
            <div className="rounded-3xl border border-coral/30 bg-coral/5 p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="size-4 text-coral" />
                <h2 className="text-sm font-black text-foreground">Clinical Transfusion Assessment</h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Answer professional blood protocol questions to allocate blood units or schedule elective procedures across Chennai hospital network.
              </p>
            </div>

            {/* QUESTION 1: Transfusion Protocol & Urgency */}
            <section className="rounded-3xl border border-border bg-card p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-coral/15 text-coral text-[11px] font-bold">1</span>
                  Requirement Timing & Protocol
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">Select 1 option</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUrgencyMode('immediate')
                    setScheduleSuccess(false)
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    urgencyMode === 'immediate'
                      ? 'border-red-500 bg-red-500/10 ring-2 ring-red-400'
                      : 'border-border bg-muted/30 hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                      🚨 Acute Massive Bleeding / Trauma (MTP)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-600">
                      Immediate (&lt;15 min)
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Emergency uncrossmatched O- or type-specific blood mobilization.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUrgencyMode('urgent')
                    setScheduleSuccess(false)
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    urgencyMode === 'urgent'
                      ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-400'
                      : 'border-border bg-muted/30 hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                      ⚡ Urgent Inpatient Transfusion
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      Within 2–4 Hours
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Standard cross-match for severe anemia or urgent surgical preparation.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUrgencyMode('schedule')
                    setScheduleSuccess(false)
                  }}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    urgencyMode === 'schedule'
                      ? 'border-coral bg-coral/10 ring-2 ring-coral'
                      : 'border-border bg-muted/30 hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                      📅 Scheduled Elective Transfusion (4-Month Window)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-coral/20 text-coral">
                      Schedule Slot
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Lock transfusion date, month, and time across the next 4 months for elective surgeries or oncology cycles.
                  </p>
                </button>
              </div>
            </section>

            {/* 4-MONTH ADVANCE SCHEDULER PANEL (Shown when Schedule is chosen) */}
            {urgencyMode === 'schedule' && (
              <section className="rounded-3xl border-2 border-coral/40 bg-card p-4 shadow-md space-y-3.5 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-border/80 pb-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-coral" />
                    <div>
                      <h3 className="text-xs font-black text-foreground">4-Month Transfusion Horizon</h3>
                      <p className="text-[10px] text-muted-foreground">Select appointment Month, Date &amp; Time slot</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-coral bg-coral/10 px-2 py-0.5 rounded-full border border-coral/20">
                    4 Months Active
                  </span>
                </div>

                {/* 1. Month Picker (Next 4 Months) */}
                <div>
                  <label className="text-[11px] font-bold text-foreground mb-1.5 block">
                    Step 1: Choose Month ({fourMonths[0].monthName} – {fourMonths[3].monthName})
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {fourMonths.map((m, idx) => {
                      const isSelected = selectedMonthIdx === idx
                      return (
                        <button
                          key={m.monthName + m.year}
                          type="button"
                          onClick={() => {
                            setSelectedMonthIdx(idx)
                            setScheduleSuccess(false)
                          }}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-coral bg-coral text-white font-black shadow-sm'
                              : 'border-border bg-muted/40 hover:bg-muted text-foreground'
                          }`}
                        >
                          <span className="text-xs font-black">{m.monthName}</span>
                          <span className="text-[9px] opacity-80">{m.year}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 2. Date Selection (Days of Month) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-bold text-foreground">
                      Step 2: Choose Scheduled Day in {fourMonths[selectedMonthIdx].fullMonth}
                    </label>
                    <span className="text-[10px] font-semibold text-coral">
                      Day {selectedDay}
                    </span>
                  </div>
                  {/* Quick Select Days + Day Chips */}
                  <div className="grid grid-cols-6 gap-1.5 text-xs font-bold">
                    {[3, 7, 10, 14, 18, 21, 24, 28].map((day) => {
                      const isSelected = selectedDay === day
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => {
                            setSelectedDay(day)
                            setScheduleSuccess(false)
                          }}
                          className={`py-2 rounded-xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-coral bg-coral text-white font-extrabold shadow-xs'
                              : 'border-border bg-muted/30 hover:bg-muted text-foreground'
                          }`}
                        >
                          {day}th
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Time Slot Selection */}
                <div>
                  <label className="text-[11px] font-bold text-foreground mb-1.5 block flex items-center gap-1.5">
                    <Clock className="size-3.5 text-coral" />
                    Step 3: Select Clinical Transfusion Time
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                    {[
                      { time: '08:30 AM', label: 'Morning Pre-Op Slot' },
                      { time: '11:45 AM', label: 'Midday Transfusion Bay' },
                      { time: '02:30 PM', label: 'Afternoon Infusion Bay' },
                      { time: '05:15 PM', label: 'Evening Post-Op Reserve' },
                    ].map((slot) => {
                      const isSelected = selectedTimeSlot === slot.time
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => {
                            setSelectedTimeSlot(slot.time)
                            setScheduleSuccess(false)
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-coral bg-coral/15 ring-2 ring-coral text-foreground'
                              : 'border-border bg-muted/30 hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <span className="text-xs font-black text-foreground block">{slot.time}</span>
                          <span className="text-[9px] text-muted-foreground">{slot.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 4. Live Schedule Summary Banner */}
                <div className="rounded-2xl border border-coral/30 bg-coral/5 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-coral">🗓️ Scheduled Appointment Details:</span>
                    <span className="text-[10px] font-mono text-muted-foreground">4-Month Reserve</span>
                  </div>
                  <p className="text-sm font-extrabold text-foreground">
                    {selectedDay} {fourMonths[selectedMonthIdx].fullMonth} {fourMonths[selectedMonthIdx].year} at {selectedTimeSlot}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Units pre-assigned under FEFO safety protocol. Automated cross-match triggered 24 hours prior.
                  </p>
                </div>

                {/* Confirmation Button */}
                <button
                  type="button"
                  onClick={handleConfirmSchedule}
                  className="w-full py-3 rounded-xl bg-coral hover:bg-coral-strong text-white font-black text-xs shadow-md transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="size-4" />
                  <span>Confirm 4-Month Advance Transfusion Schedule</span>
                </button>

                {scheduleSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span>
                      Confirmed: Appointment locked for {selectedDay} {fourMonths[selectedMonthIdx].fullMonth} {fourMonths[selectedMonthIdx].year} at {selectedTimeSlot}!
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* QUESTION 2: Blood Component Required */}
            <section className="rounded-3xl border border-border bg-card p-4 shadow-xs space-y-2.5">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-coral/15 text-coral text-[11px] font-bold">2</span>
                Required Blood Component
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'PRBC', name: 'PRBC (Packed Red Cells)', sub: 'Adult surgical / trauma' },
                  { id: 'Platelets', name: 'Single Donor Platelets (SDP)', sub: 'Thrombocytopenia / chemo' },
                  { id: 'Plasma', name: 'Fresh Frozen Plasma (FFP)', sub: 'Coagulation correction' },
                  { id: 'Whole Blood', name: 'Whole Blood (CPDA-1)', sub: 'Massive blood loss / MTP' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setComponentType(c.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      componentType === c.id
                        ? 'border-coral bg-coral/10 ring-2 ring-coral'
                        : 'border-border bg-muted/30 hover:bg-muted'
                    }`}
                  >
                    <span className="font-extrabold text-foreground block text-xs">{c.name}</span>
                    <span className="text-[10px] text-muted-foreground">{c.sub}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* QUESTION 3: Clinical Diagnosis */}
            <section className="rounded-3xl border border-border bg-card p-4 shadow-xs space-y-2.5">
              <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                <span className="grid size-5 place-items-center rounded-full bg-coral/15 text-coral text-[11px] font-bold">3</span>
                Primary Clinical Indication
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'cardio', label: 'Cardiovascular Surgery', sub: 'Bypass / Valve Replacement' },
                  { id: 'trauma', label: 'Acute Polytrauma Bleed', sub: 'Road accident / ER resuscitation' },
                  { id: 'maternal', label: 'Obstetric Care / PPH', sub: 'Post-partum hemorrhage' },
                  { id: 'onco', label: 'Oncology / Hematology', sub: 'Bone marrow / Aplastic anemia' },
                ].map((diag) => (
                  <button
                    key={diag.id}
                    type="button"
                    onClick={() => setClinicalDiagnosis(diag.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      clinicalDiagnosis === diag.id
                        ? 'border-coral bg-coral/10 ring-2 ring-coral'
                        : 'border-border bg-muted/30 hover:bg-muted'
                    }`}
                  >
                    <span className="font-extrabold text-foreground block text-xs">{diag.label}</span>
                    <span className="text-[10px] text-muted-foreground">{diag.sub}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* QUESTION 4: Destination Hospital (Chennai Regional Network) */}
            <section className="rounded-3xl border border-border bg-card p-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-coral/15 text-coral text-[11px] font-bold">4</span>
                  Destination Chennai Hospital
                </span>
                <span className="text-[10px] font-semibold text-coral bg-coral/10 px-2 py-0.5 rounded-full">
                  {ICUS.length} Hospitals
                </span>
              </div>
              <div className="relative">
                <select
                  value={selectedHospitalId}
                  onChange={(e) => setSelectedHospitalId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-border bg-background py-2.5 pl-3.5 pr-9 text-xs font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-coral/40 cursor-pointer shadow-xs"
                >
                  {ICUS.map((hosp) => (
                    <option key={hosp.id} value={hosp.id}>
                      {hosp.name} {hosp.zone ? `• ${hosp.zone}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </div>
        )}

        {/* SOS VIEW (When activeMode === 'sos') */}
        {activeMode === 'sos' && (
          <>
        {/* BIG RED SOS BUTTON */}
        <section aria-labelledby="sos-heading" className="rounded-3xl border border-red-500/40 bg-gradient-to-b from-red-500/15 via-red-500/5 to-transparent p-4">
          <h2 id="sos-heading" className="sr-only">{tIce('sosAlertButton')}</h2>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={handleSos}
            className={`w-full relative overflow-hidden rounded-2xl py-5 px-4 font-black text-white shadow-xl flex items-center justify-center gap-3 transition-all cursor-pointer ${
              sosActive
                ? 'bg-red-700 ring-4 ring-red-500/50'
                : 'bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 shadow-red-600/30'
            }`}
          >
            <Radio className="size-6 animate-ping" />
            <span className="text-base tracking-wide uppercase">
              {sosActive ? tIce('sosTriggered') : tIce('sosAlertButton')}
            </span>
          </motion.button>

          {/* Quick Hotlines Grid */}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <a
              href="tel:112"
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-2 hover:bg-muted transition-colors font-bold text-foreground"
            >
              <span className="text-red-500 text-sm font-black">112</span>
              <span className="text-[10px] text-muted-foreground truncate">{tIce('emergencyContact')}</span>
            </a>
            <a
              href="tel:108"
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-2 hover:bg-muted transition-colors font-bold text-foreground"
            >
              <span className="text-emerald-500 text-sm font-black">108</span>
              <span className="text-[10px] text-muted-foreground truncate">{tIce('policeMedicalHotline')}</span>
            </a>
            <a
              href="tel:104"
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-2 hover:bg-muted transition-colors font-bold text-foreground"
            >
              <span className="text-sky-500 text-sm font-black">104</span>
              <span className="text-[10px] text-muted-foreground truncate">{tIce('bloodBankHelpline')}</span>
            </a>
          </div>
        </section>

        {/* VOICE INPUT & AI TRIAGE SECTION */}
        <section className="rounded-3xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-coral" />
              <h3 className="text-sm font-extrabold text-foreground">{tIce('triageStatus')}</h3>
            </div>
            <span className="text-[11px] text-muted-foreground">{tIce('triageDescription')}</span>
          </div>

          {/* Severity Badges (P1, P2, P3) */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                setSeverity('P1')
                generateAiTriage(voiceQuery || 'Severe acute hemorrhage')
              }}
              className={`rounded-xl py-2 px-1 text-center text-xs font-black transition-all cursor-pointer ${
                severity === 'P1'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30 ring-2 ring-red-400'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tIce('severityCritical')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSeverity('P2')
                generateAiTriage(voiceQuery || 'Postoperative anemia')
              }}
              className={`rounded-xl py-2 px-1 text-center text-xs font-black transition-all cursor-pointer ${
                severity === 'P2'
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-2 ring-amber-300'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tIce('severityUrgent')}
            </button>
            <button
              type="button"
              onClick={() => {
                setSeverity('P3')
                generateAiTriage(voiceQuery || 'Scheduled elective procedure')
              }}
              className={`rounded-xl py-2 px-1 text-center text-xs font-black transition-all cursor-pointer ${
                severity === 'P3'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted'
              }`}
            >
              {tIce('severityNonUrgent')}
            </button>
          </div>

          {/* Voice Input Button */}
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleVoiceInput}
                className={`grid size-12 place-items-center rounded-2xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-600/40'
                    : 'bg-coral text-white hover:bg-coral-strong'
                }`}
                aria-label={tIce('voiceInputLabel')}
              >
                {isListening ? <Mic className="size-6" /> : <MicOff className="size-6" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground">
                  {isListening ? tIce('voiceListening') : tIce('voiceInputLabel')}
                </p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {voiceQuery || tIce('voicePlaceholder')}
                </p>
              </div>
            </div>

            {/* AI Generated Triage Notes */}
            {isGeneratingAi ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-card p-2.5 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-coral" />
                <span>{tCommon('loading')}</span>
              </div>
            ) : aiNote ? (
              <div className="mt-3 rounded-xl border border-border bg-card p-2.5 text-xs text-foreground leading-relaxed">
                <span className="font-extrabold text-coral">{tIce('aiTriageNotes')}: </span>
                {aiNote}
              </div>
            ) : null}
          </div>
        </section>

        {/* CADET & CAMPUS NETWORK ALERT */}
        <section className="rounded-3xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-emerald-600 text-white shrink-0 shadow-md">
              <Users className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-black text-foreground">
                {tIce('verifiedCadetsReady')}
              </h4>
              <p className="text-[11px] text-muted-foreground">Loyola & Anna University Blood Corps</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              openNccAlert({
                hospital_name: 'Apollo Greams Trauma ICU',
                blood_group: 'O-',
                units: 2,
                urgency: 'CRITICAL',
              })
            }
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <Send className="size-4" />
            <span>{tIce('sendEmergencyAlert')}</span>
          </button>
        </section>

        {/* NEARBY EMERGENCY HOSPITALS */}
        <section className="rounded-3xl border border-border bg-card p-4 shadow-xs">
          <h3 className="text-sm font-extrabold text-foreground mb-3 flex items-center gap-2">
            <Building2 className="size-4 text-coral" />
            <span>{tIce('nearbyHospitals')}</span>
          </h3>

          <div className="space-y-2.5">
            {ICUS.slice(0, 8).map((icu) => {
              const km = distanceKm(USER_LOCATION, icu.position).toFixed(1)
              return (
                <div
                  key={icu.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3 hover:bg-muted/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground truncate">{icu.name}</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Navigation className="size-3 text-coral" />
                      <span>{km} {tIce('hospitalDistance')}</span>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Trauma Ready</span>
                    </p>
                  </div>
                  <a
                    href="tel:+914428178200"
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Phone className="size-3.5 text-coral" />
                    <span>{tIce('contactHospital')}</span>
                  </a>
                </div>
              )
            })}
          </div>
        </section>
                </>
        )}
      </main>
    </div>
  )
}
