import {Button} from '@/components/ui/button'
import {Sentry} from '@/lib/sentry'
import {AlertTriangle} from 'lucide-react'
import {useState} from 'react'
import {useLocation, useNavigate} from 'react-router-dom'

/**
 * Catches render errors in the page area so a crash shows a clean message inside the shell
 * (sidebar and nav keep working) instead of React Router's raw stack trace. Resets on navigation.
 */
export function PageErrorBoundary({children}: {children: React.ReactNode}) {
  const location = useLocation()
  return (
    <Sentry.ErrorBoundary
      key={location.pathname}
      fallback={({error, resetError}) => <PageErrorFallback error={error} onRetry={resetError} />}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}

// A lazy page whose chunk failed to download. React.lazy caches the rejected import, so
// resetting the boundary just re-throws it — only a full reload fetches the module again.
// Messages per engine: Safari, Chrome, Firefox.
const CHUNK_LOAD_ERROR =
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i

function PageErrorFallback({error, onRetry}: {error: unknown; onRetry: () => void}) {
  const navigate = useNavigate()
  const [showDetails, setShowDetails] = useState(false)
  const message = error instanceof Error ? error.message : String(error)
  const isChunkLoadError = CHUNK_LOAD_ERROR.test(message)

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="text-lg font-semibold">
        {isChunkLoadError ? "This page didn't finish loading" : 'Something went wrong on this page'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isChunkLoadError
          ? 'Usually a dropped connection. Try again to reload it.'
          : 'The error has been reported. Try again, or go back.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
        <Button onClick={isChunkLoadError ? () => window.location.reload() : onRetry}>Try again</Button>
      </div>
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="mt-6 text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {showDetails ? 'Hide details' : 'Show details'}
      </button>
      {showDetails && (
        <pre className="mt-2 w-full overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
          {message}
        </pre>
      )}
    </div>
  )
}
