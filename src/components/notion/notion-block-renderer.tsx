import type {NotionBlock} from '@/lib/notion-api'
import {cn} from '@/lib/utils'

interface RichText {
  plain_text: string
  href: string | null
  annotations: {
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
    code: boolean
    color: string
  }
}

function renderRichText(text: RichText[] | undefined): React.ReactNode {
  if (!text || text.length === 0) return null
  return text.map((t, i) => {
    const a = t.annotations
    const className = cn(
      a.bold && 'font-bold',
      a.italic && 'italic',
      a.underline && 'underline',
      a.strikethrough && 'line-through',
      a.code && 'rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]',
    )
    const node = className ? <span className={className}>{t.plain_text}</span> : <>{t.plain_text}</>
    if (t.href) {
      return (
        <a key={i} href={t.href} target="_blank" rel="noreferrer" className="text-primary underline">
          {node}
        </a>
      )
    }
    return <span key={i}>{node}</span>
  })
}

function getRichText(block: NotionBlock): RichText[] | undefined {
  const inner = (block as Record<string, unknown>)[block.type]
  if (inner && typeof inner === 'object' && 'rich_text' in inner) {
    return (inner as {rich_text: RichText[]}).rich_text
  }
  return undefined
}

function getInner<T = Record<string, unknown>>(block: NotionBlock): T {
  return ((block as Record<string, unknown>)[block.type] as T) ?? ({} as T)
}

export function NotionBlockRenderer({blocks}: {blocks: NotionBlock[]}) {
  // Group consecutive list items so we can wrap them in <ul>/<ol>.
  const groups: {type: 'ul' | 'ol' | 'block'; blocks: NotionBlock[]}[] = []
  for (const block of blocks) {
    const isUl = block.type === 'bulleted_list_item'
    const isOl = block.type === 'numbered_list_item'
    const last = groups[groups.length - 1]
    if (isUl && last?.type === 'ul') last.blocks.push(block)
    else if (isOl && last?.type === 'ol') last.blocks.push(block)
    else if (isUl) groups.push({type: 'ul', blocks: [block]})
    else if (isOl) groups.push({type: 'ol', blocks: [block]})
    else groups.push({type: 'block', blocks: [block]})
  }

  return (
    <div className="space-y-3">
      {groups.map((group, i) => {
        if (group.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-6 space-y-1">
              {group.blocks.map((b) => (
                <li key={b.id}>{renderRichText(getRichText(b))}</li>
              ))}
            </ul>
          )
        }
        if (group.type === 'ol') {
          return (
            <ol key={i} className="list-decimal pl-6 space-y-1">
              {group.blocks.map((b) => (
                <li key={b.id}>{renderRichText(getRichText(b))}</li>
              ))}
            </ol>
          )
        }
        return <SingleBlock key={group.blocks[0].id} block={group.blocks[0]} />
      })}
    </div>
  )
}

function SingleBlock({block}: {block: NotionBlock}) {
  switch (block.type) {
    case 'paragraph':
      return <p className="leading-relaxed">{renderRichText(getRichText(block)) ?? ' '}</p>
    case 'heading_1':
      return <h1 className="text-2xl font-bold mt-4">{renderRichText(getRichText(block))}</h1>
    case 'heading_2':
      return <h2 className="text-xl font-semibold mt-3">{renderRichText(getRichText(block))}</h2>
    case 'heading_3':
      return <h3 className="text-lg font-semibold mt-2">{renderRichText(getRichText(block))}</h3>
    case 'quote':
      return (
        <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground">
          {renderRichText(getRichText(block))}
        </blockquote>
      )
    case 'callout': {
      const inner = getInner<{icon?: {emoji?: string}}>(block)
      return (
        <div className="rounded-md bg-muted/50 p-3 flex gap-3">
          {inner.icon?.emoji && <span className="text-lg leading-none">{inner.icon.emoji}</span>}
          <div className="flex-1">{renderRichText(getRichText(block))}</div>
        </div>
      )
    }
    case 'code': {
      const inner = getInner<{language?: string}>(block)
      return (
        <pre className="rounded-md bg-muted p-3 text-sm font-mono overflow-x-auto">
          <code>
            {getRichText(block)
              ?.map((t) => t.plain_text)
              .join('') ?? ''}
          </code>
          {inner.language && <span className="block text-[10px] opacity-50 mt-2">{inner.language}</span>}
        </pre>
      )
    }
    case 'divider':
      return <hr className="border-muted-foreground/20" />
    case 'to_do': {
      const inner = getInner<{checked: boolean}>(block)
      return (
        <div className="flex gap-2 items-start">
          <input type="checkbox" checked={inner.checked ?? false} readOnly className="mt-1" />
          <span className={inner.checked ? 'line-through text-muted-foreground' : undefined}>
            {renderRichText(getRichText(block))}
          </span>
        </div>
      )
    }
    case 'image': {
      const inner = getInner<{external?: {url: string}; file?: {url: string}; caption?: RichText[]}>(block)
      const src = inner.external?.url ?? inner.file?.url
      if (!src) return null
      return (
        <figure>
          <img src={src} alt="" className="rounded-md max-w-full" />
          {inner.caption && inner.caption.length > 0 && (
            <figcaption className="text-sm text-muted-foreground mt-1">{renderRichText(inner.caption)}</figcaption>
          )}
        </figure>
      )
    }
    case 'child_page':
    case 'child_database':
      return null // rendered via the sidebar tree, skip inline
    case 'toggle':
      return (
        <details className="border-l-2 border-muted-foreground/20 pl-3">
          <summary className="cursor-pointer">{renderRichText(getRichText(block))}</summary>
          {block.has_children && (
            <p className="text-xs text-muted-foreground mt-2">Open in Notion to view nested content.</p>
          )}
        </details>
      )
    default:
      return <div className="text-xs text-muted-foreground italic">[{block.type} — open in Notion to view]</div>
  }
}
