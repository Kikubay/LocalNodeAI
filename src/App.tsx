import { useEffect, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ContextMenu } from './components/ContextMenu'
import { ExportButton } from './components/ExportButton'
import { RunPanel } from './components/RunPanel'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { useAutosave } from './hooks/useAutosave'
import { useHistory } from './hooks/useHistory'
import { cancelRun, runWorkflow } from './lib/execution'
import { readInjectedPayload } from './lib/serialization'
import { useExecutionStore } from './store/executionStore'
import { useAutosaveStore } from './store/autosaveStore'
import { useHistoryStore } from './store/historyStore'
import { useGpuStore } from './store/gpuStore'
import { useGraphStore } from './store/graphStore'

const btnClass =
  'rounded-md border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40'

function GpuBadge() {
  const state = useGpuStore((s) => s.state)
  const adapter = useGpuStore((s) => s.adapter)
  const detail = useGpuStore((s) => s.detail)
  const probe = useGpuStore((s) => s.probe)

  const tone =
    state === 'ready'
      ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300'
      : state === 'checking'
        ? 'border-gray-700 bg-gray-900/60 text-gray-400'
        : 'border-amber-900/60 bg-amber-950/40 text-amber-300'

  const label =
    state === 'ready'
      ? adapter
        ? `GPU · ${adapter}`
        : 'GPU ready'
      : state === 'checking'
        ? 'Checking WebGPU…'
        : state === 'error'
          ? 'WebGPU error'
          : 'No WebGPU'

  return (
    <button
      type="button"
      onClick={probe}
      title={detail ?? 'Click to re-check WebGPU support'}
      className={`hidden max-w-56 truncate rounded-full border px-2.5 py-1 text-[10px] transition hover:brightness-125 md:inline-block ${tone}`}
    >
      {state === 'checking' ? <span className="animate-pulse">{label}</span> : label}
    </button>
  )
}

function AutosaveBadge() {
  const state = useAutosaveStore((s) => s.state)
  const savedAt = useAutosaveStore((s) => s.savedAt)
  const restoredAt = useAutosaveStore((s) => s.restoredAt)

  if (state === 'off') {
    return (
      <span className="hidden rounded-full border border-gray-800 bg-gray-900/60 px-2.5 py-1 text-[10px] text-gray-500 lg:inline-block">
        autosave off · opened from an export
      </span>
    )
  }
  if (state === 'unavailable') {
    return (
      <span className="hidden rounded-full border border-amber-900/60 bg-amber-950/40 px-2.5 py-1 text-[10px] text-amber-300 lg:inline-block">
        autosave unavailable
      </span>
    )
  }

  const label =
    state === 'saving'
      ? 'saving…'
      : restoredAt && !savedAt
        ? `draft restored ${formatWhen(restoredAt)}`
        : savedAt
          ? `saved ${formatWhen(savedAt)}`
          : 'autosave on'

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-gray-800 bg-gray-900/60 px-2.5 py-1 text-[10px] text-gray-400 lg:inline-flex"
      title="Your graph is saved in this browser as you edit"
    >
      <span
        className={`size-1.5 rounded-full ${
          state === 'saving' ? 'animate-pulse bg-sky-400' : 'bg-emerald-400'
        }`}
      />
      {label}
    </span>
  )
}

