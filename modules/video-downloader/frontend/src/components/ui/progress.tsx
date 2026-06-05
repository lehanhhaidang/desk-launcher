import * as React from 'react'

import { cn } from './utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  /** Optional accessible label. */
  label?: string
  /** Visually hide the numeric value overlay. */
  hideValue?: boolean
}

/**
 * Lightweight progress bar with no external deps. Matches the Media Toolbox
 * dark theme. `value` is clamped to 0..100.
 */
function Progress({ value, label, hideValue, className, ...props }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-slot="progress"
      className={cn('mtb-progress', className)}
      {...props}
    >
      <div
        className="mtb-progress-bar"
        style={{ width: `${pct}%` }}
      />
      {!hideValue && (
        <span className="mtb-progress-label">{pct.toFixed(0)}%</span>
      )}
    </div>
  )
}

export { Progress }
