import { useState } from 'react'
import { buildExportHtml, downloadHtml, exportFilename, ExportError } from '../lib/serialization'

export function ExportButton() {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const onClick = async () => {
    setState('working')
    setMessage(null)
    try {
      const html = await buildExportHtml()
      downloadHtml(html, exportFilename())
      setState('idle')
      setMessage(`Saved ${(html.length / 1_048_576).toFixed(1)} MB`)
    } catch (error) {
      setState('error')
      if (error instanceof ExportError) {
        setMessage(error.hint ?? error.message)
      } else {
        setMessage(error instanceof Error ? error.message : String(error))
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message ? (
        <span className={`max-w-56 truncate text-[11px] ${state === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
          {message}
        </span>
      ) : null}
      <button
        type="button"
        disabled={state === 'working'}
        onClick={() => void onClick()}
        title="Bundle this workflow into one offline HTML file"
        className="rounded-md border border-gray-700 bg-gray-900/70 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-sky-600 hover:bg-gray-900 disabled:opacity-40"
      >
        {state === 'working' ? 'Exporting…' : 'Export'}
      </button>
    </div>
  )
}