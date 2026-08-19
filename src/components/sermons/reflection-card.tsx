import {RankBadge, SensitiveBadge} from '@/components/sermons/rank-badges'
import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Textarea} from '@/components/ui/textarea'
import {type Reflection, updateReflection} from '@/lib/sermons-api'
import {cn} from '@/lib/utils'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {Check, Copy, Heart, Pencil, X} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

export function ReflectionCard({sermonId, reflection}: {sermonId: number; reflection: Reflection}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const displayed = reflection.editedBody || reflection.body

  const saveMutation = useMutation({
    mutationFn: (data: {editedBody?: string | null; used?: boolean; favorite?: boolean}) =>
      updateReflection(sermonId, reflection.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['sermons', 'detail', sermonId]})
      setEditing(false)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Save failed'),
  })

  return (
    <Card size="sm" className={cn(reflection.used && 'opacity-60', reflection.favorite && 'border-red-300')}>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 h-7 w-7"
            aria-label={reflection.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => saveMutation.mutate({favorite: !reflection.favorite})}
          >
            <Heart className={cn('h-4 w-4', reflection.favorite && 'fill-red-500 text-red-500')} />
          </Button>
          <RankBadge tier={reflection.rankTier} note={reflection.rankNote} />
          {reflection.sensitive && <SensitiveBadge reason={reflection.sensitiveReason} />}
          <span className="ml-auto text-xs text-muted-foreground">{displayed.trim().split(/\s+/).length} words</span>
        </div>

        {editing ? (
          <div className="space-y-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate({editedBody: draft})}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {reflection.editedBody && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  onClick={() => saveMutation.mutate({editedBody: null})}
                >
                  Revert to generated
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{displayed}</p>
        )}

        {reflection.editedBody && !editing && <p className="text-xs text-muted-foreground">Edited by you</p>}

        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigator.clipboard.writeText(displayed).then(() => toast.success('Copied'))}
          >
            <Copy className="h-4 w-4 mr-1" /> Copy
          </Button>
          {!editing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(displayed)
                setEditing(true)
              }}
            >
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
          <Button
            variant={reflection.used ? 'secondary' : 'ghost'}
            size="sm"
            className="ml-auto"
            onClick={() => saveMutation.mutate({used: !reflection.used})}
          >
            {reflection.used ? <X className="h-4 w-4 mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            {reflection.used ? 'Mark unused' : 'Mark used'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
