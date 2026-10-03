import { create } from 'zustand'

export type ToastAction = {
  label: string
  onClick: () => void
}

type ToastState = {
  message: string | null
  action: ToastAction | null
  tone: 'info' | 'error'
  show: (message: string, action?: ToastAction) => void
  fail: (message: string) => void
  clear: () => void
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  action: null,
  tone: 'info',
  show: (message, action) => set({ message, action: action ?? null, tone: 'info' }),
  fail: (message) => set({ message, action: null, tone: 'error' }),
  clear: () => set({ message: null, action: null }),
}))