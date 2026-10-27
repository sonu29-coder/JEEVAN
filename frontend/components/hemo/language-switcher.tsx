'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { useLanguage, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface LanguageSwitcherProps {
  className?: string
  compact?: boolean
}

export function LanguageSwitcher({ className, compact = false }: LanguageSwitcherProps) {
  const { locale, setLocale, languages, currentLanguage } = useLanguage()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelect = (code: Locale) => {
    setLocale(code)
    setOpen(false)
  }

  return (
    <div ref={dropdownRef} className={cn('relative inline-block text-left z-50', className)}>
      <button
        type="button"
        id="language-switcher-button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Select language. Current language: ${currentLanguage.nativeName}`}
        className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-2.5 py-2 text-xs font-bold text-foreground shadow-xs transition-all hover:bg-muted hover:border-coral/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral cursor-pointer"
      >
        <Globe className="size-4 text-coral shrink-0" aria-hidden="true" />
        <span className="font-semibold text-xs tracking-wide">
          {compact ? currentLanguage.code.toUpperCase() : currentLanguage.nativeName}
        </span>
        <ChevronDown
          className={cn('size-3.5 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            role="listbox"
            aria-labelledby="language-switcher-button"
            className="absolute right-0 mt-2 w-48 origin-top-right rounded-2xl border border-border bg-card/95 backdrop-blur-md p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none z-50 text-foreground"
          >
            <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-border/60 mb-1">
              Select Language / மொழியைத் தேர்வுசெய்க
            </div>
            {languages.map((lang) => {
              const isSelected = lang.code === locale
              return (
                <button
                  key={lang.code}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(lang.code)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors text-left cursor-pointer',
                    isSelected
                      ? 'bg-coral-soft text-coral font-bold dark:bg-coral/20'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm leading-none" aria-hidden="true">{lang.flag}</span>
                    <div className="flex flex-col">
                      <span className="text-xs leading-tight font-bold">{lang.nativeName}</span>
                      <span className="text-[10px] text-muted-foreground leading-none">{lang.label}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="size-4 text-coral shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
