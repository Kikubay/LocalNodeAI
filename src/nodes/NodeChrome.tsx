import type { MouseEvent, ReactNode } from 'react'

export function NodeChrome({
  title,
  dot,
  status,
  onDelete,
  onContextMenu,
  children,
  tone = 'default',
}: {
  title: string
  dot: string
  status?: string
  onDelete?: () => void
  onContextMenu?: (event: MouseEvent) => void
  children: ReactNode
  tone?: 'default' | 'selected'
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      className={`w-80 rounded-xl border bg-gray-900/70 shadow-xl backdrop-blur transition ${
        tone === 'selected' ? 'border-sky-400 shadow-sky-500/20' : 'border-gray-700'
      }`}
    >
      <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2">
        <span className={`size-2 shrink-0 rounded-full ${dot}`} />
        <span className="text-xs font-semibold tracking-wide text-gray-200">{title}</span>
        {status ? (
          <span
            className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
              status === 'error'
                ? 'bg-red-950 text-red-300'
                : status === 'done'
                  ? 'bg-emerald-950 text-emerald-300'
                  : 'bg-gray-800 text-gray-400'
            }`}
          >
            {status}
          </span>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            aria-label={`Delete ${title} node`}
            title={`Delete ${title} node`}
            onClick={onDelete}
            className={`nodrag rounded p-0.5 text-gray-600 transition hover:bg-red-950 hover:text-red-300 ${
              status ? '' : 'ml-auto'
            }`}
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}