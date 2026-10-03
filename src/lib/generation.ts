export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_MAX_TOKENS = 512

export const MIN_TEMPERATURE = 0
export const MAX_TEMPERATURE = 2
export const MIN_MAX_TOKENS = 1
export const MAX_MAX_TOKENS = 8192

export type GenerationSettings = {
  temperature: number
  maxTokens: number
  seed?: number
  stop?: string[]
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function clampTemperature(value: unknown): number {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return DEFAULT_TEMPERATURE
  return Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, parsed))
}

export function normaliseMaxTokens(value: unknown): number {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return DEFAULT_MAX_TOKENS
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, Math.round(parsed)))
}

export function normaliseSeed(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = toFiniteNumber(value)
  return parsed === null ? undefined : Math.round(parsed)
}

export function parseStopSequences(text: unknown): string[] | undefined {
  if (typeof text !== 'string') return undefined
  const sequences = text
    .split('\n')
    .map((line) => line.trim().replace(/\\n/g, '\n'))
    .filter((line) => line.length > 0)
  return sequences.length > 0 ? sequences : undefined
}

export function readGenerationSettings(data: {
  temperature?: unknown
  maxTokens?: unknown
  seed?: unknown
  stop?: unknown
}): GenerationSettings {
  return {
    temperature: clampTemperature(data.temperature),
    maxTokens: normaliseMaxTokens(data.maxTokens),
    seed: normaliseSeed(data.seed),
    stop: Array.isArray(data.stop)
      ? (data.stop.filter((entry): entry is string => typeof entry === 'string').slice(0, 4) as string[])
      : parseStopSequences(data.stop),
  }
}

export function describeGeneration(settings: GenerationSettings): string {
  const parts = [`temp ${settings.temperature}`, `max ${settings.maxTokens} tokens`]
  if (settings.seed !== undefined) parts.push(`seed ${settings.seed}`)
  if (settings.stop && settings.stop.length > 0) parts.push(`${settings.stop.length} stop`)
  return parts.join(' · ')
}
