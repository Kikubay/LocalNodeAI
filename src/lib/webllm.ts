import {
  CreateMLCEngine,
  hasModelInCache,
  prebuiltAppConfig,
  type InitProgressReport,
  type MLCEngineInterface,
} from '@mlc-ai/web-llm'

export type ProgressHandler = (report: InitProgressReport) => void

let engine: MLCEngineInterface | null = null
let engineModelId: string | null = null
let loading: Promise<MLCEngineInterface> | null = null

export class WebLLMError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'WebLLMError'
    this.hint = hint
  }
}

export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

export function getLoadedModel(): string | null {
  return engineModelId
}

const knownModels = new Set(prebuiltAppConfig.model_list.map((model) => model.model_id))

export function isKnownModel(modelId: string): boolean {
  return knownModels.has(modelId)
}

export async function ensureEngine(modelId: string, onProgress?: ProgressHandler): Promise<MLCEngineInterface> {
  if (!isWebGPUSupported()) {
    throw new WebLLMError(
      'WebGPU is not available in this browser.',
      'Use a Chromium-based browser (Chrome/Edge 113+) on https or localhost.',
    )
  }

  if (!isKnownModel(modelId)) {
    throw new WebLLMError(`Unknown model "${modelId}".`, 'Pick a model from the node dropdown.')
  }

  if (engine && engineModelId === modelId) {
    return engine
  }

  if (loading) {
    try {
      await loading
      if (engine && engineModelId === modelId) return engine
    } catch {
      loading = null
    }
  }

  loading = (async () => {
    try {
      if (engine) {
        await engine.reload(modelId)
      } else {
        engine = await CreateMLCEngine(modelId, {
          initProgressCallback: (report) => onProgress?.(report),
        })
      }
      engineModelId = modelId
      return engine
    } catch (error) {
      engine = null
      engineModelId = null
      const message = error instanceof Error ? error.message : String(error)
      throw new WebLLMError(message, 'Model download failed. Check your connection and retry.')
    } finally {
      loading = null
    }
  })()

  return loading
}

export type StreamOptions = {
  temperature?: number
  maxTokens?: number
  seed?: number
  stop?: string[]
  onToken: (full: string, chunk: string) => void
}

export type StreamResult = {
  text: string
  finishReason: string | null
}

export async function streamChat(
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  options: StreamOptions,
  onProgress?: ProgressHandler,
): Promise<StreamResult> {
  const active = await ensureEngine(modelId, onProgress)
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ]

  const stream = await active.chat.completions.create({
    messages,
    stream: true,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.stop && options.stop.length > 0 ? { stop: options.stop } : {}),
  })

  let full = ''
  let finishReason: string | null = null

  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    if (choice?.finish_reason) finishReason = choice.finish_reason
    const delta = choice?.delta?.content
    if (!delta) continue
    full += delta
    options.onToken(full, delta)
  }

  return { text: full, finishReason }
}

export async function unloadEngine(): Promise<void> {
  await engine?.unload()
  engine = null
  engineModelId = null
}

export async function interruptGeneration(): Promise<void> {
  try {
    await engine?.interruptGenerate()
  } catch {
  }
}

export async function isModelCached(modelId: string): Promise<boolean> {
  if (engineModelId === modelId) return true
  try {
    return await hasModelInCache(modelId, prebuiltAppConfig)
  } catch {
    return false
  }
}
