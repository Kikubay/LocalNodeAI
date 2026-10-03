export type CacheEntry = {
  key: string
  nodes: string[]
  values: string[]
  savedAt: number
}

const STORAGE_KEY = 'localnodeai.cache'

const MAX_ENTRIES = 40
const MAX_VALUE_CHARS = 24_000

const memory = new Map<string, CacheEntry>()

function storage(): Storage | null {
  try {
    const store = globalThis.localStorage
    if (!store) return null
    const probe = `${STORAGE_KEY}.probe`
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

function hashKey(key: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

function prune() {
  if (memory.size <= MAX_ENTRIES) return
  const oldest = [...memory.values()].sort((a, b) => a.savedAt - b.savedAt)
  for (const entry of oldest) {
    if (memory.size <= MAX_ENTRIES) break
    memory.delete(hashKey(entry.key))
  }
}

function persist() {
  const store = storage()
  if (!store) return
  try {
    const payload: Record<string, CacheEntry> = {}
    for (const [hash, entry] of memory) payload[hash] = entry
    store.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
  }
}

function hydrate() {
  if (memory.size > 0) return
  const store = storage()
  if (!store) return
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>
    for (const [hash, entry] of Object.entries(parsed)) {
      if (Array.isArray(entry?.nodes) && Array.isArray(entry?.values)) {
        memory.set(hash, entry)
      }
    }
  } catch {
  }
}

export function cacheGet(key: string): CacheEntry | undefined {
  hydrate()
  const entry = memory.get(hashKey(key))
  return entry?.key === key ? entry : undefined
}

export function cacheSet(key: string, nodes: string[], values: string[]): CacheEntry {
  hydrate()
  const entry: CacheEntry = {
    key,
    nodes,
    values: values.map((value) => value.slice(0, MAX_VALUE_CHARS)),
    savedAt: Date.now(),
  }
  memory.set(hashKey(key), entry)
  prune()
  persist()
  return entry
}

export function cacheClear(): void {
  memory.clear()
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
  }
}

export function cacheCount(): number {
  hydrate()
  return memory.size
}

export function cacheKeys(): string[] {
  hydrate()
  return [...memory.values()].map((entry) => entry.key)
}

export function cacheIsPersistent(): boolean {
  return storage() !== null
}
