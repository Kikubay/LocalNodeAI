import { useExecutionStore } from '../store/executionStore'
import { useGraphStore } from '../store/graphStore'

const dotClass: Record<string, string> = {
  done: 'bg-emerald-400',
  running: 'animate-pulse bg-sky-400',
  error: 'bg-red-400',
  skipped: 'bg-gray-600',
}

export function RunPanel() {
  const status = useExecutionStore((state) => state.status)
  const error = useExecutionStore((state) => state.error)
  const steps = useExecutionStore((state) => state.steps)
  const durationMs = useExecutionStore((state) => state.durationMs)
  const reset = useExecutionStore((state) => state.reset)
  const clearNodeRuntime = useGraphStore((state) => state.clearNodeRuntime)

  if (status === 'idle' && steps.length === 0) return null

  const tone =
    status === 'error'
      ? 'border-red-900/70 bg-red-950/40'
      : status === 'cancelled'
        ? 'border-amber-900/70 bg-amber-950/30'
        : status === 'done'
          ? 'border-emerald-900/70 bg-emerald-950/30'
          : 'border-sky-900/70 bg-sky-950/30'

  const heading =
    status === 'error'
      ? 'Run failed'
      : status === 'done'
        ? 'Run complete'
        : status === 'cancelled'
          ? 'Run cancelled'
          : 'Running…'

  return (
    <div className={`flex w-72 shrink-0 flex-col overflow-y-auto border-l p-3 text-xs ${tone}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${status === 'idle' ? 'bg-gray-600' : dotClass[status]}`} />
        <span className="font-medium text-gray-200">{heading}</span>
        {durationMs != null && status !== 'running' ? (
          <span className="ml-auto tabular-nums text-gray-500">{(durationMs / 1000).toFixed(1)}s</span>
        ) : null}
      </div>

      {error ? <p className="mb-2 leading-relaxed text-red-300">{error}</p> : null}

      <ul className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.nodeId} className="flex items-start gap-2">
            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${dotClass[step.state]}`} />
            <span className="min-w-0">
              <span className="font-medium text-gray-300">{step.label}</span>
              <span className="block break-words text-[11px] text-gray-500">{step.detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          reset()
          clearNodeRuntime()
        }}
        className="mt-3 self-start text-[11px] text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
      >
        Clear results
      </button>
    </div>
  )
}