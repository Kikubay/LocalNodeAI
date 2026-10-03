export type TextOpKind =
  | 'template'
  | 'replace'
  | 'extract'
  | 'jsonPath'
  | 'split'
  | 'slice'
  | 'case'
  | 'trim'

export type TextOpField = {
  key: string
  label: string
  control?: 'input' | 'textarea' | 'select'
  placeholder?: string
  choices?: { value: string; label: string }[]
}

export type TextOpSpec = {
  kind: TextOpKind
  label: string
  description: string
  fields: TextOpField[]
}

export const TEXT_OPS: TextOpSpec[] = [
  {
    kind: 'template',
    label: 'Template',
    description: 'Wrap the input in fixed text',
    fields: [{ key: 'template', label: 'Template', control: 'textarea', placeholder: '{{input}}' }],
  },
  {
    kind: 'replace',
    label: 'Find & replace',
    description: 'Regex replace across the input',
    fields: [
      { key: 'pattern', label: 'Find (regex)', control: 'textarea', placeholder: '\\s+' },
      { key: 'replacement', label: 'Replace with', placeholder: ' ' },
      { key: 'flags', label: 'Flags', placeholder: 'g' },
    ],
  },
  {
    kind: 'extract',
    label: 'Extract match',
    description: 'First regex match, or one capture group',
    fields: [
      { key: 'pattern', label: 'Match (regex)', control: 'textarea', placeholder: '(\\d+)' },
      { key: 'group', label: 'Group', placeholder: '0' },
      { key: 'flags', label: 'Flags', placeholder: 'i' },
    ],
  },
  {
    kind: 'jsonPath',
    label: 'JSON field',
    description: 'Pull a field out of a JSON response',
    fields: [
      {
        key: 'path',
        label: 'Path',
        control: 'textarea',
        placeholder: 'choices.0.message.content',
      },
    ],
  },
  {
    kind: 'split',
    label: 'Split',
    description: 'Split on a delimiter and take one part',
    fields: [
      { key: 'delimiter', label: 'Delimiter', placeholder: '\\n' },
      { key: 'index', label: 'Index', placeholder: '0' },
    ],
  },
  {
    kind: 'slice',
    label: 'Slice',
    description: 'Cut a substring',
    fields: [
      { key: 'start', label: 'Start', placeholder: '0' },
      { key: 'length', label: 'Length', placeholder: 'optional' },
    ],
  },
  {
    kind: 'case',
    label: 'Case',
    description: 'Change letter case',
    fields: [
      {
        key: 'caseMode',
        label: 'Mode',
        control: 'select',
        choices: [
          { value: 'lower', label: 'lowercase' },
          { value: 'upper', label: 'UPPERCASE' },
          { value: 'title', label: 'Title Case' },
          { value: 'sentence', label: 'Sentence case' },
        ],
      },
    ],
  },
  { kind: 'trim', label: 'Trim', description: 'Trim and collapse whitespace', fields: [] },
]

const OP_BY_KIND = new Map(TEXT_OPS.map((op) => [op.kind, op]))

export function isTextOpKind(value: unknown): value is TextOpKind {
  return typeof value === 'string' && OP_BY_KIND.has(value as TextOpKind)
}

export function textOpSpec(kind: TextOpKind): TextOpSpec {
  return OP_BY_KIND.get(kind) ?? TEXT_OPS[0]
}

export function defaultTextOptions(kind: TextOpKind): Record<string, string> {
  const spec = textOpSpec(kind)
  const options: Record<string, string> = {}
  for (const field of spec.fields) {
    if (field.choices) options[field.key] = field.choices[0].value
  }
  switch (kind) {
    case 'template':
      options.template = '{{input}}'
      break
    case 'replace':
      options.flags = 'g'
      break
    case 'extract':
      options.group = '0'
      options.flags = ''
      break
    case 'jsonPath':
      options.path = 'choices.0.message.content'
      break
    case 'split':
      options.index = '0'
      break
    case 'slice':
      options.start = '0'
      break
    default:
      break
  }
  return options
}

export type TextOpResult = { value: string; error?: string }

const REGEX_INPUT_LIMIT = 100_000

const VALID_FLAGS = /[^gimsuyd]/g

type CompiledPattern = { regex: RegExp | null; error?: string }

function safePattern(options: Record<string, string>): CompiledPattern {
  const pattern = options.pattern ?? ''
  if (pattern.length === 0) return { regex: null }
  const flags = (options.flags ?? '').replace(VALID_FLAGS, '').slice(0, 6)
  try {
    return { regex: new RegExp(pattern, flags) }
  } catch (error) {
    return { regex: null, error: `Invalid regular expression: ${messageOf(error)}` }
  }
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getByPath(value: unknown, path: string): string {
  if (!path) return ''
  let current: unknown = value

  for (const segment of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (!segment) continue
    if (current === null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[segment]
  }

  if (current === null || current === undefined) return ''
  return typeof current === 'string' ? current : JSON.stringify(current)
}

function unescapeDelimiter(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

export function applyTextOp(
  kind: TextOpKind,
  options: Record<string, string>,
  input: string,
): TextOpResult {
  const text = input.slice(0, REGEX_INPUT_LIMIT)

  switch (kind) {
    case 'template': {
      const template = (options.template ?? '').trim() || '{{input}}'
      const value = template.includes('{{input}}')
        ? template.replaceAll('{{input}}', input)
        : `${template}\n\n${input}`.trim()
      return { value }
    }

    case 'replace': {
      const { regex, error } = safePattern(options)
      if (error) return { value: '', error }
      if (!regex) return { value: input }
      try {
        return { value: input.replace(regex, options.replacement ?? '') }
      } catch (error) {
        return { value: '', error: `Replace failed: ${messageOf(error)}` }
      }
    }

    case 'extract': {
      const { regex, error } = safePattern(options)
      if (error) return { value: '', error }
      if (!regex) return { value: '' }
      try {
        const match = regex.exec(text)
        if (!match) return { value: '' }
        const group = toInt(options.group, 0)
        return { value: match[group] ?? match[0] ?? '' }
      } catch (error) {
        return { value: '', error: `Extract failed: ${messageOf(error)}` }
      }
    }

    case 'jsonPath': {
      try {
        return { value: getByPath(JSON.parse(text), options.path ?? '') }
      } catch (error) {
        return { value: '', error: `Could not read JSON field: ${messageOf(error)}` }
      }
    }

    case 'split': {
      const delimiter = unescapeDelimiter(options.delimiter ?? '')
      if (delimiter.length === 0) return { value: input }
      const parts = input.split(delimiter)
      return { value: parts[toInt(options.index, 0)] ?? '' }
    }

    case 'slice': {
      const start = toInt(options.start, 0)
      const rawLength = (options.length ?? '').trim()
      const end = rawLength.length === 0 ? undefined : start + toInt(rawLength, 0)
      return { value: input.slice(start, end) }
    }

    case 'case': {
      switch (options.caseMode) {
        case 'upper':
          return { value: input.toUpperCase() }
        case 'title':
          return {
            value: input.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
          }
        case 'sentence':
          return {
            value: input
              .toLowerCase()
              .replace(
                /(^|[.!?]\s+)(\w)/g,
                (_match, lead: string, letter: string) => lead + letter.toUpperCase(),
              ),
          }
        default:
          return { value: input.toLowerCase() }
      }
    }

    case 'trim':
      return { value: input.replace(/\s+/g, ' ').trim() }

    default:
      return { value: input }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
