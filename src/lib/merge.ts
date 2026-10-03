export type MergePart = {
  id: string
  value: string
}

export type MergeOptions = {
  separator: string
  sources: string
  labelWithSource: boolean
  skipEmpty: boolean
}

export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  separator: '\\n\\n',
  sources: '',
  labelWithSource: false,
  skipEmpty: true,
}

export function unescape(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

export function parseSourceList(sources: string): string[] {
  return sources
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function mergeParts(parts: MergePart[], options: MergeOptions): string {
  const wanted = parseSourceList(options.sources)
  const ordered = wanted.length > 0 ? [...wanted, ...parts.map((part) => part.id)] : parts.map((part) => part.id)

  const seen = new Set<string>()
  const selected: MergePart[] = []
  for (const id of ordered) {
    if (seen.has(id)) continue
    seen.add(id)
    const part = parts.find((candidate) => candidate.id === id)
    if (part) selected.push(part)
  }

  const usable = options.skipEmpty ? selected.filter((part) => part.value.trim().length > 0) : selected

  return usable
    .map((part) => (options.labelWithSource ? `${part.id}: ${part.value}` : part.value))
    .join(unescape(options.separator))
}
