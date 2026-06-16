// Thin shim — owns the window's React root and mounts the MySSH module.
// Heavy code lives in modules/myssh/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import MySSH from '@modules/myssh/frontend/src/MySSH'
import '@modules/myssh/frontend/src/styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MySSH />
    <Toaster position="top-right" theme="dark" />
  </React.StrictMode>,
)
