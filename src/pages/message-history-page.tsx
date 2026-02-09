import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchMessages } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus } from 'lucide-react';

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  sending: 'secondary',
  pending: 'outline',
  cancelled: 'destructive',
};

export function MessageHistoryPage() {
  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages'],
    queryFn: fetchMessages,
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Messages</h2>
        <Link to="/messages/compose">
          <Button><Plus className="h-4 w-4 mr-2" />Compose</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Group</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages?.map(msg => (
                <TableRow key={msg.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(msg.createdAt).toLocaleDateString()} {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    <Link to={`/messages/${msg.id}`} className="hover:underline">
                      {msg.content.substring(0, 80)}{msg.content.length > 80 ? '...' : ''}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="text-green-600">{msg.sentCount}</span>
                    {msg.failedCount > 0 && <span className="text-red-500 ml-1">/ {msg.failedCount} failed</span>}
                    <span className="text-muted-foreground"> of {msg.totalRecipients}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={msg.serviceType === 'iMessage' ? 'default' : 'secondary'}>{msg.serviceType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[msg.status] || 'outline'}>{msg.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{msg.groupName || '—'}</TableCell>
                </TableRow>
              ))}
              {messages?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No messages sent yet. <Link to="/messages/compose" className="underline">Compose one</Link>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
