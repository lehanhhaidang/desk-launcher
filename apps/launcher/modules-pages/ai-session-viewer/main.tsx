// Thin shim that owns the window's React root and mounts the module's
// real entry component. Heavy code lives in modules/ai-session-viewer/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import AiSessionViewer from '@aisv/AiSessionViewer'
import '@aisv/styles.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('ai-session-viewer')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider appId="ai-session-viewer">
      <AiSessionViewer />
    </ThemeProvider>
  </React.StrictMode>,
)
