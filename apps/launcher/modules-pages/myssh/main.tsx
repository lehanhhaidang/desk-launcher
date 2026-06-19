// Thin shim — owns the window's React root and mounts the MySSH module.
// Heavy code lives in modules/myssh/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import MySSH from '@modules/myssh/frontend/src/MySSH'
import '@modules/myssh/frontend/src/styles.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('myssh')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider appId="myssh">
      <MySSH />
      <Toaster position="top-right" theme="dark" />
    </ThemeProvider>
  </React.StrictMode>,
)
