import { existsSync, readFileSync } from 'node:fs'
import { topologicalOrder, renderPrompt, GraphError } from '../src/lib/graph'
import { useGraphStore, type LocalNode } from '../src/store/graphStore'
import { runWorkflow, validateGraph, nodeFingerprint } from '../src/lib/execution'
import { useHistoryStore } from '../src/store/historyStore'
import { isTextEntry } from '../src/hooks/useHistory'
import { useExecutionStore } from '../src/store/executionStore'
import { useToastStore } from '../src/store/toastStore'
import { copyToClipboard } from '../src/lib/clipboard'
import { cacheClear, cacheCount, cacheGet, cacheKeys, cacheSet } from '../src/lib/cache'
import { TEXT_OPS, applyTextOp, getByPath, type TextOpKind } from '../src/lib/textOps'
import { DEFAULT_MERGE_OPTIONS, mergeParts, parseSourceList } from '../src/lib/merge'
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
  clampTemperature,
  describeGeneration,
  normaliseMaxTokens,
  normaliseSeed,
  parseStopSequences,
  readGenerationSettings,
} from '../src/lib/generation'
import { BRANCH_CONDITIONS, evaluateCondition, type BranchConditionKind } from '../src/lib/branchConditions'
import {
  PAYLOAD_ID,
  applyWorkflow,
  currentPayload,
  decodePayload,
  encodePayload,
  hydrateFromInjectedState,
  injectPayload,
  parseWorkflowJson,
} from '../src/lib/serialization'
import {
  autosaveAvailable,
  clearAutosave,
  readAutosave,
  setAutosaveEnabled,
  writeAutosave,
} from '../src/lib/autosave'

let failures = 0
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`PASS ${name}`)
  } else {
    failures++
    console.log(`FAIL ${name}`, detail ?? '')
  }
}

const n = (id: string, type: LocalNode['type'], data: object): LocalNode =>
  ({ id, type, position: { x: 0, y: 0 }, data }) as LocalNode

{
  const nodes = [n('c', 'end', { output: '' }), n('a', 'start', { input: 'hi' }), n('b', 'llm', {})]
  const edges = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ]
  check('topo: linear chain', topologicalOrder(nodes, edges as never).map((x) => x.id).join(',') === 'a,b,c')
}

{
  const nodes = [n('b', 'llm', {}), n('c', 'end', { output: '' }), n('a', 'start', { input: '' })]
  const edges = [
    { id: 'e2', source: 'b', target: 'c' },
    { id: 'e1', source: 'a', target: 'b' },
  ]
  check('topo: unordered input', topologicalOrder(nodes, edges as never).map((x) => x.id).join(',') === 'a,b,c')
}

{
  const nodes = [
    n('s', 'start', { input: '' }),
    n('l1', 'llm', {}),
    n('l2', 'llm', {}),
    n('e', 'end', { output: '' }),
  ]
  const edges = [
    { id: '1', source: 's', target: 'l1' },
    { id: '2', source: 's', target: 'l2' },
    { id: '3', source: 'l1', target: 'e' },
    { id: '4', source: 'l2', target: 'e' },
  ]
  const order = topologicalOrder(nodes, edges as never).map((x) => x.id)
  check('topo: fan-in respects deps', order.indexOf('l1') < order.indexOf('e') && order.indexOf('l2') < order.indexOf('e') && order[0] === 's', order)
}

{
  const nodes = [n('a', 'llm', {}), n('b', 'llm', {})]
  const edges = [
    { id: '1', source: 'a', target: 'b' },
    { id: '2', source: 'b', target: 'a' },
  ]
  let threw = false
  try {
    topologicalOrder(nodes, edges as never)
  } catch (error) {
    threw = error instanceof GraphError
  }
  check('topo: cycle throws GraphError', threw)
}

{
  let threw = false
  try {
    topologicalOrder([n('a', 'start', {})], [{ id: '1', source: 'a', target: 'ghost' }] as never)
  } catch (error) {
    threw = error instanceof GraphError
  }
  check('topo: dangling edge throws', threw)
}

check('prompt: plain passthrough', renderPrompt('{{input}}', 'hello') === 'hello')
check('prompt: template wrap', renderPrompt('Answer: {{input}}', '42') === 'Answer: 42')
check('prompt: empty template falls back', renderPrompt('   ', 'raw') === 'raw')
check('prompt: no placeholder appends', renderPrompt('Summarise:', 'text') === 'Summarise:\n\ntext')

{
  const store = useGraphStore.getState()
  store.replaceGraph(
    [n('a', 'start', { input: 'x' }), n('b', 'llm', { model: 'm', systemPrompt: '', promptTemplate: '' })],
    [],
  )
  useGraphStore.getState().updateNodeData('b', { model: 'new-model' })
  const after = useGraphStore.getState().nodes
  const llm = after.find((node) => node.id === 'b') as { data: { model: string } }
  const start = after.find((node) => node.id === 'a') as { data: { input: string } }
  check('store: patch applies', llm.data.model === 'new-model', llm.data)
  check('store: sibling untouched', start.data.input === 'x', start.data)
}

