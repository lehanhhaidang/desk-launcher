// Thin shim — owns the window's React root and mounts the module's real component.
// Heavy code lives in modules/video-downloader/frontend/src/.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import VideoDownloader from '@vid/VideoDownloader'
import '../../../../packages/ui/src/theme.css'
import '@modules/video-downloader/frontend/src/styles.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('video-downloader')

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider appId="video-downloader">
      <VideoDownloader />
    </ThemeProvider>
  </React.StrictMode>,
)
