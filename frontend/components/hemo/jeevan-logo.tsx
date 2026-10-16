'use client'

import React from 'react'
import { Droplets } from 'lucide-react'
import { cn } from '@/lib/utils'

interface JeevanLogoProps {
  className?: string
  iconSize?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  showSubtitle?: boolean
  variant?: 'coral' | 'white' | 'inverted'
}

export function JeevanLogo({
  className,
  iconSize = 'md',
  showText = true,
  showSubtitle = false,
  variant = 'coral',
}: JeevanLogoProps) {
  const sizeMap = {
    sm: {
      box: 'size-7 rounded-lg',
      icon: 'size-4',
      title: 'text-sm',
      sub: 'text-[9px]',
    },
    md: {
      box: 'size-9 rounded-xl',
      icon: 'size-5',
      title: 'text-base',
      sub: 'text-[10px]',
    },
    lg: {
      box: 'size-12 rounded-2xl',
      icon: 'size-6',
      title: 'text-xl',
      sub: 'text-xs',
    },
    xl: {
      box: 'size-20 rounded-3xl shadow-lg',
      icon: 'size-10',
      title: 'text-3xl',
      sub: 'text-sm',
    },
  }

  const currentSize = sizeMap[iconSize]

  const boxColors =
    variant === 'white'
      ? 'bg-white text-coral shadow-sm'
      : variant === 'inverted'
      ? 'bg-ink text-white shadow-sm'
      : 'bg-coral text-white shadow-xs'

  return (
    <div className={cn('inline-flex items-center gap-2.5 select-none', className)}>
      <div
        className={cn(
          'grid place-items-center shrink-0 transition-transform',
          currentSize.box,
          boxColors,
        )}
      >
        <Droplets className={cn(currentSize.icon, 'text-inherit')} aria-hidden="true" />
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'font-black tracking-tight',
                variant === 'white' ? 'text-white' : 'text-foreground',
                currentSize.title,
              )}
            >
              JEEVAN
            </span>
          </div>
          {showSubtitle && (
            <span
              className={cn(
                'font-bold uppercase tracking-wider mt-0.5',
                variant === 'white' ? 'text-white/80' : 'text-coral',
                currentSize.sub,
              )}
            >
              Emergency Blood Grid
            </span>
          )}
        </div>
      )}
    </div>
  )
}
