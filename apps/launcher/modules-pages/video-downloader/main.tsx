// Thin shim — owns the window's React root and mounts the module's real component.
// Heavy code lives in modules/video-downloader/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import VideoDownloader from '@vid/VideoDownloader'
import '../../../../packages/ui/src/theme.css'
import '@modules/video-downloader/frontend/src/styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <VideoDownloader />
  </React.StrictMode>,
)
