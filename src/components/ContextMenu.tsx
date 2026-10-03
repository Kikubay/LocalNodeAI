import { Fragment, useEffect, useRef, useState } from 'react'
import { copyToClipboard } from '../lib/clipboard'
import { useGraphStore } from '../store/graphStore'
import { useToastStore } from '../store/toastStore'
import {
  MENU_ITEMS,
  registerDismissListeners,
  resolveMenuPosition,
  type ContextMenuAction,
} from './contextMenuModel'

export type { ContextMenuAction } from './contextMenuModel'

export function ContextMenuPanel({
  x,
  y,
  targetType,
  entered,
  onAction,
  onKeyDown,
  menuRef,
}: {
  x: number
  y: number
  targetType: string
  entered: boolean
  onAction: (action: ContextMenuAction) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  menuRef: React.RefObject<HTMLDivElement | null>
}) {
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  const { left, top } = resolveMenuPosition(x, y, viewportWidth, viewportHeight)

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      aria-label={`Actions for ${targetType}`}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ top, left }}
      className={`fixed z-[9999] w-52 origin-top-left rounded-lg border border-gray-700 bg-gray-800 p-1 shadow-xl outline-none transition duration-100 ease-out ${
        entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}
    >
      {MENU_ITEMS.map((item, index) => {
        const showDivider = index > 0 && item.destructive && !MENU_ITEMS[index - 1].destructive
        return (
          <Fragment key={item.action}>
            {showDivider ? <div className="my-1 h-px bg-gray-700" role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => onAction(item.action)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-gray-700 focus-visible:bg-gray-700 ${
                item.destructive ? 'text-red-300 hover:text-red-200' : 'text-gray-200 hover:text-white'
              }`}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

export function ContextMenu() {
  const contextMenu = useGraphStore((state) => state.contextMenu)
  const closeContextMenu = useGraphStore((state) => state.closeContextMenu)
  const removeNode = useGraphStore((state) => state.removeNode)
  const duplicateNode = useGraphStore((state) => state.duplicateNode)
  const disconnectNode = useGraphStore((state) => state.disconnectNode)
  const nodes = useGraphStore((state) => state.nodes)
  const showToast = useToastStore((state) => state.show)

  const menuRef = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)

  const nodeId = contextMenu.nodeId
  const target = nodeId ? nodes.find((node) => node.id === nodeId) : undefined
  const isOpen = contextMenu.isOpen && Boolean(target)

  useEffect(() => {
    if (!isOpen) return
    const frame = requestAnimationFrame(() => setEntered(true))
    menuRef.current?.focus()
    return () => cancelAnimationFrame(frame)
  }, [isOpen, target])

  useEffect(() => {
    if (!isOpen) return
    return registerDismissListeners(
      closeContextMenu,
      (target) => Boolean(menuRef.current?.contains(target as Node)),
    )
  }, [isOpen, closeContextMenu])

  const onAction = (action: ContextMenuAction) => {
    if (!nodeId) return
    closeContextMenu()

    switch (action) {
      case 'delete':
        removeNode(nodeId)
        break
      case 'duplicate':
        if (!duplicateNode(nodeId)) showToast('Node no longer exists')
        break
      case 'disconnect':
        disconnectNode(nodeId)
        break
      case 'copy-id':
        void copyToClipboard(nodeId).then((copied) =>
          showToast(copied ? 'Copied!' : 'Could not access clipboard'),
        )
        break
    }
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      items[(current + delta + items.length) % items.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      ;(event.key === 'Home' ? items[0] : items[items.length - 1])?.focus()
    }
  }

  if (!isOpen || !target) return null

  return (
    <ContextMenuPanel
      x={contextMenu.x}
      y={contextMenu.y}
      targetType={target.type ?? 'node'}
      entered={entered}
      onAction={onAction}
      onKeyDown={onMenuKeyDown}
      menuRef={menuRef}
    />
  )
}
