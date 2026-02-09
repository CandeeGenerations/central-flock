import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchGroups, createGroup, deleteGroup } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Plus, Users, Trash2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export function GroupsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: fetchGroups,
  });

  const createMutation = useMutation({
    mutationFn: () => createGroup({ name: newGroup.name, description: newGroup.description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setAddOpen(false);
      setNewGroup({ name: '', description: '' });
      toast.success('Group created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      toast.success('Group deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Groups</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Create Group</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={newGroup.name} onChange={e => setNewGroup(g => ({ ...g, name: e.target.value }))} />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input value={newGroup.description} onChange={e => setNewGroup(g => ({ ...g, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !newGroup.name.trim()}>
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups?.map(group => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link to={`/groups/${group.id}`}>
                    <CardTitle className="text-lg hover:underline cursor-pointer">{group.name}</CardTitle>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      if (confirm(`Delete group "${group.name}"? Members will not be deleted.`))
                        deleteMutation.mutate(group.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {group.description && <p className="text-sm text-muted-foreground mb-3">{group.description}</p>}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {group.memberCount} member{group.memberCount !== 1 ? 's' : ''}
                  </div>
                  <Link to={`/messages/compose?groupId=${group.id}`}>
                    <Button variant="outline" size="sm">
                      <MessageSquare className="h-3 w-3 mr-1" />Message
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {groups?.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              No groups yet. Create one or import from CSV.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
