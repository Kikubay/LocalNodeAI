export type BranchConditionKind =
  | 'always'
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'isEmpty'
  | 'notEmpty'
  | 'numberGreater'
  | 'numberLess'
  | 'lengthGreater'
  | 'lengthLess'

export type BranchField = {
  key: string
  label: string
  placeholder?: string
}

export type BranchConditionSpec = {
  kind: BranchConditionKind
  label: string
  description: string
  fields: BranchField[]
}

const NEEDLE: BranchField[] = [{ key: 'needle', label: 'Value', placeholder: 'text' }]
const NUMBER: BranchField[] = [{ key: 'value', label: 'Compare to', placeholder: '0' }]

export const BRANCH_CONDITIONS: BranchConditionSpec[] = [
  { kind: 'always', label: 'Always match', description: 'Always takes the matched path', fields: [] },
  {
    kind: 'contains',
    label: 'Contains text',
    description: 'Matched when the input contains the value',
    fields: NEEDLE,
  },
  {
    kind: 'notContains',
    label: 'Does not contain',
    description: 'Matched when the value is absent',
    fields: NEEDLE,
  },
  { kind: 'equals', label: 'Equals', description: 'Exact match', fields: NEEDLE },
  { kind: 'notEquals', label: 'Not equals', description: 'Anything but an exact match', fields: NEEDLE },
  {
    kind: 'startsWith',
    label: 'Starts with',
    description: 'Matched on a leading substring',
    fields: NEEDLE,
  },
  {
    kind: 'endsWith',
    label: 'Ends with',
    description: 'Matched on a trailing substring',
    fields: NEEDLE,
  },
  {
    kind: 'matches',
    label: 'Matches regex',
    description: 'Matched when a regular expression hits',
    fields: [{ key: 'needle', label: 'Pattern', placeholder: '^\\d+$' }],
  },
  {
    kind: 'isEmpty',
    label: 'Is empty',
    description: 'Matched when there is no input',
    fields: [],
  },
  {
    kind: 'notEmpty',
    label: 'Is not empty',
    description: 'Matched when there is input',
    fields: [],
  },
  {
    kind: 'numberGreater',
    label: 'Number greater than',
    description: 'Compares the input as a number',
    fields: NUMBER,
  },
  {
    kind: 'numberLess',
    label: 'Number less than',
    description: 'Compares the input as a number',
    fields: NUMBER,
  },
  {
    kind: 'lengthGreater',
    label: 'Length greater than',
    description: 'Compares the character count',
    fields: NUMBER,
  },
  {
    kind: 'lengthLess',
    label: 'Length less than',
    description: 'Compares the character count',
    fields: NUMBER,
  },
]

export const BRANCH_TRUE_HANDLE = 'if'
export const BRANCH_FALSE_HANDLE = 'else'

const SPEC_BY_KIND = new Map(BRANCH_CONDITIONS.map((spec) => [spec.kind, spec]))

export function isBranchConditionKind(value: unknown): value is BranchConditionKind {
  return typeof value === 'string' && SPEC_BY_KIND.has(value as BranchConditionKind)
}

export function branchConditionSpec(kind: BranchConditionKind): BranchConditionSpec {
  return SPEC_BY_KIND.get(kind) ?? BRANCH_CONDITIONS[0]
}

export function defaultBranchOptions(kind: BranchConditionKind): Record<string, string> {
  const options: Record<string, string> = {}
  for (const field of branchConditionSpec(kind).fields) options[field.key] = ''
  return options
}

export type ConditionResult = { value: boolean; error?: string }

const toNumber = (value: string): number => Number.parseFloat(String(value).trim())

export function evaluateCondition(
  kind: BranchConditionKind,
  options: Record<string, string>,
  input: string,
): ConditionResult {
  const needle = options.needle ?? ''

  switch (kind) {
    case 'always':
      return { value: true }
    case 'contains':
      return { value: input.includes(needle) }
    case 'notContains':
      return { value: !input.includes(needle) }
    case 'equals':
      return { value: input === needle }
    case 'notEquals':
      return { value: input !== needle }
    case 'startsWith':
      return { value: input.startsWith(needle) }
    case 'endsWith':
      return { value: input.endsWith(needle) }
    case 'matches': {
      if (needle.length === 0) return { value: false }
      try {
        return { value: new RegExp(needle, 'i').test(input) }
      } catch (error) {
        return {
          value: false,
          error: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }
    case 'isEmpty':
      return { value: input.length === 0 }
    case 'notEmpty':
      return { value: input.length > 0 }
    case 'numberGreater': {
      const left = toNumber(input)
      const right = toNumber(options.value ?? '')
      return { value: Number.isFinite(left) && Number.isFinite(right) && left > right }
    }
    case 'numberLess': {
      const left = toNumber(input)
      const right = toNumber(options.value ?? '')
      return { value: Number.isFinite(left) && Number.isFinite(right) && left < right }
    }
    case 'lengthGreater':
      return { value: input.length > toNumber(options.value ?? '') }
    case 'lengthLess':
      return { value: input.length < toNumber(options.value ?? '') }
    default:
      return { value: true }
  }
}