{
  useGraphStore.getState().replaceGraph(
    [n('a', 'start', { input: 'hello' }), n('b', 'llm', { model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', systemPrompt: '', promptTemplate: '{{input}}' }), n('c', 'end', { output: '' })],
    [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
    ] as never,
  )
  const startNode = useGraphStore.getState().nodes[0] as { data: { status?: string } }
  check('store: node starts idle', startNode.data.status === undefined || startNode.data.status === 'idle')
  await runWorkflow()
  const exec = useExecutionStore.getState()
  check('run: fails without WebGPU', exec.status === 'error', exec.error)
  check('run: start node completed before LLM', exec.steps.some((s) => s.label === 'Start' && s.state === 'done'), exec.steps)
  check('run: llm step marked error', exec.steps.some((s) => s.label === 'LLM' && s.state === 'error'), exec.steps)
}

{
  useGraphStore.getState().replaceGraph(
    [n('a', 'llm', { model: 'm', systemPrompt: '', promptTemplate: '' }), n('b', 'llm', { model: 'm', systemPrompt: '', promptTemplate: '' })],
    [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'a' },
    ] as never,
  )
  await runWorkflow()
  const exec = useExecutionStore.getState()
  check('run: cycle surfaces error', exec.status === 'error' && /cycle/i.test(exec.error ?? ''), exec.error)
}

{
  useGraphStore.getState().replaceGraph(
    [n('a', 'start', { input: 'Explique les modèles — 日本語 — Ω≈ç√' })],
    [],
  )
  const encoded = encodePayload(currentPayload())
  const decoded = decodePayload(encoded)
  const roundTripped = decoded?.nodes[0]?.data as { input: string } | undefined
  check(
    'export: unicode survives base64',
    roundTripped?.input === 'Explique les modèles — 日本語 — Ω≈ç√',
    roundTripped,
  )
  check('export: base64 is plain text safe', /^[A-Za-z0-9+/=]+$/.test(encoded))
}

{
  useGraphStore.getState().updateNodeData('a', {
    status: 'done',
    progress: 0.5,
    progressText: 'loading',
    error: 'boom',
  })
  const payload = currentPayload()
  const data = payload.nodes[0].data as Record<string, unknown>
  check('export: strips transient keys', !('status' in data) && !('progress' in data) && !('error' in data), data)
}

{
  const payload = currentPayload()
  const previous = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => (id === PAYLOAD_ID ? { textContent: encodePayload(payload) } : null),
  }
  const hydrated = hydrateFromInjectedState()
  const restored = useGraphStore.getState().nodes
  ;(globalThis as { document?: unknown }).document = previous
  check('export: hydration returns true', hydrated)
  check('export: graph restored', restored.length === 1 && (restored[0].data as { input: string }).input === payload.nodes[0].data.input, restored)
}

{
  const previous = (globalThis as { document?: unknown }).document
  ;(globalThis as { document?: unknown }).document = {
    getElementById: () => ({ textContent: 'not-base64-json' }),
  }
  const hydrated = hydrateFromInjectedState()
  ;(globalThis as { document?: unknown }).document = previous
  check('export: corrupt payload ignored', hydrated === false)
}

{
  const html = '<!doctype html><html><head><title>t</title></head><body><script type="module">x</script></body></html>'
  const once = injectPayload(html, 'QUJD')
  const twice = injectPayload(once, 'REVG')
  const payloadAt = once.indexOf(`id="${PAYLOAD_ID}"`)
  const headAt = once.indexOf('<head>')
  const scriptAt = once.indexOf('<script type="module">')
  check('inject: tag inside head', payloadAt > headAt && payloadAt < once.indexOf('</head>'), { payloadAt, headAt })
  check('inject: tag precedes app script', payloadAt < scriptAt, { payloadAt, scriptAt })
  check('inject: idempotent', (twice.match(new RegExp(PAYLOAD_ID, 'g')) ?? []).length === 1)
  check('inject: latest payload wins', twice.includes('REVG') && !twice.includes('QUJD'))
}

{
  const artifact = 'dist/index.html'
  if (!existsSync(artifact)) {
    console.log('SKIP export:artifact (run "npm run build" first)')
  } else {
    const built = readFileSync(artifact, 'utf8')
    check('artifact: no external scripts', !/<script\b[^>]*\ssrc=/.test(built))
    check('artifact: no external stylesheets', !/<link\b[^>]*rel="stylesheet"/.test(built))
    check('artifact: single module script', (built.match(/<script type="module"/g) ?? []).length === 1)
    check('artifact: no worker construction', !/new Worker\(/.test(built))
    check('artifact: no dynamic imports', !/\bimport\(/.test(built))

    useGraphStore.getState().replaceGraph(
      [
        n('s', 'start', { input: 'offline?' }),
        n('l', 'llm', { model: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', systemPrompt: 'be terse', promptTemplate: 'Q: {{input}}' }),
        n('e', 'end', { output: '' }),
      ],
      [
        { id: '1', source: 's', target: 'l' },
        { id: '2', source: 'l', target: 'e' },
      ] as never,
    )
    const exported = injectPayload(built, encodePayload(currentPayload()))
    check('artifact: export grows the file', exported.length > built.length)
    check('artifact: export stays single-file', !/<script\b[^>]*\ssrc=/.test(exported) && (exported.match(/<script type="module"/g) ?? []).length === 1)

    const embedded = /<script id="localnodeai-workflow" type="application\/json">([A-Za-z0-9+/=]+)<\/script>/.exec(exported)
    check('artifact: payload tag present in built file', embedded !== null)
    if (embedded) {
      const decoded = decodePayload(embedded[1])
      const tagPos = exported.indexOf('localnodeai-workflow')
      const scriptPos = exported.indexOf('<script type="module"')
      const llmConfig = decoded?.nodes[1]?.data as { model: string } | undefined
      check('artifact: payload precedes app script', tagPos < scriptPos, { tagPos, scriptPos })
      check('artifact: payload holds 3 nodes', decoded?.nodes.length === 3, decoded?.nodes.length)
      check('artifact: payload holds 2 edges', decoded?.edges.length === 2, decoded?.edges.length)
      check(
        'artifact: payload keeps llm config',
        llmConfig?.model === 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
        llmConfig,
      )

      const previous = (globalThis as { document?: unknown }).document
      ;(globalThis as { document?: unknown }).document = {
        getElementById: (id: string) => (id === PAYLOAD_ID ? { textContent: embedded[1] } : null),
      }
      const hydrated = hydrateFromInjectedState()
      ;(globalThis as { document?: unknown }).document = previous
      const store = useGraphStore.getState()
      check('artifact: exported file restores 3 nodes', hydrated && store.nodes.length === 3, store.nodes.length)
      check('artifact: exported file restores 2 edges', store.edges.length === 2, store.edges.length)
      const restoredOrder = topologicalOrder(store.nodes, store.edges).map((x) => x.id).join(',')
      check('artifact: restored graph is runnable', restoredOrder === 's,l,e', restoredOrder)
    }
  }
}

{
  useGraphStore.getState().replaceGraph([], [])
  check('validate: empty canvas rejected', validateGraph([]).length === 1)

  useGraphStore.getState().replaceGraph([n('l', 'llm', { model: '', systemPrompt: '', promptTemplate: '' })], [])
  check(
    'validate: missing start flagged',
    validateGraph(useGraphStore.getState().nodes, useGraphStore.getState().edges).some((p) =>
      /No Start node/.test(p),
    ),
  )

  useGraphStore.getState().replaceGraph(
    [n('s', 'start', { input: 'hi' }), n('l', 'llm', { model: '', systemPrompt: '', promptTemplate: '' })],
    [],
  )
  const problems = validateGraph(useGraphStore.getState().nodes, useGraphStore.getState().edges)
  check('validate: missing model flagged', problems.some((p) => /no model selected/.test(p)), problems)
  check('validate: start node is not flagged', !problems.some((p) => /No Start node/.test(p)), problems)

  useGraphStore.getState().replaceGraph(
    [n('a', 'llm', { model: 'm' }), n('b', 'llm', { model: 'm' })],
    [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'a' },
    ] as never,
  )
  check(
    'validate: cycle reported before semantic problems',
    validateGraph(useGraphStore.getState().nodes, useGraphStore.getState().edges)[0].includes('cycle'),
    validateGraph(useGraphStore.getState().nodes, useGraphStore.getState().edges),
  )
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'hello' }),
      n('l', 'llm', { model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', systemPrompt: '', promptTemplate: '{{input}}' }),
      n('e', 'end', { output: 'stale' }),
    ],
    [
      { id: '1', source: 's', target: 'l' },
      { id: '2', source: 'l', target: 'e' },
    ] as never,
  )
  useGraphStore.getState().updateNodeData('s', { status: 'error', error: 'old failure' })

  await runWorkflow()

  const nodes = useGraphStore.getState().nodes
  const start = nodes.find((node) => node.id === 's')?.data as Record<string, unknown>
  const llm = nodes.find((node) => node.id === 'l')?.data as Record<string, unknown>
  const end = nodes.find((node) => node.id === 'e')?.data as Record<string, unknown>

  check('run: stale node error cleared', start.error === undefined, start)
  check('run: start marked done', start.status === 'done', start)
  check('run: failing llm node marked error', llm.status === 'error' && typeof llm.error === 'string', llm)
  check('run: downstream end node untouched by the failure', end.status === undefined && end.output === 'stale', end)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'hello' }),
      n('l', 'llm', { model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', systemPrompt: '', promptTemplate: '{{input}}' }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'l' },
      { id: '2', source: 'l', target: 'e' },
    ] as never,
  )
  const running = runWorkflow()
  useExecutionStore.getState().requestCancel()
  await running

  const exec = useExecutionStore.getState()
  check('cancel: status is cancelled or error', exec.status === 'cancelled' || exec.status === 'error', exec.status)
  const end = useGraphStore.getState().nodes.find((node) => node.id === 'e')?.data as Record<string, unknown>
  check('cancel: end node never marked done', end.status !== 'done', end)
}

{
  useGraphStore.getState().replaceGraph(
    [n('l', 'llm', { model: 'm', systemPrompt: 's', promptTemplate: 'p', output: 'kept', status: 'done', progress: 1, error: 'x' })],
    [],
  )
  useGraphStore.getState().clearNodeRuntime()
  const data = useGraphStore.getState().nodes[0].data as Record<string, unknown>
  check('clear: runtime keys removed', !('status' in data) && !('progress' in data) && !('error' in data), data)
  check('clear: output preserved', data.output === 'kept' && data.model === 'm', data)
}

{
  useGraphStore.getState().replaceGraph(
    [n('s', 'start', { input: '' }), n('e', 'end', { output: '' })],
    [{ id: '1', source: 's', target: 'e' }] as never,
  )
  useGraphStore.getState().removeNode('s')
  const { nodes, edges } = useGraphStore.getState()
  check('remove: node gone', nodes.length === 1 && nodes[0].id === 'e', nodes.length)
  check('remove: dangling edge gone', edges.length === 0, edges)
}

