export type ModelOption = {
  id: string
  label: string
  size: string
}

export const MODELS: ModelOption[] = [
  { id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', label: 'Llama 3.2 1B Instruct', size: '~0.9 GB' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 0.5B Instruct', size: '~0.4 GB' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', label: 'SmolLM2 1.7B Instruct', size: '~1.1 GB' },
  {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 3B Instruct',
    size: '~2.3 GB',
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    label: 'Phi 3.5 Mini Instruct',
    size: '~2.2 GB',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    label: 'Gemma 2 2B Instruct',
    size: '~1.6 GB',
  },
]

export const DEFAULT_MODEL = MODELS[0].id

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant running fully locally in the user’s browser. Answer clearly and concisely.'
