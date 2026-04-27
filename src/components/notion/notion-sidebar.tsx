import {Button} from '@/components/ui/button'
import {SearchInput} from '@/components/ui/search-input'
import {type NotionPage, buildTree, fetchNotionStatus, fetchNotionTree, triggerNotionSync} from '@/lib/notion-api'
import {queryKeys} from '@/lib/query-keys'
import {cn} from '@/lib/utils'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ChevronDown, ChevronRight, Database, FileText, Folder, RotateCw} from 'lucide-react'
import {useMemo, useState} from 'react'
import {Link, useParams} from 'react-router-dom'
import {toast} from 'sonner'

function formatRelative(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.round(hr / 24)
  return `${days}d ago`
}

export function NotionSidebar() {
  const {id} = useParams<{id?: string}>()
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')

  const {data: pages, isLoading} = useQuery({
    queryKey: queryKeys.notionTree,
    queryFn: fetchNotionTree,
    staleTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  const {data: status} = useQuery({
    queryKey: queryKeys.notionStatus,
    queryFn: fetchNotionStatus,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const syncMutation = useMutation({
    mutationFn: triggerNotionSync,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Synced ${r.pages} pages from Notion`)
        qc.invalidateQueries({queryKey: queryKeys.notionTree})
        qc.invalidateQueries({queryKey: queryKeys.notionStatus})
      } else {
        toast.error(r.error || 'Sync failed')
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Sync failed'),
  })

  const tree = useMemo(() => (pages ? buildTree(pages) : null), [pages])

  const filteredIds = useMemo(() => {
    if (!filter.trim() || !pages) return null
    const q = filter.toLowerCase()
    const matched = new Set<string>()
    const byId = new Map(pages.map((p) => [p.id, p]))
    for (const p of pages) {
      if (p.title.toLowerCase().includes(q)) {
        matched.add(p.id)
        // include ancestors so they render as the path to the match
        let cur = p.parentId
        while (cur && byId.has(cur) && !matched.has(cur)) {
          matched.add(cur)
          cur = byId.get(cur)!.parentId
        }
      }
    }
    return matched
  }, [filter, pages])

  return (
    <aside className="w-72 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col h-full">
      <div className="p-3 border-b border-sidebar-border space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Notion</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            title="Refresh from Notion"
          >
            <RotateCw className={cn('h-4 w-4', syncMutation.isPending && 'animate-spin')} />
          </Button>
        </div>
        <SearchInput value={filter} onChange={setFilter} placeholder="Filter pages…" />
        <div className="text-[11px] text-muted-foreground">
          {status?.lastSyncError ? (
            <span className="text-destructive">Sync error: {status.lastSyncError}</span>
          ) : (
            <span>Synced {formatRelative(status?.lastSyncedAt ?? null)}</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && <div className="text-sm text-muted-foreground p-2">Loading…</div>}
        {tree?.roots.length === 0 && (
          <div className="text-sm text-muted-foreground p-2">
            No pages yet. Make sure your Notion root page is shared with the integration, then click ↻.
          </div>
        )}
        {tree && (
          <ul className="space-y-0.5">
            {tree.roots.map((p) => (
              <NotionTreeNode
                key={p.id}
                page={p}
                childrenByParent={tree.childrenByParent}
                activeId={id}
                visibleIds={filteredIds}
                depth={0}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function NotionTreeNode({
  page,
  childrenByParent,
  activeId,
  visibleIds,
  depth,
}: {
  page: NotionPage
  childrenByParent: Map<string, NotionPage[]>
  activeId: string | undefined
  visibleIds: Set<string> | null
  depth: number
}) {
  const children = childrenByParent.get(page.id) ?? []
  const filteringActive = visibleIds !== null
  const [expanded, setExpanded] = useState(filteringActive || depth < 1)

  if (filteringActive && !visibleIds.has(page.id)) return null

  const isActive = page.id === activeId
  const visibleChildren = filteringActive ? children.filter((c) => visibleIds.has(c.id)) : children

  return (
    <li>
      <div className="flex items-center gap-1">
        {visibleChildren.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-6 w-6 items-center justify-center hover:bg-sidebar-accent/50 rounded shrink-0"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <Link
          to={`/notion/page/${page.id}`}
          className={cn(
            'flex items-center gap-2 flex-1 px-2 py-1 rounded text-sm transition-colors min-w-0',
            isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
          )}
          style={{paddingLeft: `${0.5 + depth * 0.25}rem`}}
        >
          <PageIcon page={page} />
          <span className="truncate">{page.title}</span>
        </Link>
      </div>
      {expanded && visibleChildren.length > 0 && (
        <ul className="space-y-0.5">
          {visibleChildren.map((c) => (
            <NotionTreeNode
              key={c.id}
              page={c}
              childrenByParent={childrenByParent}
              activeId={activeId}
              visibleIds={visibleIds}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function PageIcon({page}: {page: NotionPage}) {
  if (page.icon) {
    if (/^https?:\/\//.test(page.icon)) {
      return <img src={page.icon} alt="" className="h-4 w-4 rounded shrink-0" />
    }
    return <span className="text-sm leading-none shrink-0">{page.icon}</span>
  }
  if (page.isDatabase) return <Database className="h-3.5 w-3.5 shrink-0 opacity-70" />
  if (page.isFolder) return <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
  return <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
}
