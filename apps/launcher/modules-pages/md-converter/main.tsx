// Thin shim that owns the window's React root and mounts the module's
// real entry component. Heavy code lives in modules/md-converter/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import MdConverter from '@modules/md-converter/frontend/src/MdConverter'
import '@modules/md-converter/frontend/src/styles.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('md-converter')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider appId="md-converter">
      <MdConverter />
    </ThemeProvider>
  </React.StrictMode>,
)
