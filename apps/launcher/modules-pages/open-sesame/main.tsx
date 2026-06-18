// Thin shim — owns the window's React root and mounts the module's
// real App. Heavy code lives in modules/open-sesame/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import App from '@os/App'
import '@os/index.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('open-sesame')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider appId="open-sesame">
      <App />
      <Toaster position="top-right" />
    </ThemeProvider>
  </React.StrictMode>,
)
