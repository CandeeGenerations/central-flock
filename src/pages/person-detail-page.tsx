import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPerson, updatePerson, deletePerson, createMacContact, type Person } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Save, Trash2, Contact, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Person>>({});

  const { data: person, isLoading } = useQuery({
    queryKey: ['person', id],
    queryFn: () => fetchPerson(Number(id)),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Person>) => updatePerson(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', id] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      setEditing(false);
      toast.success('Person updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePerson(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      navigate('/people');
      toast.success('Person deleted');
    },
  });

  const contactMutation = useMutation({
    mutationFn: () => createMacContact(Number(id)),
    onSuccess: () => toast.success('Contact created in macOS Contacts'),
    onError: (err: Error) => toast.error(err.message),
  });

  const startEditing = () => {
    if (person) {
      setForm({
        firstName: person.firstName,
        lastName: person.lastName,
        phoneNumber: person.phoneNumber,
        phoneDisplay: person.phoneDisplay,
        notes: person.notes,
      });
      setEditing(true);
    }
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!person) return <div className="p-6">Person not found</div>;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/people')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">
          {[person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unnamed'}
        </h2>
        <Badge variant={person.status === 'active' ? 'default' : 'secondary'}>{person.status}</Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Details</CardTitle>
          <div className="flex gap-2">
            {!editing && <Button variant="outline" size="sm" onClick={startEditing}>Edit</Button>}
            <Button variant="outline" size="sm" onClick={() => contactMutation.mutate()} disabled={contactMutation.isPending}>
              <Contact className="h-4 w-4 mr-1" />Create Contact
            </Button>
            <Link to={`/messages/compose?recipientId=${person.id}`}>
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-1" />Send Message
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input value={form.firstName || ''} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={form.lastName || ''} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone Number (E.164)</Label>
                  <Input value={form.phoneNumber || ''} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>Display Format</Label>
                  <Input value={form.phoneDisplay || ''} onChange={e => setForm(f => ({ ...f, phoneDisplay: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}>
                  <Save className="h-4 w-4 mr-1" />{updateMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-sm text-muted-foreground">First Name</span><p>{person.firstName || '—'}</p></div>
                <div><span className="text-sm text-muted-foreground">Last Name</span><p>{person.lastName || '—'}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-sm text-muted-foreground">Phone</span><p>{person.phoneDisplay || person.phoneNumber}</p></div>
                <div><span className="text-sm text-muted-foreground">E.164</span><p className="font-mono text-sm">{person.phoneNumber}</p></div>
              </div>
              {person.notes && (
                <div><span className="text-sm text-muted-foreground">Notes</span><p>{person.notes}</p></div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Groups */}
      <Card>
        <CardHeader>
          <CardTitle>Groups</CardTitle>
        </CardHeader>
        <CardContent>
          {person.groups && person.groups.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {person.groups.map(g => (
                <Link key={g.id} to={`/groups/${g.id}`}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent">{g.name}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Not a member of any groups</p>
          )}
        </CardContent>
      </Card>

      {/* Delete */}
      <div className="pt-4">
        <Button
          variant="destructive"
          onClick={() => { if (confirm('Permanently delete this person? This cannot be undone.')) deleteMutation.mutate(); }}
        >
          <Trash2 className="h-4 w-4 mr-1" />Delete Person
        </Button>
      </div>
    </div>
  );
}
