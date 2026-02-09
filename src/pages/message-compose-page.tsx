import { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchGroups, fetchGroup, fetchPeople, sendMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Send, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMessageStatus } from '@/lib/api';

export function MessageComposePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const presetGroupId = searchParams.get('groupId');
  const presetRecipientId = searchParams.get('recipientId');

  const [serviceType, setServiceType] = useState<'iMessage' | 'SMS'>('iMessage');
  const [recipientMode, setRecipientMode] = useState<'group' | 'individual'>(presetGroupId ? 'group' : 'individual');
  const [selectedGroupId, setSelectedGroupId] = useState(presetGroupId || '');
  const [content, setContent] = useState('');
  const [excludeIds, setExcludeIds] = useState<Set<number>>(new Set());
  const [batchSize, setBatchSize] = useState(1);
  const [batchDelayMs, setBatchDelayMs] = useState(5000);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ messageId: number; sentCount: number; failedCount: number; skippedCount: number; totalRecipients: number; status: string } | null>(null);

  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups });
  const { data: groupDetail } = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => fetchGroup(Number(selectedGroupId)),
    enabled: recipientMode === 'group' && !!selectedGroupId,
  });
  const { data: allPeople } = useQuery({
    queryKey: ['people', 'all'],
    queryFn: () => fetchPeople({ limit: 1000 }),
    enabled: recipientMode === 'individual',
  });

  const [selectedIndividualIds, setSelectedIndividualIds] = useState<Set<number>>(() => {
    return presetRecipientId ? new Set([Number(presetRecipientId)]) : new Set();
  });

  const recipients = useMemo(() => {
    if (recipientMode === 'group' && groupDetail) {
      return groupDetail.members.filter(m => !excludeIds.has(m.id));
    }
    if (recipientMode === 'individual' && allPeople) {
      return allPeople.data.filter(p => selectedIndividualIds.has(p.id));
    }
    return [];
  }, [recipientMode, groupDetail, allPeople, excludeIds, selectedIndividualIds]);

  const allRecipientIds = useMemo(() => {
    if (recipientMode === 'group' && groupDetail) {
      return groupDetail.members.map(m => m.id);
    }
    return [...selectedIndividualIds];
  }, [recipientMode, groupDetail, selectedIndividualIds]);

  const previewPerson = recipients[0];
  const renderedPreview = previewPerson
    ? content
        .replace(/\{\{firstName\}\}/g, previewPerson.firstName || '')
        .replace(/\{\{lastName\}\}/g, previewPerson.lastName || '')
        .replace(/\{\{fullName\}\}/g, [previewPerson.firstName, previewPerson.lastName].filter(Boolean).join(' '))
    : content;

  const charCount = content.length;
  const isSms = serviceType === 'SMS';

  const sendMutation = useMutation({
    mutationFn: () => sendMessage({
      content,
      recipientIds: allRecipientIds,
      excludeIds: [...excludeIds],
      groupId: recipientMode === 'group' ? Number(selectedGroupId) : undefined,
      serviceType,
      batchSize,
      batchDelayMs,
    }),
    onSuccess: async (data) => {
      setSending(true);
      const messageId = data.messageId;
      // Poll for progress
      const poll = setInterval(async () => {
        try {
          const status = await fetchMessageStatus(messageId);
          setSendProgress({ messageId, ...status });
          if (status.status === 'completed' || status.status === 'cancelled') {
            clearInterval(poll);
            setSending(false);
            toast.success(`Message sending complete: ${status.sentCount} sent, ${status.failedCount} failed`);
          }
        } catch {
          clearInterval(poll);
          setSending(false);
        }
      }, 1000);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSend = () => {
    if (!content.trim()) { toast.error('Message content is required'); return; }
    if (recipients.length === 0) { toast.error('No recipients selected'); return; }
    if (!confirm(`Send to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} via ${serviceType}?`)) return;
    sendMutation.mutate();
  };

  const toggleExclude = (id: number) => {
    setExcludeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleIndividual = (id: number) => {
    setSelectedIndividualIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const progressPercent = sendProgress
    ? ((sendProgress.sentCount + sendProgress.failedCount + sendProgress.skippedCount) / sendProgress.totalRecipients) * 100
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold">Compose Message</h2>

      {/* Sending progress overlay */}
      {sending && sendProgress && (
        <Card className="border-primary">
          <CardHeader><CardTitle>Sending in progress...</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progressPercent} />
            <div className="flex gap-4 text-sm">
              <span>Sent: {sendProgress.sentCount}</span>
              <span>Failed: {sendProgress.failedCount}</span>
              <span>Total: {sendProgress.totalRecipients}</span>
            </div>
            <Button variant="outline" onClick={() => navigate(`/messages/${sendProgress.messageId}`)}>View Details</Button>
          </CardContent>
        </Card>
      )}

      {!sending && (
        <>
          {/* Service type */}
          <div className="space-y-2">
            <Label>Delivery Method</Label>
            <Select value={serviceType} onValueChange={v => setServiceType(v as 'iMessage' | 'SMS')}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iMessage">iMessage</SelectItem>
                <SelectItem value="SMS">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Recipient selection */}
          <div className="space-y-2">
            <Label>Recipients</Label>
            <Select value={recipientMode} onValueChange={v => setRecipientMode(v as 'group' | 'individual')}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Send to Group</SelectItem>
                <SelectItem value="individual">Select Individuals</SelectItem>
              </SelectContent>
            </Select>

            {recipientMode === 'group' && (
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Choose a group..." />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map(g => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name} ({g.memberCount})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {recipientMode === 'individual' && allPeople && (
              <div className="border rounded-md max-h-48 overflow-auto p-2 space-y-1">
                {allPeople.data.map(p => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={selectedIndividualIds.has(p.id)} onCheckedChange={() => toggleIndividual(p.id)} />
                    {[p.firstName, p.lastName].filter(Boolean).join(' ')}
                    <span className="text-muted-foreground ml-auto">{p.phoneDisplay}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Exclusion list for group mode */}
          {recipientMode === 'group' && groupDetail && groupDetail.members.length > 0 && (
            <div className="space-y-2">
              <Label>Exclude from send (optional)</Label>
              <div className="border rounded-md max-h-48 overflow-auto p-2 space-y-1">
                {groupDetail.members.map(m => (
                  <label key={m.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                    <Checkbox checked={excludeIds.has(m.id)} onCheckedChange={() => toggleExclude(m.id)} />
                    <span className={excludeIds.has(m.id) ? 'line-through text-muted-foreground' : ''}>
                      {[m.firstName, m.lastName].filter(Boolean).join(' ')}
                    </span>
                    <span className="text-muted-foreground ml-auto">{m.phoneDisplay}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Message editor */}
          <div className="space-y-2">
            <Label>Message</Label>
            <div className="flex gap-2 mb-2">
              <Button variant="outline" size="sm" onClick={() => setContent(c => c + '{{firstName}}')}>{'{{firstName}}'}</Button>
              <Button variant="outline" size="sm" onClick={() => setContent(c => c + '{{lastName}}')}>{'{{lastName}}'}</Button>
              <Button variant="outline" size="sm" onClick={() => setContent(c => c + '{{fullName}}')}>{'{{fullName}}'}</Button>
            </div>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              placeholder="Type your message here. Use template variables for personalization..."
            />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{charCount} characters</span>
              {isSms && charCount > 160 && (
                <span className="text-orange-500">
                  SMS: {Math.ceil(charCount / 160)} segments
                </span>
              )}
            </div>
          </div>

          {/* Preview */}
          {content && previewPerson && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />Preview (for {previewPerson.firstName || 'first recipient'})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{renderedPreview}</p>
              </CardContent>
            </Card>
          )}

          {/* Batch settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Batch Size</Label>
              <Input type="number" min={1} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} />
            </div>
            <div>
              <Label>Delay Between Batches (ms)</Label>
              <Input type="number" min={1000} step={1000} value={batchDelayMs} onChange={e => setBatchDelayMs(Number(e.target.value))} />
            </div>
          </div>

          {/* Summary & send */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Sending to <Badge variant="secondary">{recipients.length}</Badge> of{' '}
                <Badge variant="outline">{allRecipientIds.length}</Badge> people via{' '}
                <Badge variant={serviceType === 'iMessage' ? 'default' : 'secondary'}>{serviceType}</Badge>
              </p>
              {excludeIds.size > 0 && (
                <p className="text-sm text-muted-foreground">{excludeIds.size} excluded</p>
              )}
            </div>
            <Button size="lg" onClick={handleSend} disabled={sendMutation.isPending || recipients.length === 0 || !content.trim()}>
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? 'Starting...' : 'Send Message'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
