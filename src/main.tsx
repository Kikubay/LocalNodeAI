import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { readAutosave, setAutosaveEnabled } from './lib/autosave'
import { applyWorkflow, hydrateFromInjectedState, readInjectedPayload } from './lib/serialization'
import { useAutosaveStore } from './store/autosaveStore'
import { useGraphStore } from './store/graphStore'
import './index.css'

const embedded = readInjectedPayload()
if (embedded) setAutosaveEnabled(false)

if (!hydrateFromInjectedState()) {
  const draft = readAutosave()
  if (draft) {
    const { nodes, edges, viewport } = applyWorkflow(draft)
    useGraphStore.getState().replaceGraph(nodes, edges)
    if (viewport) useGraphStore.getState().setViewport(viewport)
    useAutosaveStore.getState().markRestored()
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