{
  useGraphStore.getState().closeContextMenu()
  check('menu: closed initially', useGraphStore.getState().contextMenu.isOpen === false)

  useGraphStore.getState().openContextMenu(120, 240, 'llm-1')
  const open = useGraphStore.getState().contextMenu
  check('menu: opens with cursor position', open.isOpen && open.x === 120 && open.y === 240 && open.nodeId === 'llm-1', open)

  useGraphStore.getState().openContextMenu(10, 10, 'end-1')
  check('menu: reopens at the new target', useGraphStore.getState().contextMenu.nodeId === 'end-1')

  useGraphStore.getState().closeContextMenu()
  const closed = useGraphStore.getState().contextMenu
  check('menu: close clears the target', closed.isOpen === false && closed.nodeId === null, closed)

  useGraphStore.getState().replaceGraph([n('s', 'start', { input: '' })], [])
  useGraphStore.getState().openContextMenu(50, 50, 's')
  useGraphStore.getState().removeNode('s')
  check('menu: survives deletion without throwing', useGraphStore.getState().nodes.length === 0)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('llm-1', 'llm', {
        model: 'm-1',
        systemPrompt: 'be brief',
        promptTemplate: 'Q: {{input}}',
        output: 'cached output',
      }),
    ],
    [],
  )

  const copyId = useGraphStore.getState().duplicateNode('llm-1')
  const nodes = useGraphStore.getState().nodes

  check('duplicate: returns a new id', copyId !== null && copyId !== 'llm-1', copyId)
  check('duplicate: node count grew by one', nodes.length === 2, nodes.length)

  const original = nodes.find((node) => node.id === 'llm-1') as LocalNode
  const copy = nodes.find((node) => node.id === copyId) as LocalNode

  check('duplicate: same type', copy.type === original.type)
  check('duplicate: offset by +20/+20', copy.position.x === original.position.x + 20 && copy.position.y === original.position.y + 20, { original: original.position, copy: copy.position })
  check('duplicate: data copied verbatim', JSON.stringify(copy.data) === JSON.stringify(original.data), copy.data)
  check('duplicate: data is a deep clone', copy.data !== original.data)
  check('duplicate: copy is not selected', copy.selected === false)
  check('duplicate: original untouched', original.position.x === 0 && original.position.y === 0)
  check('duplicate: edges are not copied', useGraphStore.getState().edges.length === 0)

  useGraphStore.getState().updateNodeData(copyId as string, { systemPrompt: 'changed' })
  const after = useGraphStore.getState().nodes
  const copyData = after.find((node) => node.id === copyId)?.data as { systemPrompt: string } | undefined
  const originalData = after.find((node) => node.id === 'llm-1')?.data as { systemPrompt: string } | undefined
  check(
    'duplicate: edits do not leak to the original',
    copyData?.systemPrompt === 'changed' && originalData?.systemPrompt === 'be brief',
    { copy: copyData?.systemPrompt, original: originalData?.systemPrompt },
  )

  check('duplicate: unknown id returns null', useGraphStore.getState().duplicateNode('nope') === null)
  check('duplicate: failure does not add a node', useGraphStore.getState().nodes.length === 2)

  const custom = useGraphStore.getState().duplicateNode('llm-1', { x: 100, y: 0 })
  const offsetCopy = useGraphStore.getState().nodes.find((node) => node.id === custom) as LocalNode
  check('duplicate: honours a custom offset', offsetCopy.position.x === 100 && offsetCopy.position.y === 0, offsetCopy.position)

  const ids = useGraphStore.getState().nodes.map((node) => node.id)
  check('duplicate: all ids unique', new Set(ids).size === ids.length, ids)
}

{
  useGraphStore.getState().replaceGraph(
    [n('a', 'start', { input: '' }), n('b', 'llm', { model: 'm' }), n('c', 'end', { output: '' }), n('d', 'end', { output: '' })],
    [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
      { id: '3', source: 'b', target: 'd' },
    ] as never,
  )

  useGraphStore.getState().disconnectNode('b')
  const after = useGraphStore.getState()
  check('disconnect: removes incoming and outgoing edges', after.edges.length === 0, after.edges)
  check('disconnect: keeps every node', after.nodes.length === 4, after.nodes.length)

  useGraphStore.getState().replaceGraph(
    [n('a', 'start', { input: '' }), n('b', 'llm', { model: 'm' }), n('c', 'end', { output: '' })],
    [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
    ] as never,
  )
  useGraphStore.getState().disconnectNode('c')
  check('disconnect: leaves other edges alone', useGraphStore.getState().edges.length === 1, useGraphStore.getState().edges)
  useGraphStore.getState().disconnectNode('missing')
  check('disconnect: unknown id is a no-op', useGraphStore.getState().edges.length === 1)
}

{
  useGraphStore.getState().replaceGraph(
    [n('a', 'start', { input: '' }), n('b', 'llm', { model: 'm' }), n('c', 'end', { output: '' })],
    [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
    ] as never,
  )
  useGraphStore.getState().removeNode('b')
  const after = useGraphStore.getState()
  check('delete: node removed', after.nodes.length === 2 && !after.nodes.some((node) => node.id === 'b'))
  check('delete: both edges removed', after.edges.length === 0, after.edges)
}

{
  useToastStore.getState().clear()
  check('toast: starts hidden', useToastStore.getState().message === null)
  useToastStore.getState().show('Copied!')
  check('toast: shows a message', useToastStore.getState().message === 'Copied!')
  useToastStore.getState().clear()
  check('toast: clears', useToastStore.getState().message === null)
}

{
  const withGlobal = (key: string, value: unknown) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true })
    return () => {
      if (previous) Object.defineProperty(globalThis, key, previous)
      else delete (globalThis as Record<string, unknown>)[key]
    }
  }

  let restore = withGlobal('navigator', {})
  try {
    check('clipboard: returns false with no APIs', (await copyToClipboard('x')) === false)
  } finally {
    restore()
  }

  const written: string[] = []
  restore = withGlobal('navigator', {
    clipboard: {
      writeText: async (value: string) => {
        written.push(value)
      },
    },
  })
  try {
    check('clipboard: uses navigator.clipboard when present', (await copyToClipboard('node-42')) === true)
    check('clipboard: wrote the given text', written.join(',') === 'node-42', written)
  } finally {
    restore()
  }

  restore = withGlobal('navigator', {
    clipboard: {
      writeText: async () => {
        throw new Error('denied')
      },
    },
  })
  try {
    check('clipboard: rejected write does not throw', (await copyToClipboard('x')) === false)
  } finally {
    restore()
  }
}

{
  cacheClear()
  check('cache: starts empty', cacheCount() === 0)
  check('cache: miss returns undefined', cacheGet('k') === undefined)

  cacheSet('k', ['llm-1'], ['answer'])
  check('cache: stores and reads back', cacheGet('k')?.values[0] === 'answer')
  check('cache: different key is a miss', cacheGet('k2') === undefined)
  check('cache: count reflects the entry', cacheCount() === 1)

  cacheSet('big', ['llm-1'], ['x'.repeat(50_000)])
  check('cache: values are truncated to the cap', (cacheGet('big')?.values[0]?.length ?? 0) <= 24_000, cacheGet('big')?.values[0]?.length)

  for (let i = 0; i < 60; i += 1) cacheSet(`flood-${i}`, ['n'], [String(i)])
  check('cache: size stays bounded', cacheCount() <= 40, cacheCount())
  check('cache: newest entry survives eviction', cacheGet('flood-59') !== undefined)

  cacheClear()
  check('cache: clear empties it', cacheCount() === 0 && cacheGet('k') === undefined)
}

{
  cacheClear()
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'What is a transformer?' }),
      n('c', 'cache', { keyTemplate: '{{input}}', enabled: true, nodeFingerprint: true }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'c' },
      { id: '2', source: 'c', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  let exec = useExecutionStore.getState()
  let nodes = useGraphStore.getState().nodes
  let end = nodes.find((node) => node.id === 'e')?.data as Record<string, unknown>
  let cache = nodes.find((node) => node.id === 'c')?.data as Record<string, unknown>

  check('cache: run completes', exec.status === 'done', exec.error)
  check('cache: first run is a miss', cache.hit === false, cache)
  check('cache: pass-through output captured', end.output === 'What is a transformer?', end)
  check('cache: entry stored after the run', cacheGet('What is a transformer?\u0000e:end') !== undefined, 'no entry')

  useGraphStore.getState().updateNodeData('e', { output: 'SHOULD BE REPLACED' })
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'What is a transformer?' }),
      n('c', 'cache', { keyTemplate: '{{input}}', enabled: true, nodeFingerprint: true }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'c' },
      { id: '2', source: 'c', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  exec = useExecutionStore.getState()
  nodes = useGraphStore.getState().nodes
  end = nodes.find((node) => node.id === 'e')?.data as Record<string, unknown>
  cache = nodes.find((node) => node.id === 'c')?.data as Record<string, unknown>

  check('cache: second run completes', exec.status === 'done', exec.error)
  check('cache: second run is a hit', cache.hit === true, cache)
  check('cache: downstream output restored', end.output === 'What is a transformer?', end)
  check(
    'cache: downstream node reported as served from cache',
    exec.steps.some((step) => step.nodeId === 'e' && step.detail === 'served from cache'),
    exec.steps,
  )

  useGraphStore.getState().updateNodeData('s', { input: 'Something else entirely' })
  await runWorkflow()
  cache = useGraphStore.getState().nodes.find((node) => node.id === 'c')?.data as Record<string, unknown>
  check('cache: changed input misses', cache.hit === false, cache)
}

