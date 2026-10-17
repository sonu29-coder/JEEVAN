'use client'

import React from 'react'
import type { ManeuverType } from '@/lib/navigation-service'

interface ManeuverIconProps {
  maneuver: ManeuverType
  className?: string
  size?: number
}

export function ManeuverIcon({ maneuver, className = 'size-8 text-white', size = 32 }: ManeuverIconProps) {
  switch (maneuver) {
    case 'straight':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 19V5" />
          <path d="M6 11l6-6 6 6" />
        </svg>
      )

    case 'turn-left':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M18 19V11a4 4 0 0 0-4-4H5" />
          <path d="M9 3L5 7l4 4" />
        </svg>
      )

    case 'turn-right':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M6 19V11a4 4 0 0 1 4-4h9" />
          <path d="M15 3l4 4-4 4" />
        </svg>
      )

    case 'turn-slight-left':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M14 19a10 10 0 0 0-3-7.5L8 9" />
          <path d="M13 7H7v6" />
        </svg>
      )

    case 'turn-slight-right':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M10 19a10 10 0 0 1 3-7.5L16 9" />
          <path d="M11 7h6v6" />
        </svg>
      )

    case 'turn-sharp-left':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M17 19v-5a5 5 0 0 0-5-5H7" />
          <path d="M10 5L6 9l4 4" />
        </svg>
      )

    case 'turn-sharp-right':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M7 19v-5a5 5 0 0 1 5-5h5" />
          <path d="M14 5l4 4-4 4" />
        </svg>
      )

    case 'uturn':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M17 19V9a5 5 0 0 0-10 0v10" />
          <path d="M3 15l4 4 4-4" />
        </svg>
      )

    case 'roundabout':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="5" strokeDasharray="3 3" />
          <path d="M12 2v5" />
          <path d="M12 17v5" />
          <path d="M16 8l4-4" />
          <path d="M20 4h-4v4" />
        </svg>
      )

    case 'arrive':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" fill="currentColor" fillOpacity="0.2" />
          <circle cx="12" cy="9" r="2.5" fill="currentColor" />
        </svg>
      )

    case 'depart':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
        </svg>
      )

    case 'merge':
    case 'fork':
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M7 4v5a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v3" />
          <path d="M17 4v5a4 4 0 0 1-4 4" />
          <path d="M14 20l3 3 3-3" />
        </svg>
      )

    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <path d="M12 19V5" />
          <path d="M6 11l6-6 6 6" />
        </svg>
      )
  }
}
