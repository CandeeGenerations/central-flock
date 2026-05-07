import {Badge} from '@/components/ui/badge'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {formatDate} from '@/lib/date'
import {SERVICE_TYPE_LABELS, SPECIAL_STATUS_LABELS, specialsApi} from '@/lib/specials-api'
import {useQuery} from '@tanstack/react-query'
import {Music} from 'lucide-react'
import {Link} from 'react-router-dom'

export function PersonSpecialsCard({personId}: {personId: number}) {
  const {data} = useQuery({
    queryKey: ['specials-by-person', personId],
    queryFn: () => specialsApi.byPerson(personId),
  })

  if (!data || data.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Music className="h-4 w-4" /> Specials performed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((s) => (
          <Link
            key={s.id}
            to={`/music/specials/${s.id}`}
            className="flex items-center justify-between border rounded-md p-2 hover:bg-accent text-sm"
          >
            <div>
              <div className="font-medium">{s.songTitle}</div>
              <div className="text-xs text-muted-foreground">
                {formatDate(s.date)} · {SERVICE_TYPE_LABELS[s.serviceType]}
              </div>
            </div>
            <Badge variant="secondary">{SPECIAL_STATUS_LABELS[s.status]}</Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