{
  cacheClear()
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'same prompt' }),
      n('c', 'cache', { keyTemplate: '{{input}}', enabled: true, nodeFingerprint: true }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'c' },
      { id: '2', source: 'c', target: 'e' },
    ] as never,
  )
  await runWorkflow()
  const withFingerprint = cacheCount()

  useGraphStore.getState().updateNodeData('c', { nodeFingerprint: false })
  await runWorkflow()
  check('cache: fingerprint creates a separate entry', cacheCount() === withFingerprint + 1, { withFingerprint, now: cacheCount() })
}

{
  cacheClear()
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'passthrough' }),
      n('c', 'cache', { keyTemplate: '{{input}}', enabled: false }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'c' },
      { id: '2', source: 'c', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const nodes = useGraphStore.getState().nodes
  const end = nodes.find((node) => node.id === 'e')?.data as Record<string, unknown>
  const cache = nodes.find((node) => node.id === 'c')?.data as Record<string, unknown>

  check('cache: disabled still forwards input', end.output === 'passthrough', end)
  check('cache: disabled stores nothing', cacheCount() === 0, cacheCount())
  check('cache: disabled reports no hit/miss', cache.hit === undefined, cache)
}

{
  cacheClear()
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'boom' }),
      n('c', 'cache', { keyTemplate: '{{input}}', enabled: true }),
      n('l', 'llm', { model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', systemPrompt: '', promptTemplate: '{{input}}' }),
    ],
    [
      { id: '1', source: 's', target: 'c' },
      { id: '2', source: 'c', target: 'l' },
    ] as never,
  )

  await runWorkflow()
  check('cache: failed run stored nothing', cacheCount() === 0, cacheCount())
  check('cache: failed run reports an error', useExecutionStore.getState().status === 'error')
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'hi' }),
      n('c', 'cache', { keyTemplate: 'custom {{input}}', enabled: true, nodeFingerprint: true, hit: true, status: 'done' }),
    ],
    [],
  )
  const payload = currentPayload()
  const data = payload.nodes[1].data as Record<string, unknown>
  check('export: cache key survives', data.keyTemplate === 'custom {{input}}', data)
  check('export: cache flags survive', data.enabled === true && data.nodeFingerprint === true, data)
  check('export: cache hit flag is not persisted', !('hit' in data), data)

  const restored = decodePayload(encodePayload(payload))
  const restoredData = restored?.nodes[1]?.data as Record<string, unknown> | undefined
  check('export: cache node round-trips', restoredData?.keyTemplate === 'custom {{input}}', restoredData)
}

{
  const run = (op: TextOpKind, options: Record<string, string>, input: string) =>
    applyTextOp(op, options, input)

  check('text: template substitutes', run('template', { template: 'Q: {{input}}' }, 'hi').value === 'Q: hi')
  check('text: template appends when no placeholder', run('template', { template: 'Answer:' }, 'x').value === 'Answer:\n\nx')
  check('text: template default falls back to input', run('template', {}, 'raw').value === 'raw')

  check('text: replace substitutes globally', run('replace', { pattern: 'a', replacement: 'b', flags: 'g' }, 'aaa').value === 'bbb')
  check('text: replace honours the case-insensitive flag', run('replace', { pattern: 'a', replacement: 'b', flags: 'gi' }, 'aA').value === 'bb')
  check('text: replace with an empty pattern is a no-op', run('replace', { pattern: '', replacement: 'b', flags: 'g' }, 'abc').value === 'abc')
  check('text: replace supports capture groups', run('replace', { pattern: '(\\d+)', replacement: '#$1', flags: 'g' }, 'a1b22').value === 'a#1b#22')

  check('text: extract returns the whole match by default', run('extract', { pattern: '\\d+', group: '0', flags: '' }, 'ab123cd').value === '123')
  check('text: extract returns a capture group', run('extract', { pattern: '(\\d)(\\d)', group: '2', flags: '' }, 'x42').value === '2')
  check('text: extract with no match is empty', run('extract', { pattern: 'zzz', group: '0', flags: '' }, 'abc').value === '')
  check('text: extract with an invalid regex reports an error', run('extract', { pattern: '([', group: '0', flags: '' }, 'abc').error !== undefined)

  const json = '{"choices":[{"message":{"content":"hello world"}}],"n":2,"ok":true}'
  check('text: json path reads a nested field', run('jsonPath', { path: 'choices.0.message.content' }, json).value === 'hello world')
  check('text: json path supports bracket syntax', run('jsonPath', { path: 'choices[0].message.content' }, json).value === 'hello world')
  check('text: json path stringifies non-strings', run('jsonPath', { path: 'n' }, json).value === '2')
  check('text: json path on a missing field is empty', run('jsonPath', { path: 'a.b.c' }, json).value === '')
  check('text: json path on invalid json reports an error', run('jsonPath', { path: 'a' }, 'not json').error !== undefined)

  check('text: split takes a part', run('split', { delimiter: ',', index: '1' }, 'a,b,c').value === 'b')
  check('text: split honours escaped newline delimiters', run('split', { delimiter: '\\n', index: '1' }, 'a\nb').value === 'b')
  check('text: split with an out-of-range index is empty', run('split', { delimiter: ',', index: '9' }, 'a,b').value === '')
  check('text: split with an empty delimiter is a no-op', run('split', { delimiter: '', index: '0' }, 'a,b').value === 'a,b')

  check('text: slice cuts a window', run('slice', { start: '2', length: '3' }, 'abcdef').value === 'cde')
  check('text: slice without length runs to the end', run('slice', { start: '3', length: '' }, 'abcdef').value === 'def')
  check('text: slice with a blank start defaults to zero', run('slice', { start: '', length: '2' }, 'abcdef').value === 'ab')

  check('text: case lower', run('case', { caseMode: 'lower' }, 'HeLLo').value === 'hello')
  check('text: case upper', run('case', { caseMode: 'upper' }, 'HeLLo').value === 'HELLO')
  check('text: case title', run('case', { caseMode: 'title' }, 'hello wide world').value === 'Hello Wide World')
  check('text: case sentence', run('case', { caseMode: 'sentence' }, 'hello there. how are you?').value === 'Hello there. How are you?')
  check('text: case defaults to lower', run('case', {}, 'HeLLo').value === 'hello')

  check('text: trim collapses inner whitespace', run('trim', {}, '  a \n\n b  ').value === 'a b')
  check(
    'text: every op handles an empty input without throwing',
    TEXT_OPS.every((spec) => {
      try {
        return typeof run(spec.kind, {}, '').value === 'string'
      } catch {
        return false
      }
    }),
  )
}

{
  check('path: empty path returns empty', getByPath({ a: 1 }, '') === '')
  check('path: walking into a primitive returns empty', getByPath({ a: 1 }, 'a.b') === '')
  check('path: object values are re-serialised', getByPath({ a: { b: 1 } }, 'a') === '{"b":1}')
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'alpha\nbeta\ngamma' }),
      n('t', 'transform', { op: 'split', options: { delimiter: '\\n', index: '1' } }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 't' },
      { id: '2', source: 't', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  let exec = useExecutionStore.getState()
  let nodes = useGraphStore.getState().nodes

  const endData = nodes.find((node) => node.id === 'e')?.data as { output?: string } | undefined
  const transformData = nodes.find((node) => node.id === 't')?.data as { output?: string; status?: string } | undefined

  check('transform: run succeeds', exec.status === 'done', exec.error)
  check('transform: value flows to the end node', endData?.output === 'beta', endData)
  check('transform: output stored on the node', transformData?.output === 'beta', transformData)
  check('transform: node marked done', transformData?.status === 'done', transformData)
  check(
    'transform: run log names the operation',
    exec.steps.some((step) => step.label === 'Transform' && /split/.test(step.detail)),
    exec.steps,
  )
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'text' }),
      n('t', 'transform', { op: 'extract', options: { pattern: '([', group: '0', flags: '' } }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 't' },
      { id: '2', source: 't', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const exec = useExecutionStore.getState()
  const nodes = useGraphStore.getState().nodes

  const failedData = nodes.find((node) => node.id === 't')?.data as { error?: string } | undefined
  const skippedData = nodes.find((node) => node.id === 'e')?.data as { status?: string } | undefined

  check('transform: invalid regex fails the run', exec.status === 'error', exec.status)
  check('transform: failure names the node', /Transform node/.test(exec.error ?? ''), exec.error)
  check(
    'transform: node shows the error',
    /Invalid regular expression/.test(failedData?.error ?? ''),
    failedData,
  )
  check('transform: downstream node not run', skippedData?.status === undefined, skippedData)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'x' }),
      n('t', 'transform', { op: 'jsonPath', options: { path: 'a.b' }, output: 'stale' }),
    ],
    [],
  )
  const payload = currentPayload()
  const data = payload.nodes[1].data as Record<string, unknown>
  check('export: transform op survives', data.op === 'jsonPath', data)
  check('export: transform options survive', (data.options as { path: string }).path === 'a.b', data.options)

  const restored = decodePayload(encodePayload(payload))
  const restoredData = restored?.nodes[1]?.data as Record<string, unknown> | undefined
  check('export: transform round-trips', restoredData?.op === 'jsonPath', restoredData)

  useGraphStore.getState().replaceGraph([n('t', 'transform', {})], [])
  const repaired = currentPayload().nodes[0].data as Record<string, unknown>
  check('export: missing op is repaired', repaired.op === 'template', repaired)
  check('export: missing options are defaulted', (repaired.options as { template: string }).template === '{{input}}', repaired.options)
}

