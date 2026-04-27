import {NotionBlockRenderer} from '@/components/notion/notion-block-renderer'
import {NotionTableView} from '@/components/notion/notion-table'
import {Button} from '@/components/ui/button'
import {PageSpinner} from '@/components/ui/spinner'
import {fetchNotionPage} from '@/lib/notion-api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useQuery} from '@tanstack/react-query'
import {ExternalLink, NotebookText} from 'lucide-react'
import {useParams} from 'react-router-dom'

function notionAppUrl(id: string): string {
  return `notion://www.notion.so/${id.replace(/-/g, '')}`
}

export function NotionDetailPage() {
  const {id = ''} = useParams<{id: string}>()
  const {data, isLoading, error} = useQuery({
    queryKey: queryKeys.notionPage(id),
    queryFn: () => fetchNotionPage(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })

  if (isLoading) return <PageSpinner />
  if (error)
    return (
      <div className="p-6 text-sm text-destructive">
        Failed to load page: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    )
  if (!data) return null

  return (
    <div className={cn('p-6 space-y-4', data.isDatabase ? 'max-w-none' : 'max-w-3xl mx-auto')}>
      <div className="flex items-start gap-3">
        {data.icon &&
          (/^https?:\/\//.test(data.icon) ? (
            <img src={data.icon} alt="" className="h-7 w-7 rounded" />
          ) : (
            <span className="text-2xl leading-none">{data.icon}</span>
          ))}
        <h1 className="text-3xl font-bold flex-1">{data.title}</h1>
      </div>

      <div className="flex gap-2">
        <Button asChild variant="default" size="sm">
          <a href={notionAppUrl(data.id)}>
            <NotebookText className="h-4 w-4" />
            Open in Notion
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={data.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open in browser
          </a>
        </Button>
      </div>

      <hr className="border-muted-foreground/20" />

      {data.isDatabase && data.table ? (
        <NotionTableView key={data.id} table={data.table} />
      ) : data.blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">This page is empty.</p>
      ) : (
        <NotionBlockRenderer blocks={data.blocks} />
      )}

      <div className="text-[11px] text-muted-foreground pt-6">
        Last edited in Notion {new Date(data.lastEditedTime).toLocaleString()}
      </div>
    </div>
  )
}
