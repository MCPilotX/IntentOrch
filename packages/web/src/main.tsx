import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Explicit import d3-transition to ensure selection.interrupt is correctly registered on d3-selection prototype.
// @reactflow/core's ESM version only imported d3-zoom and d3-selection, but d3-zoom's ESM version
// did not import d3-transition, causing selection.interrupt not registered and throwing error.
import 'd3-transition'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
