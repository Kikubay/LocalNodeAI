export type ContextMenuAction = 'delete' | 'duplicate' | 'disconnect' | 'copy-id'

export type MenuItem = {
  action: ContextMenuAction
  icon: string
  label: string
  destructive?: boolean
}

export const MENU_ITEMS: MenuItem[] = [
  { action: 'duplicate', icon: '📋', label: 'Duplicate Node' },
  { action: 'copy-id', icon: '🆔', label: 'Copy Node ID' },
  { action: 'disconnect', icon: '🔗', label: 'Disconnect All', destructive: true },
  { action: 'delete', icon: '🗑️', label: 'Delete Node', destructive: true },
]

const MENU_ITEM_HEIGHT = 28
const MENU_SEPARATOR_HEIGHT = 9
const MENU_PADDING = 8
const MEASUREMENT_SLACK = 8

export const MENU_WIDTH = 208
export const MENU_HEIGHT =
  MENU_ITEMS.length * MENU_ITEM_HEIGHT + MENU_SEPARATOR_HEIGHT + MENU_PADDING + MEASUREMENT_SLACK
export const VIEWPORT_MARGIN = 8

export type MenuPosition = { left: number; top: number }

export function registerDismissListeners(
  close: () => void,
  isInsideMenu: (target: EventTarget | null) => boolean,
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'> = document,
): () => void {
  const dismiss = (event: Event) => {
    if (isInsideMenu(event.target)) return
    close()
  }

  const onKeyDown = (event: Event) => {
    const key = (event as KeyboardEvent).key
    if (key === 'Escape') {
      event.stopPropagation()
      close()
    } else if (key === 'Tab') {
      event.preventDefault()
      close()
    }
  }

  const bindings: [string, EventListener][] = [
    ['pointerdown', dismiss],
    ['mousedown', dismiss],
    ['contextmenu', dismiss],
    ['keydown', onKeyDown],
  ]

  for (const [type, handler] of bindings) {
    doc.addEventListener(type, handler, true)
  }

  return () => {
    for (const [type, handler] of bindings) {
      doc.removeEventListener(type, handler, true)
    }
  }
}

export function resolveMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): MenuPosition {
  const flipX = x + MENU_WIDTH + VIEWPORT_MARGIN > viewportWidth
  const flipY = y + MENU_HEIGHT + VIEWPORT_MARGIN > viewportHeight

  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - MENU_WIDTH - VIEWPORT_MARGIN)
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - MENU_HEIGHT - VIEWPORT_MARGIN)

  const preferredLeft = flipX ? x - MENU_WIDTH : x
  const preferredTop = flipY ? y - MENU_HEIGHT : y

  return {
    left: Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN), maxLeft),
    top: Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop),
  }
}
