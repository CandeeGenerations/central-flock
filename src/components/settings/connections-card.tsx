import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {
  type ConnectionProvider,
  type ConnectionSummary,
  checkConnection,
  disconnectConnection,
  fetchConnections,
  startConnection,
} from '@/lib/api'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {useEffect} from 'react'
import {useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

// Settings → Connections: saved sign-ins to outside services Central Flock acts through.
export function ConnectionsCard() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const {data: connections, isLoading} = useQuery({queryKey: queryKeys.connections, queryFn: fetchConnections})

  // Returning from a provider's sign-in page: /settings?connection=canva[&connectionError=…]
  useEffect(() => {
    const provider = searchParams.get('connection')
    if (!provider) return
    const error = searchParams.get('connectionError')
    if (error) toast.error(`Couldn't connect ${provider}: ${error}`)
    else toast.success(`Connected ${provider}`)
    const next = new URLSearchParams(searchParams)
    next.delete('connection')
    next.delete('connectionError')
    setSearchParams(next, {replace: true})
    queryClient.invalidateQueries({queryKey: queryKeys.connections})
  }, [searchParams, setSearchParams, queryClient])

  const connect = useMutation({
    mutationFn: startConnection,
    onSuccess: ({url}) => {
      window.location.href = url
    },
    onError: (error) => toast.error(error.message),
  })

  const check = useMutation({
    mutationFn: checkConnection,
    onSuccess: (result) => {
      if (result.ok) toast.success(`${result.connection.label} is working (${result.toolCount} tools)`)
      else toast.error(result.message ?? `${result.connection.label} check failed`)
      queryClient.invalidateQueries({queryKey: queryKeys.connections})
    },
    onError: (error) => toast.error(error.message),
  })

  const disconnect = useMutation({
    mutationFn: disconnectConnection,
    onSuccess: () => queryClient.invalidateQueries({queryKey: queryKeys.connections}),
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sign-ins to outside services Central Flock acts through, such as for the weekly Events Story.
        </p>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {connections?.map((c) => (
          <ConnectionRow
            key={c.provider}
            connection={c}
            busy={
              (connect.isPending && connect.variables === c.provider) ||
              (check.isPending && check.variables === c.provider) ||
              (disconnect.isPending && disconnect.variables === c.provider)
            }
            onConnect={() => connect.mutate(c.provider)}
            onCheck={() => check.mutate(c.provider)}
            onDisconnect={() => disconnect.mutate(c.provider)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

const STATUS_LABEL: Record<ConnectionSummary['status'], string> = {
  connected: 'Connected',
  needs_reconnect: 'Needs reconnect',
  not_connected: 'Not connected',
}

function ConnectionRow({
  connection: c,
  busy,
  onConnect,
  onCheck,
  onDisconnect,
}: {
  connection: ConnectionSummary
  busy: boolean
  onConnect: (p: ConnectionProvider) => void
  onCheck: () => void
  onDisconnect: () => void
}) {
  const connected = c.status === 'connected'
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{c.label}</span>
          <Badge variant={connected ? 'default' : c.status === 'needs_reconnect' ? 'destructive' : 'secondary'}>
            {c.configured ? STATUS_LABEL[c.status] : 'Not configured'}
          </Badge>
        </div>
        {!c.configured && (
          <p className="text-xs text-muted-foreground">Missing in the launchd plist: {c.missingEnv.join(', ')}</p>
        )}
        {c.configured && c.lastCheckedAt && (
          <p className="text-xs text-muted-foreground">Last checked {new Date(c.lastCheckedAt).toLocaleString()}</p>
        )}
        {c.lastError && <p className="text-xs text-destructive break-words">{c.lastError}</p>}
      </div>
      {c.configured && (
        <div className="flex shrink-0 gap-2">
          {connected && (
            <Button variant="outline" size="sm" onClick={onCheck} disabled={busy}>
              Check
            </Button>
          )}
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => onConnect(c.provider)}
            disabled={busy}
          >
            {c.status === 'not_connected' ? 'Connect' : 'Reconnect'}
          </Button>
          {c.status !== 'not_connected' && (
            <Button variant="ghost" size="sm" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
