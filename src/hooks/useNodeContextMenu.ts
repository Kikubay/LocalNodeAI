import { useCallback, type MouseEvent } from 'react'
import { useGraphStore } from '../store/graphStore'

export function useNodeContextMenu(nodeId: string): (event: MouseEvent) => void {
  const openContextMenu = useGraphStore((state) => state.openContextMenu)

  return useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      openContextMenu(event.clientX, event.clientY, nodeId)
    },
    [openContextMenu, nodeId],
  )
}
