// Thin shim — owns the window's React root and mounts the module's
// real App. Heavy code lives in modules/open-sesame/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from '@os/App'
import '@os/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" />
  </React.StrictMode>,
)