{
  const test = (kind: BranchConditionKind, options: Record<string, string>, input: string) =>
    evaluateCondition(kind, options, input).value

  check('branch: always matches', test('always', {}, '') === true)
  check('branch: contains', test('contains', { needle: 'cat' }, 'concatenate') === true)
  check('branch: not contains', test('notContains', { needle: 'cat' }, 'dog') === true)
  check('branch: equals is exact', test('equals', { needle: 'yes' }, 'yes') === true && test('equals', { needle: 'yes' }, 'YES ') === false)
  check('branch: not equals', test('notEquals', { needle: 'no' }, 'yes') === true)
  check('branch: starts with', test('startsWith', { needle: 'ab' }, 'abc') === true)
  check('branch: ends with', test('endsWith', { needle: 'bc' }, 'abc') === true)
  check('branch: matches regex', test('matches', { needle: '^\\d+$' }, '123') === true)
  check('branch: regex mismatch', test('matches', { needle: '^\\d+$' }, '12a') === false)
  check('branch: empty regex never matches', test('matches', { needle: '' }, 'anything') === false)
  check('branch: invalid regex reports an error', evaluateCondition('matches', { needle: '([' }, 'x').error !== undefined)
  check('branch: is empty', test('isEmpty', {}, '') === true && test('isEmpty', {}, ' ') === false)
  check('branch: is not empty', test('notEmpty', {}, 'x') === true)
  check('branch: number greater', test('numberGreater', { value: '5' }, '7') === true)
  check('branch: number greater rejects non-numeric input', test('numberGreater', { value: '5' }, 'abc') === false)
  check('branch: number less', test('numberLess', { value: '5' }, '2') === true)
  check('branch: length greater', test('lengthGreater', { value: '2' }, 'abc') === true)
  check('branch: length less', test('lengthLess', { value: '2' }, 'a') === true)
  check(
    'branch: every condition handles empty input',
    BRANCH_CONDITIONS.every((spec) => {
      try {
        return typeof evaluateCondition(spec.kind, {}, '').value === 'boolean'
      } catch {
        return false
      }
    }),
  )
  check(
    'branch: every condition has a unique kind',
    new Set(BRANCH_CONDITIONS.map((spec) => spec.kind)).size === BRANCH_CONDITIONS.length,
  )
}

{
  const graph = (condition: BranchConditionKind, options: Record<string, string>, input: string) => {
    useGraphStore.getState().replaceGraph(
      [
        n('s', 'start', { input }),
        n('b', 'branch', { condition, options }),
        n('yes', 'transform', { op: 'trim', options: {} }),
        n('no', 'transform', { op: 'case', options: { caseMode: 'upper' } }),
        n('e', 'end', { output: '' }),
      ],
      [
        { id: '1', source: 's', target: 'b' },
        { id: '2', source: 'b', sourceHandle: 'if', target: 'yes' },
        { id: '3', source: 'b', sourceHandle: 'else', target: 'no' },
        { id: '4', source: 'yes', target: 'e' },
        { id: '5', source: 'no', target: 'e' },
      ] as never,
    )
  }

  const dataOf = (id: string) =>
    useGraphStore.getState().nodes.find((node) => node.id === id)?.data as Record<string, unknown>

  graph('contains', { needle: 'cat' }, 'concatenate')
  await runWorkflow()
  let exec = useExecutionStore.getState()

  check('branch: matched run succeeds', exec.status === 'done', exec.error)
  check('branch: matched path ran', dataOf('yes').output === 'concatenate', dataOf('yes'))
  check('branch: untaken path skipped', dataOf('no').output === '', dataOf('no'))
  check('branch: shared tail still runs', dataOf('e').output === 'concatenate', dataOf('e'))
  check('branch: decision recorded', dataOf('b').matched === true, dataOf('b'))
  check(
    'branch: skip is logged',
    exec.steps.some((step) => step.nodeId === 'no' && step.state === 'skipped' && step.detail === 'branch not taken'),
    exec.steps,
  )
  check(
    'branch: log states which side ran',
    exec.steps.some((step) => step.nodeId === 'b' && /matched$/.test(step.detail)),
    exec.steps,
  )

  graph('contains', { needle: 'cat' }, 'dog')
  await runWorkflow()
  exec = useExecutionStore.getState()

  check('branch: unmatched run succeeds', exec.status === 'done', exec.error)
  check('branch: other path ran', dataOf('no').output === 'DOG', dataOf('no'))
  check('branch: matched path now skipped', dataOf('yes').output === '', dataOf('yes'))
  check('branch: shared tail got the other path', dataOf('e').output === 'DOG', dataOf('e'))
  check('branch: decision flipped', dataOf('b').matched === false, dataOf('b'))
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'yes please' }),
      n('b', 'branch', { condition: 'contains', options: { needle: 'yes' } }),
      n('a', 'transform', { op: 'trim', options: {} }),
      n('z', 'transform', { op: 'trim', options: {} }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'b' },
      { id: '2', source: 'b', sourceHandle: 'if', target: 'a' },
      { id: '3', source: 'b', sourceHandle: 'else', target: 'z' },
      { id: '4', source: 'a', target: 'e' },
      { id: '5', source: 'z', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const first = useGraphStore.getState().nodes.find((node) => node.id === 'a')?.data as { output?: string }
  check('branch: first run produced output', first?.output === 'yes please', first)

  useGraphStore.getState().updateNodeData('s', { input: 'nope' })
  await runWorkflow()
  const after = useGraphStore.getState().nodes.find((node) => node.id === 'a')?.data as { output?: string }
  check('branch: skipped node output is cleared', after?.output === '', after)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'x' }),
      n('b', 'branch', { condition: 'matches', options: { needle: '([' } }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'b' },
      { id: '2', source: 'b', sourceHandle: 'if', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const exec = useExecutionStore.getState()
  check('branch: invalid regex fails the run', exec.status === 'error', exec.status)
  check('branch: failure names the node', /Branch node/.test(exec.error ?? ''), exec.error)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'x' }),
      n('b', 'branch', { condition: 'always', options: {} }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'b' },
      { id: '2', source: 'b', sourceHandle: 'else', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const exec = useExecutionStore.getState()
  const end = useGraphStore.getState().nodes.find((node) => node.id === 'e')?.data as Record<string, unknown>
  check('branch: unmatched with no connected path does not throw', exec.status === 'done', exec.error)
  check('branch: nothing downstream ran', end.status === undefined, end)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'x' }),
      n('b', 'branch', { condition: 'numberGreater', options: { value: '5' }, matched: true }),
    ],
    [],
  )
  const payload = currentPayload()
  const data = payload.nodes[1].data as Record<string, unknown>
  check('export: branch condition survives', data.condition === 'numberGreater', data)
  check('export: branch options survive', (data.options as { value: string }).value === '5', data.options)
  check('export: branch decision is not persisted', !('matched' in data), data)

  useGraphStore.getState().replaceGraph([n('b', 'branch', {})], [])
  const repaired = currentPayload().nodes[0].data as Record<string, unknown>
  check('export: missing condition is repaired', repaired.condition === 'always', repaired)

  const decoded = decodePayload(encodePayload(payload))
  const decodedData = decoded?.nodes[1]?.data as { condition?: string } | undefined
  check('export: branch round-trips', decodedData?.condition === 'numberGreater', decodedData)
}

