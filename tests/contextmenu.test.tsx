import { existsSync, readFileSync } from 'node:fs'
import { ReactFlowProvider } from '@xyflow/react'
import { createRef } from 'react'
import { renderToString } from 'react-dom/server'
import { ContextMenuPanel } from '../src/components/ContextMenu'
import {
  MENU_HEIGHT,
  MENU_ITEMS,
  MENU_WIDTH,
  registerDismissListeners,
  resolveMenuPosition,
} from '../src/components/contextMenuModel'
import App from '../src/App'
import {
  BranchNode,
  CacheNode,
  EndNode,
  LLMNode,
  MergeNode,
  StartNode,
  TransformNode,
} from '../src/nodes'

let failures = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`)
}

const noop = () => {}
const html = renderToString(
  <ContextMenuPanel
    x={240}
    y={160}
    targetType="llm"
    entered
    onAction={noop}
    onKeyDown={noop}
    menuRef={createRef<HTMLDivElement>()}
  />,
)
const count = (needle: string) => html.split(needle).length - 1

check('renders a menu landmark', html.includes('role="menu"'))
check('four menu items', count('role="menuitem"') === 4, count('role="menuitem"'))
check('one separator', count('role="separator"') === 1, count('role="separator"'))
check('duplicate item', html.includes('Duplicate Node'))
check('copy id item', html.includes('Copy Node ID'))
check('disconnect item', html.includes('Disconnect All'))
check('delete item', html.includes('Delete Node'))
check('position fixed class applied', /\bfixed\b/.test(html.match(/class="([^"]*)"/)?.[1] ?? ''), html.match(/class="([^"]*)"/)?.[1])
check('z-index class above the canvas', (html.match(/class="([^"]*)"/)?.[1] ?? '').includes('z-[9999]'))

const built = existsSync('dist/index.html') ? readFileSync('dist/index.html', 'utf8') : ''
if (built) {
  check('css emits .fixed', /\.fixed\{/.test(built))
  check('css emits z-index 9999', /z-index:9999/.test(built))
  check('css emits .origin-top-left', /\.origin-top-left/.test(built))
} else {
  console.log('SKIP css rules (run "npm run build" first)')
}
check('labelled by target type', html.includes('Actions for llm'))
check('icons rendered', ['📋', '🆔', '🔗', '🗑️'].every((icon) => html.includes(icon)))
check(
  'only destructive items are red',
  (html.match(/text-red-300/g) ?? []).length === 2,
  html.match(/text-red-300/g),
)
check('hover state on every item', count('hover:bg-gray-700') === 4, count('hover:bg-gray-700'))
check('separator sits before the destructive group', html.indexOf('separator') < html.indexOf('Disconnect All'))
check('entered state is visible', html.includes('opacity-100') && !html.includes('opacity-0'))

const entering = renderToString(
  <ContextMenuPanel
    x={240}
    y={160}
    targetType="start"
    entered={false}
    onAction={noop}
    onKeyDown={noop}
    menuRef={createRef<HTMLDivElement>()}
  />,
)
check('pre-animation state is hidden and scaled', entering.includes('opacity-0') && entering.includes('scale-95'))

check('menu items expose all four actions', MENU_ITEMS.map((i) => i.action).join(',') === 'duplicate,copy-id,disconnect,delete')
check('destructive flags set on last two', MENU_ITEMS.filter((i) => i.destructive).map((i) => i.action).join(',') === 'disconnect,delete')

const W = 1280
const H = 800

check('top-left: no flip', JSON.stringify(resolveMenuPosition(100, 100, W, H)) === JSON.stringify({ left: 100, top: 100 }), resolveMenuPosition(100, 100, W, H))

const bottomRight = resolveMenuPosition(1270, 790, W, H)
check('bottom-right: flips left and up', bottomRight.left < 1270 && bottomRight.top < 790, bottomRight)
check(
  'bottom-right: stays inside viewport',
  bottomRight.left + MENU_WIDTH <= W && bottomRight.top + MENU_HEIGHT <= H,
  { ...bottomRight, MENU_WIDTH, MENU_HEIGHT },
)

const corner = resolveMenuPosition(0, 0, W, H)
check('cursor at 0,0 keeps a margin', corner.left === 8 && corner.top === 8, corner)

const rightEdge = resolveMenuPosition(1279, 400, W, H)
check('right edge flips horizontally only', rightEdge.left < 1279 && rightEdge.top === 400, rightEdge)

const tiny = resolveMenuPosition(400, 300, 320, 240)
check('tiny viewport stays non-negative', tiny.left >= 8 && tiny.top >= 8, tiny)
check(
  'viewport just large enough still contains the menu',
  tiny.left + MENU_WIDTH <= 320 && tiny.top + MENU_HEIGHT <= 240,
  tiny,
)

const cramped = resolveMenuPosition(100, 90, 200, 100)
check('viewport too short for the menu pins to the margin', cramped.top === 8 && cramped.left === 8, cramped)
check('cramped menu never gets negative coordinates', cramped.top >= 0 && cramped.left >= 0, cramped)

const MIN_HEIGHT = MENU_ITEMS.length * 28 + 9 + 8
check('measured height covers the rendered menu', MENU_HEIGHT >= MIN_HEIGHT, { MENU_HEIGHT, MIN_HEIGHT })

let spills = 0
let worst: string | null = null
for (let x = 0; x <= 1400; x += 37) {
  for (let y = 0; y <= 900; y += 41) {
    const { left, top } = resolveMenuPosition(x, y, 1280, 800)
    if (left < 0 || top < 0 || left + MENU_WIDTH > 1280 || top + MENU_HEIGHT > 800) {
      spills++
      worst = worst ?? `(${x},${y}) -> (${left},${top})`
    }
  }
}
check('menu never overflows at any cursor position', spills === 0, { spills, worst })

const NODE_FILES = [
  'StartNode.tsx',
  'LLMNode.tsx',
  'EndNode.tsx',
  'CacheNode.tsx',
  'TransformNode.tsx',
  'BranchNode.tsx',
  'MergeNode.tsx',
]
for (const file of NODE_FILES) {
  const source = readFileSync(`src/nodes/${file}`, 'utf8')
  check(`${file}: uses useNodeContextMenu`, source.includes('useNodeContextMenu(id)'))
  check(`${file}: passes onContextMenu to NodeChrome`, source.includes('onContextMenu={onContextMenu}'))
}

const chrome = readFileSync('src/nodes/NodeChrome.tsx', 'utf8')
check('NodeChrome binds onContextMenu on the root div', /<div\s+onContextMenu=\{onContextMenu\}/.test(chrome))

const hookSource = readFileSync('src/hooks/useNodeContextMenu.ts', 'utf8')
check('hook preventDefaults the browser menu', hookSource.includes('event.preventDefault()'))
check('hook stops propagation to the canvas', hookSource.includes('event.stopPropagation()'))
check(
  'hook never touches pointer events (drag safety)',
  !/mousedown|pointerdown|onMouseDown/.test(hookSource),
)

for (const [name, Node, data] of [
  ['Start', StartNode, { input: 'hello' }],
  ['LLM', LLMNode, { model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', systemPrompt: 's', promptTemplate: '{{input}}' }],
  ['End', EndNode, { output: 'done' }],
  ['Cache', CacheNode, { keyTemplate: '{{input}}', enabled: true, nodeFingerprint: true }],
  ['Transform', TransformNode, { op: 'template', options: { template: '{{input}}' } }],
  ['Branch', BranchNode, { condition: 'always', options: {} }],
  ['Merge', MergeNode, { separator: '\\n\\n', sources: '', labelWithSource: false, skipEmpty: true }],
] as const) {
  try {
    const markup = renderToString(
      <ReactFlowProvider>
        <Node
          id={`${name.toLowerCase()}-1`}
          data={data}
          type={name.toLowerCase()}
          selected={false}
          {...({} as Record<string, never>)}
        />
      </ReactFlowProvider>,
    )
    check(`${name}Node: renders with the context handler wired`, markup.includes('rounded-xl'))
  } catch (error) {
    check(`${name}Node: renders with the context handler wired`, false, String(error))
  }
}

const canvas = readFileSync('src/components/Canvas.tsx', 'utf8')
check('canvas: ReactFlow has an onContextMenu handler', /<ReactFlow[\s\S]*?onContextMenu=\{handlePaneContextMenu\}/.test(canvas))
check('canvas: pane handler prevents the browser menu', /handlePaneContextMenu[\s\S]*?preventDefault\(\)/.test(canvas))
check('canvas: pane handler closes an open menu', /handlePaneContextMenu[\s\S]*?closeContextMenu\(\)/.test(canvas))

const app = readFileSync('src/App.tsx', 'utf8')
check('app: renders the context menu once', (app.match(/<ContextMenu \/>/g) ?? []).length === 1)
check('app: menu is outside the canvas container', app.indexOf('<ContextMenu />') > app.indexOf('<Canvas />'))
check('app: menu is outside the <main> element', app.indexOf('<ContextMenu />') > app.lastIndexOf('</main>'))

const rootClass = /<div className="([^"]*)">\s*\n\s*<header/.exec(app)?.[1] ?? ''
check('app: no ancestor class establishes a fixed-position containing block', !/transform|translate|filter|will-change|contain|backdrop-blur/.test(rootClass), rootClass)

try {
  const markup = renderToString(<App />)
  check('app: still renders with the menu mounted', markup.includes('LocalNodeAI') && markup.includes('Run workflow'))
} catch (error) {
  check('app: still renders with the menu mounted', false, String(error))
}

{
  type Binding = { type: string; handler: EventListener; capture: unknown }
  const added: Binding[] = []
  const removed: Binding[] = []
  const fakeDoc = {
    addEventListener: (type: string, handler: EventListener, capture?: unknown) =>
      added.push({ type, handler, capture }),
    removeEventListener: (type: string, handler: EventListener, capture?: unknown) =>
      removed.push({ type, handler, capture }),
  }

  let closes = 0
  const inside = new Set<unknown>(['menu-item'])
  const cleanup = registerDismissListeners(
    () => {
      closes++
    },
    (target) => inside.has(target),
    fakeDoc,
  )

  check(
    'dismiss: all listeners registered in the capture phase',
    added.length === 4 && added.every((entry) => entry.capture === true),
    added.map((entry) => `${entry.type}:${entry.capture}`),
  )
  check(
    'dismiss: covers pointer, mouse, context menu and keyboard',
    ['pointerdown', 'mousedown', 'contextmenu', 'keydown'].every((type) =>
      added.some((entry) => entry.type === type),
    ),
    added.map((entry) => entry.type),
  )

  const find = (type: string) => added.find((entry) => entry.type === type)?.handler as EventListener
  const makeEvent = (target: unknown, key?: string) =>
    ({ target, key, stopPropagation: () => {}, preventDefault: () => {} }) as unknown as Event

  for (const type of ['pointerdown', 'mousedown', 'contextmenu']) {
    closes = 0
    find(type)(makeEvent('canvas'))
    check(`dismiss: ${type} outside closes the menu`, closes === 1, closes)

    closes = 0
    find(type)(makeEvent('menu-item'))
    check(`dismiss: ${type} inside the menu is ignored`, closes === 0, closes)
  }

  closes = 0
  find('keydown')(makeEvent('menu-item', 'Escape'))
  check('dismiss: Escape closes', closes === 1, closes)

  closes = 0
  find('keydown')(makeEvent('menu-item', 'Tab'))
  check('dismiss: Tab closes', closes === 1, closes)

  closes = 0
  find('keydown')(makeEvent('menu-item', 'a'))
  check('dismiss: other keys pass through', closes === 0, closes)

  cleanup()
  check(
    'dismiss: cleanup removes every listener with the same capture flag',
    removed.length === added.length &&
      removed.every((entry, index) => entry.type === added[index].type && entry.capture === true),
    removed.map((entry) => `${entry.type}:${entry.capture}`),
  )
}

check(
  'canvas: accepts both Backspace and Delete',
  /deleteKeyCode=\{DELETE_KEY_CODES\}/.test(canvas),
)
check(
  'delete key: both codes are configured',
  /DELETE_KEY_CODES = \['Backspace', 'Delete'\]/.test(canvas),
  canvas.match(/DELETE_KEY_CODES = \[[^\]]*\]/)?.[0],
)

check(
  'canvas: wires onEdgeContextMenu',
  /<ReactFlow[\s\S]*?onEdgeContextMenu=\{handleEdgeContextMenu\}/.test(canvas),
)
check(
  'edge delete: prevents the browser menu',
  /handleEdgeContextMenu[\s\S]*?preventDefault\(\)/.test(canvas),
)
check(
  'edge delete: stops propagation so the pane handler does not also run',
  /handleEdgeContextMenu[\s\S]*?stopPropagation\(\)/.test(canvas),
)
check(
  'edge delete: closes any open node menu',
  /handleEdgeContextMenu[\s\S]*?closeContextMenu\(\)/.test(canvas),
)
check(
  'edge delete: removes the edge through the store',
  /handleEdgeContextMenu[\s\S]*?removeEdges\(\[edge\.id\]\)/.test(canvas),
)
check(
  'edge delete: offers an undo that re-adds the edge',
  /Connection removed[\s\S]*?addEdges\(removed\)/.test(canvas),
)

const styles = readFileSync('src/index.css', 'utf8')
check('edge delete: hover previews the destructive action', /\.react-flow__edge:hover \.react-flow__edge-path\s*\{\s*stroke: #fb7185/.test(styles), styles.match(/\.react-flow__edge:hover[^}]*\}/)?.[0])
check('edge delete: interaction path shows a context-menu cursor', /\.react-flow__edge-interaction\s*\{\s*cursor: context-menu/.test(styles))

const menuSource = readFileSync('src/components/ContextMenu.tsx', 'utf8')
for (const action of ['removeNode', 'duplicateNode', 'disconnectNode', 'copyToClipboard']) {
  check(`action: menu dispatches ${action}`, menuSource.includes(`${action}(`))
}
check('action: copy reports a toast', /copyToClipboard\(nodeId\)[\s\S]{0,200}showToast\(/.test(menuSource))
check('action: menu closes before dispatching', /closeContextMenu\(\)\s*\n\s*\n\s*switch/.test(menuSource))

const appWithToast = app
check('app: mounts the toast', (appWithToast.match(/<Toast \/>/g) ?? []).length === 1)
check('app: toast is outside <main>', appWithToast.indexOf('<Toast />') > appWithToast.lastIndexOf('</main>'))

const toastSource = readFileSync('src/components/Toast.tsx', 'utf8')
check(
  'toast: auto-clears, and lingers when it offers an action',
  /const VISIBLE_MS = 1500/.test(toastSource) &&
    /const VISIBLE_MS_WITH_ACTION = 6000/.test(toastSource) &&
    /setTimeout\(clear, action \? VISIBLE_MS_WITH_ACTION : VISIBLE_MS\)/.test(toastSource),
  toastSource,
)
check('toast: announces itself to screen readers', /aria-live="polite"/.test(toastSource))

console.log(failures === 0 ? '\nCONTEXT MENU OK' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
