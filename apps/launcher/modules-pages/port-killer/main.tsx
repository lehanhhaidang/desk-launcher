// Thin shim that owns the window's React root and mounts the module's
// real entry component. Heavy code lives in modules/port-killer/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import PortKiller from '@modules/port-killer/frontend/src/PortKiller'
import '@modules/port-killer/frontend/src/styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PortKiller />
  </React.StrictMode>,
)
