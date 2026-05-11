import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import App from './App.tsx'
import './index.css'
import {Sentry} from './lib/sentry'

function ErrorFallback() {
  return (
    <div style={{padding: 40, fontFamily: 'system-ui', textAlign: 'center'}}>
      <h1 style={{fontSize: 20, marginBottom: 8}}>Something went wrong</h1>
      <p style={{color: '#666', marginBottom: 16}}>The error has been reported. Try reloading.</p>
      <button onClick={() => window.location.reload()} style={{padding: '8px 16px', cursor: 'pointer'}}>
        Reload
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
