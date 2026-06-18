// Thin shim — mounts Comtor's existing AppShell into this window.
// Heavy code lives in modules/comtor/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import App from '@cmt/App'

// Quicksand — round, friendly, full Vietnamese support.
import '@fontsource/quicksand/latin-300.css'
import '@fontsource/quicksand/latin-400.css'
import '@fontsource/quicksand/latin-500.css'
import '@fontsource/quicksand/latin-600.css'
import '@fontsource/quicksand/latin-700.css'
import '@fontsource/quicksand/latin-ext-400.css'
import '@fontsource/quicksand/latin-ext-500.css'
import '@fontsource/quicksand/latin-ext-600.css'
import '@fontsource/quicksand/vietnamese-300.css'
import '@fontsource/quicksand/vietnamese-400.css'
import '@fontsource/quicksand/vietnamese-500.css'
import '@fontsource/quicksand/vietnamese-600.css'
import '@fontsource/quicksand/vietnamese-700.css'

import '@cmt/index.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('comtor')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider appId="comtor">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
