import { useRef } from 'react'
import { clearAutosave } from '../lib/autosave'
import { applyWorkflow, currentPayload, parseWorkflowJson } from '../lib/serialization'
import { useGraphStore } from '../store/graphStore'
import { useToastStore } from '../store/toastStore'

export type WorkflowActionsProps = {
  className?: string
  compact?: boolean
}

export function WorkflowActions({ className, compact }: WorkflowActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const showToast = useToastStore((state) => state.show)
  const failToast = useToastStore((state) => state.fail)

  const exportJson = () => {
    const payload = currentPayload()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `localnodeai-workflow-${payload.exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    showToast(`Exported ${payload.nodes.length} nodes as JSON`)
  }

  const importJson = async (file: File) => {
    let text: string
    try {
      text = await file.text()
    } catch {
      failToast('Could not read that file.')
      return
    }

    const { payload, error } = parseWorkflowJson(text)
    if (!payload) {
      failToast(error ?? 'That file is not a LocalNodeAI workflow.')
      return
    }

    const applied = applyWorkflow(payload)
    if (applied.nodes.length === 0) {
      failToast('That workflow had no usable nodes.')
      return
    }

    const previous = {
      nodes: useGraphStore.getState().nodes,
      edges: useGraphStore.getState().edges,
      viewport: useGraphStore.getState().viewport,
    }

    const store = useGraphStore.getState()
    store.replaceGraph(applied.nodes, applied.edges)
    if (payload.viewport) store.setViewport(payload.viewport)

    const summary = `Imported ${applied.nodes.length} nodes`
    showToast(
      applied.warnings.length > 0 ? `${summary} · ${applied.warnings.length} issue(s) fixed` : summary,
      {
        label: 'Undo',
        onClick: () => {
          const current = useGraphStore.getState()
          current.replaceGraph(previous.nodes, previous.edges)
          current.setViewport(previous.viewport)
          showToast('Import undone')
        },
      },
    )
  }

  const startOver = () => {
    const previous = {
      nodes: useGraphStore.getState().nodes,
      edges: useGraphStore.getState().edges,
      viewport: useGraphStore.getState().viewport,
    }
    useGraphStore.getState().replaceGraph([], [])
    clearAutosave()
    showToast('Canvas cleared', {
      label: 'Undo',
      onClick: () => {
        const current = useGraphStore.getState()
        current.replaceGraph(previous.nodes, previous.edges)
        current.setViewport(previous.viewport)
      },
    })
  }

  const buttonClass =
    'rounded border border-gray-800 bg-gray-900/60 px-2 py-1 text-[11px] text-gray-300 transition hover:border-sky-600 hover:text-gray-100'

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importJson(file)
        }}
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={buttonClass} onClick={() => inputRef.current?.click()}>
          Import JSON
        </button>
        <button type="button" className={buttonClass} onClick={exportJson}>
          Export JSON
        </button>
        {!compact ? (
          <button type="button" className={buttonClass} onClick={startOver}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  )
}
