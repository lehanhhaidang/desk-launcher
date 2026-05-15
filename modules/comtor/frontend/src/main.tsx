import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Quicksand — round, friendly, full Vietnamese support. Bundled into the app.
import '@fontsource/quicksand/latin-300.css';
import '@fontsource/quicksand/latin-400.css';
import '@fontsource/quicksand/latin-500.css';
import '@fontsource/quicksand/latin-600.css';
import '@fontsource/quicksand/latin-700.css';
import '@fontsource/quicksand/latin-ext-400.css';
import '@fontsource/quicksand/latin-ext-500.css';
import '@fontsource/quicksand/latin-ext-600.css';
import '@fontsource/quicksand/vietnamese-300.css';
import '@fontsource/quicksand/vietnamese-400.css';
import '@fontsource/quicksand/vietnamese-500.css';
import '@fontsource/quicksand/vietnamese-600.css';
import '@fontsource/quicksand/vietnamese-700.css';

import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
