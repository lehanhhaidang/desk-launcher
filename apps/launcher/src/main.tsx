import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider, applyThemeFromStorage } from '@desk-launcher/theme'
import App from './App'
import './main.css'

// Apply the saved theme before the first paint to avoid a flash of defaults.
applyThemeFromStorage('launcher')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider appId="launcher">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
