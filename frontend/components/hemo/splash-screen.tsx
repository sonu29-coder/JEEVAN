'use client'

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Droplets } from 'lucide-react'

interface SplashScreenProps {
  onFinish?: () => void
  durationMs?: number
}

export function SplashScreen({ onFinish, durationMs = 1900 }: SplashScreenProps) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true)
      const finishTimer = setTimeout(() => {
        if (onFinish) onFinish()
      }, 550)
      return () => clearTimeout(finishTimer)
    }, durationMs)

    return () => clearTimeout(timer)
  }, [durationMs, onFinish])

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          key="splash-screen"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.04,
            filter: 'blur(8px)',
            transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background overflow-hidden"
          role="status"
          aria-live="polite"
          aria-label="Loading JEEVAN application"
        >
          {/* Subtle Smooth Animated Pattern: Ambient Background Glow & Radial Rings */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Soft Ambient Radial Light */}
            <motion.div
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.18, 0.32, 0.18],
              }}
              transition={{
                duration: 2.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute size-72 sm:size-96 rounded-full bg-coral/25 blur-3xl"
            />

            {/* Ripple Ring 1 */}
            <motion.div
              animate={{
                scale: [0.85, 1.45, 1.8],
                opacity: [0.45, 0.2, 0],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              className="absolute size-36 sm:size-48 rounded-full border border-coral/30"
            />

            {/* Ripple Ring 2 */}
            <motion.div
              animate={{
                scale: [0.85, 1.5, 2.1],
                opacity: [0.35, 0.15, 0],
              }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: 0.7,
                ease: 'easeOut',
              }}
              className="absolute size-36 sm:size-48 rounded-full border border-coral/20"
            />

            {/* Subtle Lifeline Pulse Pattern (Waveform) */}
            <svg
              className="absolute w-full max-w-sm h-16 opacity-25 text-coral stroke-current pointer-events-none"
              viewBox="0 0 400 60"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M 10 30 L 120 30 L 140 10 L 155 50 L 170 20 L 185 40 L 200 30 L 390 30"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: [0, 1, 1],
                  opacity: [0.2, 0.8, 0.3],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </svg>
          </div>

          {/* Central Professional JEEVAN Logo Only */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Animated Logo Badge */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 14 }}
              animate={{
                scale: 1,
                opacity: 1,
                y: 0,
                transition: {
                  type: 'spring',
                  stiffness: 320,
                  damping: 24,
                },
              }}
              className="relative"
            >
              <div className="relative grid size-20 sm:size-24 place-items-center rounded-3xl bg-gradient-to-br from-coral to-coral-strong text-white shadow-xl shadow-coral/25">
                <motion.div
                  animate={{
                    scale: [1, 1.12, 1],
                  }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <Droplets className="size-10 sm:size-12 text-white" aria-hidden="true" />
                </motion.div>
              </div>

              {/* Gentle Emblem Pulse Light */}
              <motion.div
                animate={{
                  scale: [1, 1.35, 1],
                  opacity: [0.4, 0, 0.4],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="absolute inset-0 rounded-3xl bg-coral/40 blur-md -z-10"
              />
            </motion.div>

            {/* Logo Brand Typography */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { delay: 0.18, duration: 0.4, ease: 'easeOut' },
              }}
              className="mt-4 text-center"
            >
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                JEEVAN
              </h1>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
