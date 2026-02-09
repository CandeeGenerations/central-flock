import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGroup, updateGroup, deleteGroup, addGroupMembers, removeGroupMembers, fetchNonMembers, type Person } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Save, Trash2, UserPlus, UserMinus, MessageSquare, Search } from 'lucide-react';
import { toast } from 'sonner';

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groupId = Number(id);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => fetchGroup(groupId),
    enabled: !!id,
  });

  const { data: nonMembers } = useQuery({
    queryKey: ['nonMembers', id, memberSearch],
    queryFn: () => fetchNonMembers(groupId, memberSearch || undefined),
    enabled: addMembersOpen,
  });

  const updateMutation = useMutation({
    mutationFn: () => updateGroup(groupId, form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setEditing(false);
      toast.success('Group updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteGroup(groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      navigate('/groups');
      toast.success('Group deleted');
    },
  });

  const addMembersMutation = useMutation({
    mutationFn: (personIds: number[]) => addGroupMembers(groupId, personIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['nonMembers'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setSelectedIds(new Set());
      setAddMembersOpen(false);
      toast.success('Members added');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (personId: number) => removeGroupMembers(groupId, [personId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group', id] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Member removed');
    },
  });

  const startEditing = () => {
    if (group) {
      setForm({ name: group.name, description: group.description || '' });
      setEditing(true);
    }
  };

  const toggleSelected = (personId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId); else next.add(personId);
      return next;
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!group) return <div className="p-6">Group not found</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/groups')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{group.name}</h2>
        <Badge variant="outline">{group.members.length} members</Badge>
      </div>

      {/* Group info */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Group Info</CardTitle>
          <div className="flex gap-2">
            {!editing && <Button variant="outline" size="sm" onClick={startEditing}>Edit</Button>}
            <Link to={`/messages/compose?groupId=${group.id}`}>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-1" />Send Message
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div className="flex gap-2">
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 mr-1" />Save
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{group.description || 'No description'}</p>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Members</CardTitle>
          <Button size="sm" onClick={() => setAddMembersOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" />Add Members
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.members.map((m: Person) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link to={`/people/${m.id}`} className="font-medium hover:underline">
                      {[m.firstName, m.lastName].filter(Boolean).join(' ') || 'Unnamed'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.phoneDisplay || m.phoneNumber}</TableCell>
                  <TableCell><Badge variant={m.status === 'active' ? 'default' : 'secondary'}>{m.status}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeMemberMutation.mutate(m.id)} title="Remove from group">
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {group.members.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No members</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete */}
      <Button variant="destructive" onClick={() => { if (confirm('Delete this group? Members will not be deleted.')) deleteMutation.mutate(); }}>
        <Trash2 className="h-4 w-4 mr-1" />Delete Group
      </Button>

      {/* Add members dialog */}
      <Dialog open={addMembersOpen} onOpenChange={setAddMembersOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Members to {group.name}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search people..."
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex-1 overflow-auto space-y-1 min-h-0 max-h-64">
            {nonMembers?.map(p => (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-accent cursor-pointer">
                <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelected(p.id)} />
                <span className="flex-1">{[p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unnamed'}</span>
                <span className="text-sm text-muted-foreground">{p.phoneDisplay}</span>
              </label>
            ))}
            {nonMembers?.length === 0 && (
              <p className="text-center text-muted-foreground py-4">No people to add</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMembersOpen(false)}>Cancel</Button>
            <Button
              disabled={selectedIds.size === 0 || addMembersMutation.isPending}
              onClick={() => addMembersMutation.mutate([...selectedIds])}
            >
              Add {selectedIds.size} Member{selectedIds.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