{
  cacheClear()
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'yes' }),
      n('b', 'branch', { condition: 'contains', options: { needle: 'yes' } }),
      n('c', 'cache', { keyTemplate: '{{input}}', enabled: true }),
      n('hit', 'transform', { op: 'trim', options: {} }),
      n('miss', 'transform', { op: 'case', options: { caseMode: 'upper' } }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'b' },
      { id: '2', source: 'b', sourceHandle: 'if', target: 'c' },
      { id: '3', source: 'b', sourceHandle: 'else', target: 'miss' },
      { id: '4', source: 'c', target: 'hit' },
      { id: '5', source: 'hit', target: 'e' },
      { id: '6', source: 'miss', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  check('branch+cache: run succeeds', useExecutionStore.getState().status === 'done', useExecutionStore.getState().error)

  check('branch+cache: exactly one entry stored', cacheKeys().length === 1, cacheKeys())
  const stored = cacheGet(cacheKeys()[0] ?? '')
  check('branch+cache: entry stored', stored !== undefined, 'no entry')
  check('branch+cache: skipped node excluded from the entry', stored?.nodes.length === 2, stored?.nodes)
  check('branch+cache: skipped node produced no value', !stored?.nodes.includes('miss'), stored?.nodes)
  check('branch+cache: taken node stored', stored?.values[0] === 'yes', stored?.values)

  await runWorkflow()
  const cacheData = useGraphStore.getState().nodes.find((node) => node.id === 'c')?.data as { hit?: boolean }
  check('branch+cache: repeat run hits', cacheData?.hit === true, cacheData)
}

{
  const parts = [
    { id: 'a', value: 'first' },
    { id: 'b', value: 'second' },
    { id: 'c', value: '' },
  ]
  const base = { ...DEFAULT_MERGE_OPTIONS }

  check('merge: joins with the default separator', mergeParts(parts, base).split('\n\n').length === 2)
  check('merge: custom separator', mergeParts(parts, { ...base, separator: ' | ' }).includes('first | second'))
  check('merge: escaped newline separator', mergeParts(parts, { ...base, separator: '\\n' }).split('\n').length === 2)
  check('merge: empty parts dropped by default', mergeParts(parts, base) === 'first\n\nsecond', mergeParts(parts, base))
  check('merge: empty parts kept when asked', mergeParts(parts, { ...base, skipEmpty: false }).endsWith('\n\n'))
  check('merge: labelling prefixes each part', mergeParts(parts, { ...base, labelWithSource: true }).startsWith('a: first'))
  check('merge: empty input yields empty string', mergeParts([], base) === '')

  check('merge: whitelist filters', mergeParts(parts, { ...base, sources: 'a\nb' }) === 'first\n\nsecond')
  check('merge: whitelist reorders', mergeParts(parts, { ...base, sources: 'b\na' }) === 'second\n\nfirst')
  check(
    'merge: unlisted inputs are appended, never dropped',
    mergeParts(parts, { ...base, sources: 'b' }) === 'second\n\nfirst',
  )
  check('merge: unknown ids in the whitelist are ignored', mergeParts(parts, { ...base, sources: 'zzz' }).includes('first'))
  check('merge: duplicate ids are not joined twice', mergeParts(parts, { ...base, sources: 'a\na\na' }).split('\n\n').length === 2)
  check('merge: whitespace-only values count as empty', mergeParts([{ id: 'x', value: '   ' }], base) === '')
  check('merge: source list trims blanks', parseSourceList('  a  \n\n b \n').join(',') === 'a,b')
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'question' }),
      n('t1', 'transform', { op: 'template', options: { template: 'A: {{input}}' } }),
      n('t2', 'transform', { op: 'template', options: { template: 'B: {{input}}' } }),
      n('m', 'merge', { ...DEFAULT_MERGE_OPTIONS }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 't1' },
      { id: '2', source: 's', target: 't2' },
      { id: '3', source: 't1', target: 'm' },
      { id: '4', source: 't2', target: 'm' },
      { id: '5', source: 'm', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  let exec = useExecutionStore.getState()
  let nodes = useGraphStore.getState().nodes
  let merged = nodes.find((node) => node.id === 'm')?.data as { output?: string }

  check('merge: run succeeds', exec.status === 'done', exec.error)
  check('merge: both inputs joined', merged?.output === 'A: question\n\nB: question', merged)
  const endData = nodes.find((node) => node.id === 'e')?.data as { output?: string } | undefined
  check('merge: downstream sees the merged value', endData?.output === 'A: question\n\nB: question', endData)
  check(
    'merge: run log counts the inputs',
    exec.steps.some((step) => step.nodeId === 'm' && /joined 2 inputs/.test(step.detail)),
    exec.steps,
  )

  const t1 = nodes.find((node) => node.id === 't1')?.data as { output?: string } | undefined
  const t2 = nodes.find((node) => node.id === 't2')?.data as { output?: string } | undefined
  check('merge: every upstream ran', t1?.output === 'A: question' && t2?.output === 'B: question', { t1, t2 })
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'x' }),
      n('t1', 'transform', { op: 'template', options: { template: 'one {{input}}' } }),
      n('t2', 'transform', { op: 'template', options: { template: 'two {{input}}' } }),
      n('m', 'merge', { ...DEFAULT_MERGE_OPTIONS, sources: 't2\nt1', labelWithSource: true }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 't1' },
      { id: '2', source: 's', target: 't2' },
      { id: '3', source: 't1', target: 'm' },
      { id: '4', source: 't2', target: 'm' },
      { id: '5', source: 'm', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const merged = useGraphStore.getState().nodes.find((node) => node.id === 'm')?.data as { output?: string }
  check('merge: whitelist drives order and labels', merged?.output === 't2: two x\n\nt1: one x', merged)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'go' }),
      n('b', 'branch', { condition: 'contains', options: { needle: 'go' } }),
      n('yes', 'transform', { op: 'template', options: { template: 'taken {{input}}' } }),
      n('no', 'transform', { op: 'template', options: { template: 'skipped {{input}}' } }),
      n('m', 'merge', { ...DEFAULT_MERGE_OPTIONS }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'b' },
      { id: '2', source: 'b', sourceHandle: 'if', target: 'yes' },
      { id: '3', source: 'b', sourceHandle: 'else', target: 'no' },
      { id: '4', source: 'yes', target: 'm' },
      { id: '5', source: 'no', target: 'm' },
      { id: '6', source: 'm', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const exec = useExecutionStore.getState()
  const merged = useGraphStore.getState().nodes.find((node) => node.id === 'm')?.data as { output?: string }
  check('merge: only the live branch is joined', merged?.output === 'taken go', merged)
  check('merge: run still succeeds', exec.status === 'done', exec.error)
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('s', 'start', { input: 'x' }),
      n('m', 'merge', { ...DEFAULT_MERGE_OPTIONS }),
      n('e', 'end', { output: '' }),
    ],
    [
      { id: '1', source: 's', target: 'e' },
    ] as never,
  )

  await runWorkflow()
  const exec = useExecutionStore.getState()
  const merged = useGraphStore.getState().nodes.find((node) => node.id === 'm')?.data as { output?: string }
  check('merge: disconnected node runs cleanly', exec.status === 'done', exec.error)
  check('merge: disconnected node yields empty output', merged?.output === '', merged)
  check(
    'merge: run log says there were no inputs',
    exec.steps.some((step) => step.nodeId === 'm' && step.detail === 'no inputs connected'),
    exec.steps,
  )
}

{
  useGraphStore.getState().replaceGraph(
    [n('m', 'merge', { separator: ' | ', sources: 'a\nb', labelWithSource: true, skipEmpty: false })],
    [],
  )
  const data = currentPayload().nodes[0].data as Record<string, unknown>
  check('export: merge config survives', data.separator === ' | ' && data.sources === 'a\nb', data)
  check('export: merge flags survive', data.labelWithSource === true && data.skipEmpty === false, data)

  useGraphStore.getState().replaceGraph([n('m', 'merge', {})], [])
  const repaired = currentPayload().nodes[0].data as Record<string, unknown>
  check('export: merge defaults are filled in', repaired.separator === DEFAULT_MERGE_OPTIONS.separator, repaired)
  check('export: merge skipEmpty defaults true', repaired.skipEmpty === true, repaired)
}

