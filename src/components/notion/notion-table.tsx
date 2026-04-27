import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import type {NotionTable as NotionTableData} from '@/lib/notion-api'
import {cn} from '@/lib/utils'
import {Link} from 'react-router-dom'

const NOTION_COLOR_TO_BG: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  gray: 'bg-muted text-muted-foreground',
  brown: 'bg-amber-900/20 text-amber-200',
  orange: 'bg-orange-500/20 text-orange-200',
  yellow: 'bg-yellow-500/20 text-yellow-200',
  green: 'bg-green-500/20 text-green-200',
  blue: 'bg-blue-500/20 text-blue-200',
  purple: 'bg-purple-500/20 text-purple-200',
  pink: 'bg-pink-500/20 text-pink-200',
  red: 'bg-red-500/20 text-red-200',
}

interface RichText {
  plain_text: string
}

function pill(name: string, color: string | undefined) {
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-xs',
        NOTION_COLOR_TO_BG[color ?? 'default'] ?? NOTION_COLOR_TO_BG.default,
      )}
    >
      {name}
    </span>
  )
}

function joinRich(arr: RichText[] | undefined): string {
  return (arr ?? []).map((t) => t.plain_text).join('')
}

function formatDate(d: {start?: string; end?: string | null} | null | undefined): string {
  if (!d?.start) return ''
  const fmt = (iso: string) => {
    const hasTime = iso.includes('T')
    const date = new Date(iso)
    if (isNaN(date.getTime())) return iso
    return hasTime ? date.toLocaleString() : date.toLocaleDateString()
  }
  return d.end ? `${fmt(d.start)} → ${fmt(d.end)}` : fmt(d.start)
}

function renderProperty(value: unknown, columnType: string, rowId: string): React.ReactNode {
  if (value === null || value === undefined) return null
  const v = value as Record<string, unknown>
  const type = (v.type as string) ?? columnType

  switch (type) {
    case 'title': {
      const text = joinRich(v.title as RichText[]) || 'Untitled'
      return (
        <Link to={`/notion/page/${rowId}`} className="text-primary hover:underline font-medium">
          {text}
        </Link>
      )
    }
    case 'rich_text':
      return joinRich(v.rich_text as RichText[])
    case 'number':
      return v.number === null || v.number === undefined ? '' : String(v.number)
    case 'select': {
      const sel = v.select as {name: string; color?: string} | null
      return sel ? pill(sel.name, sel.color) : ''
    }
    case 'multi_select': {
      const arr = (v.multi_select as {name: string; color?: string}[]) ?? []
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((s, i) => (
            <span key={i}>{pill(s.name, s.color)}</span>
          ))}
        </div>
      )
    }
    case 'status': {
      const s = v.status as {name: string; color?: string} | null
      return s ? pill(s.name, s.color) : ''
    }
    case 'date':
      return formatDate(v.date as {start?: string; end?: string | null} | null)
    case 'checkbox':
      return v.checkbox ? '✓' : ''
    case 'url': {
      const url = v.url as string | null
      return url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {url}
        </a>
      ) : (
        ''
      )
    }
    case 'email':
      return (v.email as string | null) ?? ''
    case 'phone_number':
      return (v.phone_number as string | null) ?? ''
    case 'created_time':
      return formatDate({start: v.created_time as string})
    case 'last_edited_time':
      return formatDate({start: v.last_edited_time as string})
    case 'people': {
      const arr = (v.people as {name?: string}[]) ?? []
      return arr.map((p) => p.name ?? '?').join(', ')
    }
    case 'files': {
      const arr = (v.files as {name?: string}[]) ?? []
      return arr.map((f) => f.name ?? 'file').join(', ')
    }
    case 'relation': {
      const arr = (v.relation as {id: string}[]) ?? []
      return arr.length > 0 ? `${arr.length} linked` : ''
    }
    case 'formula': {
      const f = v.formula as {type: string} & Record<string, unknown>
      if (!f) return ''
      if (f.type === 'string') return (f.string as string) ?? ''
      if (f.type === 'number') return f.number === null ? '' : String(f.number)
      if (f.type === 'boolean') return f.boolean ? '✓' : ''
      if (f.type === 'date') return formatDate(f.date as {start?: string; end?: string | null})
      return ''
    }
    case 'rollup':
      return <span className="text-muted-foreground italic text-xs">[rollup]</span>
    default:
      return <span className="text-muted-foreground italic text-xs">[{type}]</span>
  }
}

export function NotionTableView({table}: {table: NotionTableData}) {
  if (table.rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic">This database is empty.</p>
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {table.columns.map((c) => (
              <TableHead key={c.key} className="whitespace-nowrap">
                {c.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.id}>
              {table.columns.map((c) => (
                <TableCell key={c.key} className="align-top">
                  {renderProperty(row.values[c.key], c.type, row.id)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
