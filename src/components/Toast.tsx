import { useEffect } from 'react'
import { useToastStore } from '../store/toastStore'

const VISIBLE_MS = 1500
const VISIBLE_MS_WITH_ACTION = 6000

export function Toast() {
  const message = useToastStore((state) => state.message)
  const action = useToastStore((state) => state.action)
  const tone = useToastStore((state) => state.tone)
  const clear = useToastStore((state) => state.clear)

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(clear, action ? VISIBLE_MS_WITH_ACTION : VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [message, action, clear])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2"
    >
      {message ? (
        <div
          className={`animate-[lna-fade-in_150ms_ease-out] flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs shadow-xl ${
            tone === 'error'
              ? 'border-red-900/70 bg-red-950/90 text-red-200'
              : 'border-gray-700 bg-gray-800 text-gray-100'
          }`}
        >
          <span className="max-w-72 break-words">{message}</span>
          {action ? (
            <button
              type="button"
              onClick={() => {
                action.onClick()
                clear()
              }}
              className="pointer-events-auto shrink-0 font-medium text-sky-300 underline-offset-2 hover:underline"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}