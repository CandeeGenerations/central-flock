import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardAction, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {PageSpinner} from '@/components/ui/spinner'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {fetchStats} from '@/lib/api'
import {formatDateTime} from '@/lib/date'
import {queryKeys} from '@/lib/query-keys'
import {useQuery} from '@tanstack/react-query'
import {Calendar, MessageSquare, Plus} from 'lucide-react'
import {useState} from 'react'
import {Link} from 'react-router-dom'
import {Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts'

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  sending: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
  scheduled: 'secondary',
  past_due: 'destructive',
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

const periods = ['week', 'month', 'year'] as const
type Period = (typeof periods)[number]

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>('month')

  const {data: stats, isLoading} = useQuery({
    queryKey: [...queryKeys.stats, period],
    queryFn: () => fetchStats(period),
  })

  if (isLoading || !stats) return <PageSpinner />

  const {people, groups, messages, drafts} = stats
  const totalProcessed = messages.totalSent + messages.totalFailed + messages.totalSkipped
  const successRate = totalProcessed > 0 ? Math.round((messages.totalSent / totalProcessed) * 100) : 0
  const failedPct = totalProcessed > 0 ? Math.round((messages.totalFailed / totalProcessed) * 100) : 0
  const skippedPct = totalProcessed > 0 ? Math.round((messages.totalSkipped / totalProcessed) * 100) : 0

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <div className="flex gap-2 flex-wrap">
          <Link to="/messages/compose">
            <Button size="sm">
              <MessageSquare className="h-4 w-4 mr-2" />
              Compose Message
              <kbd className="ml-2 text-[10px] font-mono opacity-60">{isMac ? '⌘' : 'Ctrl+'}J</kbd>
            </Button>
          </Link>
          <Link to="/people?add=1">
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Person
              <kbd className="ml-2 text-[10px] font-mono opacity-60">{isMac ? '⌘' : 'Ctrl+'}P</kbd>
            </Button>
          </Link>
        </div>
      </div>

      {/* Row 1 — Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">People</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{people.total}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="default">{people.active} active</Badge>
              <Badge variant="outline">{people.inactive} inactive</Badge>
              <Badge variant="destructive">{people.doNotContact} DNC</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Groups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{groups.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Messages Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{messages.totalSent}</div>
            <p className="text-sm text-muted-foreground mt-1">of {totalProcessed} processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{messages.scheduledMessages.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{drafts.total}</div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 — Messages Over Time + Delivery Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Messages Over Time</CardTitle>
            <CardAction>
              <div className="flex gap-1">
                {periods.map((p) => (
                  <Button key={p} size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            {messages.overTime.data.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No message data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={messages.overTime.data} barCategoryGap="20%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{fontSize: 12, fill: 'var(--muted-foreground)'}}
                    axisLine={{stroke: 'var(--border)'}}
                    tickLine={false}
                    padding={{left: 20, right: 20}}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{fontSize: 12, fill: 'var(--muted-foreground)'}}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{fill: 'var(--muted)'}}
                    content={({active, payload, label}) => {
                      if (!active || !payload?.length) return null
                      return (
                        <div className="rounded-lg border bg-card px-3 py-2 shadow-md">
                          <p className="text-sm font-medium mb-1">{label}</p>
                          {payload.map((entry) => (
                            <p key={entry.name} className="text-xs text-muted-foreground">
                              <span
                                className="inline-block w-2 h-2 rounded-full mr-1.5"
                                style={{backgroundColor: entry.color}}
                              />
                              {entry.name}: <span className="font-medium text-foreground">{entry.value}</span>
                            </p>
                          ))}
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="sent" stackId="a" fill="var(--primary)" name="Sent" maxBarSize={80} />
                  <Bar dataKey="failed" stackId="a" fill="var(--destructive)" name="Failed" maxBarSize={80} />
                  <Bar
                    dataKey="skipped"
                    stackId="a"
                    fill="var(--muted-foreground)"
                    name="Skipped"
                    maxBarSize={80}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Sent</span>
                <span className="text-green-600">{messages.totalSent}</span>
              </div>
              <Progress value={successRate} className="**:data-[slot=progress-indicator]:bg-green-500" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Failed</span>
                <span className="text-red-500">{messages.totalFailed}</span>
              </div>
              <Progress value={failedPct} className="**:data-[slot=progress-indicator]:bg-red-500" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Skipped</span>
                <span className="text-yellow-600">{messages.totalSkipped}</span>
              </div>
              <Progress value={skippedPct} className="**:data-[slot=progress-indicator]:bg-yellow-500" />
            </div>
            <p className="text-sm text-muted-foreground pt-2">
              Overall success rate: <span className="font-semibold text-foreground">{successRate}%</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Recent Messages + Scheduled Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent Messages</CardTitle>
          </CardHeader>
          <CardContent>
            {messages.recentMessages.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No messages yet.</p>
            ) : (
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Recipients</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.recentMessages.map((msg) => (
                      <TableRow key={msg.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDateTime(msg.createdAt)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          <Link to={`/messages/${msg.id}`} className="hover:underline truncate block">
                            {(msg.renderedPreview || msg.content).substring(0, 60)}
                            {(msg.renderedPreview || msg.content).length > 60 ? '...' : ''}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="text-green-600">{msg.sentCount}</span>
                          {msg.failedCount > 0 && <span className="text-red-500 ml-1">/ {msg.failedCount} failed</span>}
                          <span className="text-muted-foreground"> of {msg.totalRecipients}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[msg.status] || 'outline'}>{msg.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="mt-3 text-center">
              <Link to="/messages" className="text-sm text-primary hover:underline">
                View all messages
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Messages</CardTitle>
          </CardHeader>
          <CardContent>
            {messages.scheduledMessages.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No scheduled messages.</p>
            ) : (
              <div className="space-y-3">
                {messages.scheduledMessages.map((msg) => (
                  <Link
                    key={msg.id}
                    to={`/messages/${msg.id}`}
                    className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent/50 transition-colors"
                  >
                    <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {(msg.renderedPreview || msg.content).substring(0, 60)}
                        {(msg.renderedPreview || msg.content).length > 60 ? '...' : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {msg.scheduledAt && <span>{formatDateTime(msg.scheduledAt)}</span>}
                        <span>{msg.totalRecipients} recipients</span>
                      </div>
                    </div>
                    <Badge variant={statusColors[msg.status] || 'outline'}>
                      {msg.status === 'past_due' ? 'past due' : msg.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
