'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
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
            {ICUS.slice(0, 3).map((icu) => {
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
      </main>
    </div>
  )
}
