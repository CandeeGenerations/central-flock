import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMessage, cancelMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const recipientStatusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  sent: 'default',
  pending: 'outline',
  failed: 'destructive',
  skipped: 'secondary',
};

export function MessageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: message, isLoading } = useQuery({
    queryKey: ['message', id],
    queryFn: () => fetchMessage(Number(id)),
    enabled: !!id,
    refetchInterval: (query) => {
      const msg = query.state.data;
      return msg?.status === 'sending' ? 2000 : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMessage(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message', id] });
      toast.success('Message cancelled');
    },
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!message) return <div className="p-6">Message not found</div>;

  const progressPercent = message.totalRecipients > 0
    ? ((message.sentCount + message.failedCount + message.skippedCount) / message.totalRecipients) * 100
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">Message Detail</h2>
        <Badge variant={message.status === 'completed' ? 'default' : message.status === 'cancelled' ? 'destructive' : 'secondary'}>
          {message.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap bg-muted p-4 rounded-md">{message.content}</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Service</span>
              <p><Badge variant={message.serviceType === 'iMessage' ? 'default' : 'secondary'}>{message.serviceType}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">Group</span>
              <p>{message.groupName || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date</span>
              <p>{new Date(message.createdAt).toLocaleString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Progress</CardTitle>
          {message.status === 'sending' && (
            <Button variant="destructive" size="sm" onClick={() => cancelMutation.mutate()}>
              <XCircle className="h-4 w-4 mr-1" />Cancel
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={progressPercent} />
          <div className="flex gap-6 text-sm">
            <span className="text-green-600">Sent: {message.sentCount}</span>
            <span className="text-red-500">Failed: {message.failedCount}</span>
            <span className="text-muted-foreground">Skipped: {message.skippedCount}</span>
            <span>Total: {message.totalRecipients}</span>
          </div>
        </CardContent>
      </Card>

      {/* Recipients */}
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rendered Message</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {message.recipients.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{[r.firstName, r.lastName].filter(Boolean).join(' ') || 'Unnamed'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phoneDisplay}</TableCell>
                  <TableCell><Badge variant={recipientStatusColors[r.status] || 'outline'}>{r.status}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate text-sm">{r.renderedContent}</TableCell>
                  <TableCell className="text-red-500 text-sm">{r.errorMessage || ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
