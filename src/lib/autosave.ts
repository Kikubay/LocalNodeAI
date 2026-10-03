import type { WorkflowPayload } from './serialization'

const KEY = 'localnodeai.autosave'

const MAX_AUTOSAVE_BYTES = 4_000_000

let enabled = true

export function setAutosaveEnabled(value: boolean): void {
  enabled = value
}

export function isAutosaveEnabled(): boolean {
  return enabled
}

function storage(): Storage | null {
  try {
    const store = globalThis.localStorage
    if (!store) return null
    const probe = `${KEY}.probe`
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

export function readAutosave(): WorkflowPayload | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const payload = JSON.parse(raw) as WorkflowPayload
    return payload?.version === 1 && Array.isArray(payload.nodes) ? payload : null
  } catch {
    return null
  }
}

export function writeAutosave(payload: WorkflowPayload): boolean {
  if (!enabled) return false
  const store = storage()
  if (!store) return false

  try {
    const serialised = JSON.stringify(payload)
    if (serialised.length > MAX_AUTOSAVE_BYTES) return false
    store.setItem(KEY, serialised)
    return true
  } catch {
    return false
  }
}

export function clearAutosave(): void {
  try {
    storage()?.removeItem(KEY)
  } catch {
  }
}

export function autosaveAvailable(): boolean {
  return storage() !== null
}