{
  check('gen: temperature falls back when unparseable', clampTemperature('abc') === DEFAULT_TEMPERATURE)
  check('gen: temperature clamped at the top', clampTemperature(9) === MAX_TEMPERATURE)
  check('gen: temperature clamped at the bottom', clampTemperature(-3) === MIN_TEMPERATURE)
  check('gen: temperature accepts a typed string', clampTemperature('0.2') === 0.2)
  check('gen: zero temperature is valid', clampTemperature(0) === 0)

  check('gen: max tokens rounds', normaliseMaxTokens('1024.6') === 1025)
  check('gen: max tokens clamped low', normaliseMaxTokens(0) === MIN_MAX_TOKENS)
  check('gen: max tokens clamped high', normaliseMaxTokens(999_999) === MAX_MAX_TOKENS)
  check('gen: max tokens default when blank', normaliseMaxTokens('') === DEFAULT_MAX_TOKENS)

  check('gen: seed omitted when blank', normaliseSeed('') === undefined && normaliseSeed(undefined) === undefined)
  check('gen: seed rounds', normaliseSeed('42.7') === 43)
  check('gen: seed rejects nonsense', normaliseSeed('abc') === undefined)

  check('gen: stop sequences split on newlines', parseStopSequences('STOP\n\nEND  ')?.join(',') === 'STOP,END')
  check('gen: stop sequences understand escapes', parseStopSequences('a\\nb')?.join('') === 'a\nb')
  check('gen: no stop sequences yields undefined', parseStopSequences('  \n ') === undefined)

  const settings = readGenerationSettings({})
  check('gen: defaults are coherent', settings.temperature === DEFAULT_TEMPERATURE && settings.maxTokens === DEFAULT_MAX_TOKENS)
  check('gen: defaults describe cleanly', describeGeneration(settings) === 'temp 0.7 · max 512 tokens', describeGeneration(settings))
  check(
    'gen: summary includes seed and stop when set',
    describeGeneration({ temperature: 0, maxTokens: 256, seed: 7, stop: ['X'] }) === 'temp 0 · max 256 tokens · seed 7 · 1 stop',
    describeGeneration({ temperature: 0, maxTokens: 256, seed: 7, stop: ['X'] }),
  )
}

{
  useGraphStore.getState().replaceGraph(
    [
      n('l', 'llm', {
        model: 'm',
        systemPrompt: 's',
        promptTemplate: '{{input}}',
        temperature: 0.15,
        maxTokens: 2048,
        seed: 99,
        stop: ['END'],
        truncated: true,
      }),
    ],
    [],
  )
  const data = currentPayload().nodes[0].data as Record<string, unknown>

  check('export: temperature survives', data.temperature === 0.15, data)
  check('export: max tokens survive', data.maxTokens === 2048, data)
  check('export: seed survives', data.seed === 99, data)
  check('export: stop survives', (data.stop as string[]).join(',') === 'END', data.stop)
  check('export: truncation flag is not persisted', !('truncated' in data), data)

  useGraphStore.getState().replaceGraph([n('l', 'llm', { model: 'm', systemPrompt: '', promptTemplate: '' })], [])
  const defaults = currentPayload().nodes[0].data as Record<string, unknown>
  check('export: missing temperature defaults', defaults.temperature === DEFAULT_TEMPERATURE, defaults)
  check('export: missing max tokens defaults', defaults.maxTokens === DEFAULT_MAX_TOKENS, defaults)
  check('export: absent seed and stop are omitted', !('seed' in defaults) && !('stop' in defaults), defaults)

  useGraphStore.getState().replaceGraph(
    [n('l', 'llm', { model: 'm', systemPrompt: '', promptTemplate: '', temperature: 'hot', maxTokens: -5 })],
    [],
  )
  const repaired = currentPayload().nodes[0].data as Record<string, unknown>
  check('export: invalid values are repaired on save', repaired.temperature === DEFAULT_TEMPERATURE && repaired.maxTokens === MIN_MAX_TOKENS, repaired)
}

{
  const llm = (patch: object) =>
    n('l1', 'llm', { model: 'm', systemPrompt: 's', promptTemplate: '{{input}}', ...patch })

  const base = nodeFingerprint('l1', llm({ temperature: 0.1 }))
  check('cache: temperature changes the fingerprint', nodeFingerprint('l1', llm({ temperature: 0.9 })) !== base)
  check('cache: max tokens change the fingerprint', nodeFingerprint('l1', llm({ temperature: 0.1, maxTokens: 2048 })) !== base)
  check('cache: seed changes the fingerprint', nodeFingerprint('l1', llm({ temperature: 0.1, seed: 5 })) !== base)
  check('cache: stop sequences change the fingerprint', nodeFingerprint('l1', llm({ temperature: 0.1, stop: ['END'] })) !== base)
  check('cache: model changes the fingerprint', nodeFingerprint('l1', llm({ temperature: 0.1, model: 'other' })) !== base)
  check(
    'cache: system prompt changes the fingerprint',
    nodeFingerprint('l1', llm({ temperature: 0.1, systemPrompt: 'other' })) !== base,
  )
  check(
    'cache: identical config yields an identical fingerprint',
    nodeFingerprint('l1', llm({ temperature: 0.1 })) === base,
  )
  check(
    'cache: a bare llm node still fingerprints',
    nodeFingerprint('e', n('e', 'end', { output: '' })) === 'e:end',
  )
}

{
  const good = currentPayload()

  const parsedGood = parseWorkflowJson(JSON.stringify(good))
  check('import: valid workflow parses', parsedGood.payload !== null, parsedGood.error)
  check('import: node count survives parsing', parsedGood.payload?.nodes.length === good.nodes.length)

  check('import: non-json is rejected', parseWorkflowJson('not json at all').error !== undefined)
  check('import: unrelated json is rejected', parseWorkflowJson('{"hello":"world"}').error !== undefined)
  check('import: wrong version is rejected', parseWorkflowJson(JSON.stringify({ version: 2, nodes: [] })).error !== undefined)
  check('import: missing edges array is tolerated', parseWorkflowJson(JSON.stringify({ version: 1, nodes: [] })).payload !== null)

  const applied = applyWorkflow(good)
  check('validate: clean workflow produces no warnings', applied.warnings.length === 0, applied.warnings)

  const messy = {
    version: 1,
    nodes: [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: { input: 'hi' } },
      { id: 'ghost', type: 'quantum', position: { x: 0, y: 0 }, data: {} },
      { id: 's', type: 'start', position: { x: 5, y: 5 }, data: { input: 'dupe' } },
    ],
    edges: [
      { id: 'e1', source: 's', target: 'ghost' },
      { id: 'e2', source: 's', target: 'nowhere' },
    ],
  }
  const cleaned = applyWorkflow(messy as never)
  check('validate: unknown node types are dropped', cleaned.nodes.every((node) => node.type !== 'quantum'), cleaned.nodes.map((n) => n.type))
  check('validate: duplicate ids are dropped', cleaned.nodes.filter((node) => node.id === 's').length === 1, cleaned.nodes.length)
  check('validate: dangling edges are dropped', cleaned.edges.length === 0, cleaned.edges)
  check('validate: problems are reported', cleaned.warnings.length >= 3, cleaned.warnings)
  check('validate: survives a malformed node', applyWorkflow({ version: 1, nodes: [null, { type: 'start' }], edges: [] } as never).nodes.length === 0)

  const empty = applyWorkflow({ version: 1, nodes: [], edges: [] } as never)
  check('validate: empty workflow warns', empty.warnings.some((w) => /No usable nodes/.test(w)), empty.warnings)
}

{
  setAutosaveEnabled(true)
  clearAutosave()
  check('autosave: starts empty', readAutosave() === null)

  const payload = currentPayload()
  const wrote = writeAutosave(payload)
  check('autosave: write returns a boolean', typeof wrote === 'boolean')

  if (autosaveAvailable()) {
    check('autosave: round-trips the node count', readAutosave()?.nodes.length === payload.nodes.length)

    globalThis.localStorage.setItem('localnodeai.autosave', '{{{ not json')
    check('autosave: corrupt data reads as null instead of throwing', readAutosave() === null)

    clearAutosave()
    check('autosave: clear empties it', readAutosave() === null)
  } else {
    check('autosave: without storage nothing persists', wrote === false && readAutosave() === null)
  }

  const snapshot = readAutosave()
  setAutosaveEnabled(false)
  check('autosave: writes are refused when disabled', writeAutosave(payload) === false)
  check('autosave: disabled session left the stored draft alone', readAutosave() === snapshot)
  setAutosaveEnabled(true)
}