function formatWhen(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.round(minutes / 60)}h ago`
}

function HistoryButtons() {
  const canUndo = useHistoryStore((s) => s.canUndo())
  const canRedo = useHistoryStore((s) => s.canRedo())
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)

  const className =
    'rounded-md border border-gray-700 bg-gray-900/70 px-2 py-1.5 text-xs text-gray-300 transition hover:border-sky-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30'

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!canUndo}
        onClick={() => undo()}
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        className={className}
      >
        ↶
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={() => redo()}
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        className={className}
      >
        ↷
      </button>
    </div>
  )
}

export default function App() {
  const status = useExecutionStore((s) => s.status)
  const cancelRequested = useExecutionStore((s) => s.cancelRequested)
  const running = status === 'running'
  const gpuState = useGpuStore((s) => s.state)
  const gpuDetail = useGpuStore((s) => s.detail)
  const probe = useGpuStore((s) => s.probe)
  const clearNodeRuntime = useGraphStore((s) => s.clearNodeRuntime)
  const resetRun = useExecutionStore((s) => s.reset)
  const runError = useExecutionStore((s) => s.error)
  const runSteps = useExecutionStore((s) => s.steps)
  const embedded = readInjectedPayload()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    probe()
  }, [probe])

  useAutosave()
  useHistory()

  const gpuBlocked = gpuState === 'unavailable' || gpuState === 'error'

  return (
    <div className="flex h-full flex-col bg-gray-950 text-gray-100">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-800 bg-gray-950/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label="Toggle node palette"
          className="rounded-md border border-gray-700 p-1.5 text-gray-300 transition hover:border-sky-600 md:hidden"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <span className="size-2.5 shrink-0 rounded-full bg-sky-400 shadow-[0_0_12px] shadow-sky-500/60" />
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">LocalNodeAI</h1>
        <span className="hidden rounded-full border border-gray-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gray-500 lg:inline">
          local-first
        </span>
        <GpuBadge />
        <AutosaveBadge />

        <div className="ml-auto flex items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={() => void cancelRun()}
              disabled={cancelRequested}
              title="Stop generation"
              className={`${btnClass} border-amber-800 bg-amber-950/40 text-amber-200 hover:bg-amber-900/40`}
            >
              {cancelRequested ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runWorkflow()}
              disabled={gpuBlocked}
              title={gpuBlocked ? 'WebGPU is required to run models' : 'Execute the workflow'}
              className={`${btnClass} border-sky-700 bg-sky-950/60 text-sky-200 hover:border-sky-500 hover:bg-sky-900/60`}
            >
              Run workflow
            </button>
          )}
          <HistoryButtons />
          <ExportButton />
        </div>
      </header>

      {gpuBlocked ? (
        <div className="border-b border-amber-900/60 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
          <span className="font-medium">WebGPU unavailable</span> —{' '}
          {gpuDetail ?? 'models cannot run here'}. Use Chrome/Edge 113+ on{' '}
          <code className="text-amber-100">https</code> or <code className="text-amber-100">localhost</code>.
          You can still build and export the graph.
        </div>
      ) : null}

      {embedded ? (
        <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-1.5 text-[11px] text-gray-400">
          Exported workflow embedded in this file · saved{' '}
          {new Date(embedded.exportedAt).toLocaleString()} · {embedded.nodes.length} nodes,{' '}
          {embedded.edges.length} connections
        </div>
      ) : null}

      <main className="relative flex min-h-0 flex-1">
        <div
          className={`absolute inset-y-0 left-0 z-20 flex transition-transform duration-200 md:static md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close palette"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-10 bg-black/50 md:hidden"
          />
        ) : null}

        <Canvas />

        <div className="hidden xl:flex">
          <RunPanel />
        </div>
      </main>

      {status !== 'idle' || runSteps.length > 0 ? (
        <footer className="flex items-center gap-3 border-t border-gray-800 bg-gray-950/90 px-4 py-1.5 text-[11px] text-gray-500 xl:hidden">
          <span className="truncate">{runError ?? describeStatus(status)}</span>
          <button
            type="button"
            onClick={() => {
              resetRun()
              clearNodeRuntime()
            }}
            className="ml-auto shrink-0 text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
          >
            Clear
          </button>
        </footer>
      ) : null}

      <ContextMenu />
      <Toast />
    </div>
  )
}

function describeStatus(status: string): string {
  switch (status) {
    case 'running':
      return 'Running workflow…'
    case 'done':
      return 'Run complete'
    case 'cancelled':
      return 'Run cancelled'
    case 'error':
      return 'Run failed'
    default:
      return ''
  }
}