import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export function ViewHeader({
  eyebrow,
  title,
  description,
  action,
  onBack,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
  onBack?: () => void
}) {
  return (
    <div className="pt-5 pb-5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </button>
      )}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">{eyebrow}</p>
          <h1 className="mt-1.5 text-[26px] leading-tight font-extrabold tracking-tight text-balance">{title}</h1>
        </div>
        {action}
      </div>
      {description && <p className="mt-2 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

export function SimulatedBadge() {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Demo mode</span>
  )
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">{eyebrow}</p>
        <h2 className="mt-1.5 text-xl font-extrabold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  )
}
