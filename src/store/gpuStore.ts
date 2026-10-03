import { create } from 'zustand'

export type GpuState = 'checking' | 'ready' | 'unavailable' | 'error'

export type GpuInfo = {
  state: GpuState
  adapter: string | null
  detail: string | null
}

type GpuStore = GpuInfo & {
  probe: () => void
}

const initial: GpuInfo = { state: 'checking', adapter: null, detail: null }

export const useGpuStore = create<GpuStore>()((set) => ({
  ...initial,
  probe: () => void probeWebGPU(set),
}))

function describe(adapter: GPUAdapter): string | null {
  const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info
  if (!info) return null
  const parts = [info.vendor, info.architecture, info.device, info.description].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  )
  return parts.length > 0 ? parts.join(' · ') : null
}

export async function probeWebGPU(set: (info: GpuInfo) => void): Promise<void> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    set({
      state: 'unavailable',
      adapter: null,
      detail: 'This browser does not expose navigator.gpu.',
    })
    return
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) {
      set({
        state: 'unavailable',
        adapter: null,
        detail: 'No WebGPU adapter available. Check that hardware acceleration is enabled.',
      })
      return
    }

    set({ state: 'ready', adapter: describe(adapter), detail: null })
  } catch (error) {
    set({
      state: 'error',
      adapter: null,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}