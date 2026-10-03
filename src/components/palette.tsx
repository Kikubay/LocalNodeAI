import type { ReactNode } from 'react'

export type PaletteItem = {
  type: 'start' | 'llm' | 'end' | 'cache' | 'transform' | 'branch' | 'merge'
  label: string
  description: string
  dot: string
  icon: ReactNode
}

const iconClass = 'size-4'

export const PALETTE: PaletteItem[] = [
  {
    type: 'start',
    label: 'Start',
    description: 'Text input for the workflow',
    dot: 'bg-emerald-400',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <path d="M4 3.5v9l8-4.5-8-4.5Z" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: 'llm',
    label: 'LLM',
    description: 'Runs a model via WebGPU',
    dot: 'bg-violet-400',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <rect
          x="2.5"
          y="4.5"
          width="11"
          height="7"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M8 1.5v3M8 11.5v3" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="6" cy="8" r="1" fill="currentColor" />
        <circle cx="10" cy="8" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    type: 'end',
    label: 'End',
    description: 'Displays the final output',
    dot: 'bg-amber-400',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <rect
          x="2.5"
          y="3.5"
          width="11"
          height="9"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M5 11 11 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: 'cache',
    label: 'Cache',
    description: 'Skips models on repeat runs',
    dot: 'bg-cyan-400',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Reshape text without a model',
    dot: 'bg-pink-400',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <path
          d="M2 4h9M2 8h12M2 12h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path
          d="M11.5 2.5 14 5l-2.5 2.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Joins several inputs into one',
    dot: 'bg-sky-400',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <path
          d="M2 4c4 0 4 4 6 4M2 12c4 0 4-4 6-4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path d="M8 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path
          d="M10.5 6 14 8l-3.5 2"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    type: 'branch',
    label: 'Branch',
    description: 'Takes one of two paths',
    dot: 'bg-amber-300',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" className={iconClass} aria-hidden="true">
        <path d="M2 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path
          d="M6 8c4 0 4-4 8-4M6 8c4 0 4 4 8 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
]