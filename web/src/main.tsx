import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { ensureActiveIncident } from '@/store/boardStore'
import './index.css'

// Guarantee an active incident exists before first paint (post-rehydration).
ensureActiveIncident()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
