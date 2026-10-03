import { useEffect, useState } from 'react'
import { isModelCached } from '../lib/webllm'

export function useModelCached(modelId: string | undefined, isLoaded: boolean): boolean | null {
  const [cached, setCached] = useState<boolean | null>(null)

  useEffect(() => {
    if (!modelId) return
    let active = true
    isModelCached(modelId)
      .then((value) => {
        if (active) setCached(value)
      })
      .catch(() => {
        if (active) setCached(null)
      })
    return () => {
      active = false
    }
  }, [modelId, isLoaded])

  return modelId ? cached : null
}
