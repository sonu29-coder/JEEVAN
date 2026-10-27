'use client'

import React, { createContext, useContext, useEffect, useState, useTransition } from 'react'
import { NextIntlClientProvider } from 'next-intl'

import enMessages from '../messages/en.json'
import taMessages from '../messages/ta.json'
import hiMessages from '../messages/hi.json'
import mlMessages from '../messages/ml.json'

export type Locale = 'en' | 'ta' | 'hi' | 'ml'

export interface LanguageOption {
  code: Locale
  label: string
  nativeName: string
  flag: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeName: 'English', flag: '🇬🇧' },
  { code: 'ta', label: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'hi', label: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
]

export const MESSAGES: Record<Locale, any> = {
  en: enMessages,
  ta: taMessages,
  hi: hiMessages,
  ml: mlMessages,
}

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  languages: LanguageOption[]
  currentLanguage: LanguageOption
}

const LanguageContext = createContext<LanguageContextType>({
  locale: 'en',
  setLocale: () => {},
  languages: SUPPORTED_LANGUAGES,
  currentLanguage: SUPPORTED_LANGUAGES[0],
})

export function useLanguage() {
  return useContext(LanguageContext)
}

/**
 * Returns currently active locale anywhere on client (e.g. for fetch headers).
 */
export function getActiveLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  if ((window as any).__ACTIVE_LOCALE__) return (window as any).__ACTIVE_LOCALE__
  try {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/)
    if (match && ['en', 'ta', 'hi', 'ml'].includes(match[1])) {
      return match[1] as Locale
    }
    const saved = localStorage.getItem('jeevan_locale')
    if (saved && ['en', 'ta', 'hi', 'ml'].includes(saved)) {
      return saved as Locale
    }
  } catch {}
  return 'en'
}

/**
 * Install transparent global fetch interceptor that automatically attaches
 * `X-User-Language: <active_locale>` to every API call.
 */
function setupFetchLanguageInterceptor() {
  if (typeof window === 'undefined') return
  if ((window as any).__JEEVAN_I18N_FETCH_ATTACHED__) return

  const originalFetch = window.fetch
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const activeLocale = getActiveLocale()
    const headers = new Headers(init?.headers || {})

    // Only inject X-User-Language if not already set
    if (!headers.has('X-User-Language')) {
      headers.set('X-User-Language', activeLocale)
    }

    return originalFetch(input, {
      ...init,
      headers,
    })
  }

  ;(window as any).__JEEVAN_I18N_FETCH_ATTACHED__ = true
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')
  const [isPending, startTransition] = useTransition()

  // Initialize from cookie / localStorage on mount
  useEffect(() => {
    setupFetchLanguageInterceptor()
    const initial = getActiveLocale()
    setLocaleState(initial)
    if (typeof window !== 'undefined') {
      ;(window as any).__ACTIVE_LOCALE__ = initial
      document.documentElement.lang = initial
    }
  }, [])

  const setLocale = (newLocale: Locale) => {
    if (!['en', 'ta', 'hi', 'ml'].includes(newLocale)) return

    startTransition(() => {
      setLocaleState(newLocale)
      if (typeof window !== 'undefined') {
        ;(window as any).__ACTIVE_LOCALE__ = newLocale
        document.documentElement.lang = newLocale
        try {
          document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`
          localStorage.setItem('jeevan_locale', newLocale)
        } catch {}
      }
    })
  }

  const currentLanguage =
    SUPPORTED_LANGUAGES.find((lang) => lang.code === locale) || SUPPORTED_LANGUAGES[0]

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        languages: SUPPORTED_LANGUAGES,
        currentLanguage,
      }}
    >
      <NextIntlClientProvider
        locale={locale}
        messages={MESSAGES[locale] || MESSAGES.en}
        timeZone="Asia/Kolkata"
      >
        {children}
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  )
}
