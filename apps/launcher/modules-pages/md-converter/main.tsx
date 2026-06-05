// Thin shim that owns the window's React root and mounts the module's
// real entry component. Heavy code lives in modules/md-converter/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import MdConverter from '@modules/md-converter/frontend/src/MdConverter'
import '@modules/md-converter/frontend/src/styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MdConverter />
  </React.StrictMode>,
)