{
  const seed = () =>
    useGraphStore.getState().replaceGraph(
      [n('a', 'start', { input: '' }), n('b', 'llm', { model: 'm' }), n('c', 'end', { output: '' })],
      [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ] as never,
    )

  seed()
  const removed = useGraphStore.getState().removeEdges(['e1'])
  check('edge: removeEdges reports what it removed', removed.length === 1 && removed[0].id === 'e1', removed)
  check('edge: the edge is gone', useGraphStore.getState().edges.length === 1)
  check('edge: nodes are untouched', useGraphStore.getState().nodes.length === 3)

  useGraphStore.getState().addEdges(removed)
  check('edge: undo restores it', useGraphStore.getState().edges.length === 2)
  check(
    'edge: restored edge keeps its endpoints',
    useGraphStore.getState().edges.some((edge) => edge.id === 'e1' && edge.source === 'a' && edge.target === 'b'),
  )

  check('edge: removing a missing id returns nothing', useGraphStore.getState().removeEdges(['nope']).length === 0)
  check('edge: no-op removal leaves the graph intact', useGraphStore.getState().edges.length === 2)

  useGraphStore.getState().addEdges(removed)
  check('edge: addEdges ignores duplicate ids', useGraphStore.getState().edges.length === 2, useGraphStore.getState().edges.length)

  const both = useGraphStore.getState().removeEdges(['e1', 'e2'])
  check('edge: bulk removal works', both.length === 2 && useGraphStore.getState().edges.length === 0)
  useGraphStore.getState().addEdges(both)
  check('edge: bulk undo restores both', useGraphStore.getState().edges.length === 2)

  seed()
  const withHandle = [{ id: 'e3', source: 'a', target: 'b', sourceHandle: 'if' }] as never
  useGraphStore.getState().addEdges(withHandle)
  const dropped = useGraphStore.getState().removeEdges(['e3'])
  useGraphStore.getState().addEdges(dropped)
  check(
    'edge: sourceHandle is preserved through delete and undo',
    useGraphStore.getState().edges.find((edge) => edge.id === 'e3')?.sourceHandle === 'if',
  )
}

{
  const seed = () => {
    useGraphStore.getState().replaceGraph(
      [n('a', 'start', { input: 'first' }), n('b', 'end', { output: '' })],
      [{ id: 'e1', source: 'a', target: 'b' }] as never,
    )
    useHistoryStore.getState().reset()
  }

  const inputOf = () => {
    const data = useGraphStore.getState().nodes.find((node) => node.id === 'a')?.data as
      | { input: string }
      | undefined
    return data?.input
  }

  seed()
  check('history: starts with nothing to undo', useHistoryStore.getState().canUndo() === false)
  check('history: nothing to redo', useHistoryStore.getState().canRedo() === false)
  check('history: undo at the start is a no-op', useHistoryStore.getState().undo() === false)

  useGraphStore.getState().updateNodeData('a', { input: 'second' })
  useHistoryStore.getState().record()
  check('history: edit is undoable', useHistoryStore.getState().canUndo())
  check('history: nothing to redo yet', useHistoryStore.getState().canRedo() === false)

  check('history: undo restores the value', useHistoryStore.getState().undo() === true)
  check('history: store rolled back', inputOf() === 'first', inputOf())
  check('history: redo becomes available', useHistoryStore.getState().canRedo())

  check('history: redo reapplies', useHistoryStore.getState().redo() === true)
  check('history: store rolled forward', inputOf() === 'second', inputOf())
  check('history: redo is exhausted', useHistoryStore.getState().redo() === false)

  useHistoryStore.getState().undo()
  const depth = useHistoryStore.getState().entries.length
  check('history: undo does not grow the timeline', useHistoryStore.getState().entries.length === depth)

  useGraphStore.getState().updateNodeData('a', { input: 'third' })
  useHistoryStore.getState().record()
  check('history: new edit clears redo', useHistoryStore.getState().canRedo() === false)
  const undone = useHistoryStore.getState().undo()
  check('history: undo reaches the original', undone && inputOf() === 'first', inputOf())

  seed()
  useGraphStore.getState().addNode(n('c', 'llm', { model: 'm' }) as never)
  useHistoryStore.getState().record()
  check('history: added node is undoable', useHistoryStore.getState().undo() === true)
  check('history: undo removes the node', useGraphStore.getState().nodes.length === 2, useGraphStore.getState().nodes.length)

  seed()
  const before = useHistoryStore.getState().entries.length
  useGraphStore.setState((state) => ({
    nodes: state.nodes.map((node, index) => ({ ...node, selected: index === 0 })) as never,
  }))
  useHistoryStore.getState().record()
  check('history: selecting a node is not an undo step', useHistoryStore.getState().entries.length === before, {
    before,
    after: useHistoryStore.getState().entries.length,
  })
  check('history: selection does not enable undo', useHistoryStore.getState().canUndo() === false)

  seed()
  useGraphStore.getState().updateNodeData('b', { output: 'streamed text', status: 'done' })
  useHistoryStore.getState().record()
  check('history: node output is not an undo step', useHistoryStore.getState().canUndo() === false)

  useGraphStore.getState().updateNodeData('a', { input: 'changed' })
  useHistoryStore.getState().record()
  useGraphStore.getState().updateNodeData('a', { input: 'changed' })
  const depthAfter = useHistoryStore.getState().entries.length
  useHistoryStore.getState().record()
  check('history: a no-op write adds no step', useHistoryStore.getState().entries.length === depthAfter)

  seed()
  useGraphStore.getState().updateNodeData('a', { input: 'a1' })
  useHistoryStore.getState().record()
  useHistoryStore.setState({ lastRecordedAt: Date.now() })
  useGraphStore.getState().updateNodeData('a', { input: 'a2' })
  useHistoryStore.getState().record()
  useHistoryStore.setState({ lastRecordedAt: Date.now() })
  useGraphStore.getState().updateNodeData('a', { input: 'a3' })
  useHistoryStore.getState().record()
  check('history: rapid edits collapse into one step', useHistoryStore.getState().undo() === true)
  check('history: collapsing goes back to the pre-edit value', inputOf() === 'first', inputOf())

  seed()
  for (let i = 0; i < 120; i++) {
    useHistoryStore.setState({ lastRecordedAt: 0 })
    useGraphStore.getState().updateNodeData('a', { input: `value ${i}` })
    useHistoryStore.getState().record()
  }
  check('history: timeline stays bounded', useHistoryStore.getState().entries.length <= 80, useHistoryStore.getState().entries.length)
  check('history: still undoable after trimming', useHistoryStore.getState().canUndo())
}

{
  const make = (tag: string, editable = false) =>
    ({ tagName: tag, isContentEditable: editable }) as unknown as HTMLElement

  check('keys: textareas keep native undo', isTextEntry(make('textarea')) === true)
  check('keys: inputs keep native undo', isTextEntry(make('INPUT')) === true)
  check('keys: selects are left alone', isTextEntry(make('Select')) === true)
  check('keys: contenteditable is left alone', isTextEntry(make('DIV', true)) === true)
  check('keys: the canvas is ours', isTextEntry(make('DIV')) === false)
  check('keys: null target is not text entry', isTextEntry(null) === false)
  check('keys: a plain object is not text entry', isTextEntry({} as EventTarget) === false)
}

{
  const seed = () =>
    useGraphStore.getState().replaceGraph(
      [n('a', 'start', { input: '' }), n('b', 'llm', { model: 'm' })],
      [{ id: 'e1', source: 'a', target: 'b' }] as never,
    )

  for (const code of ['Backspace', 'Delete']) {
    seed()
    const before = useGraphStore.getState().nodes.length
    useGraphStore.setState((state) => ({
      nodes: state.nodes.map((node) => (node.id === 'b' ? { ...node, selected: true } : node)) as never,
    }))
    const selected = useGraphStore.getState().nodes.find((node) => node.id === 'b')?.selected
    check(`delete ${code}: target is selectable`, selected === true)

    useGraphStore.getState().removeNode('b')
    check(`delete ${code}: selection is gone`, useGraphStore.getState().nodes.length === before - 1)
    check(
      `delete ${code}: its edges go too`,
      useGraphStore.getState().edges.every((edge) => edge.source !== 'b' && edge.target !== 'b'),
    )
    check(
      `delete ${code}: remaining graph is still orderable`,
      topologicalOrder(useGraphStore.getState().nodes, useGraphStore.getState().edges).length === 1,
    )
  }
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
