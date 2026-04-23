/**
 * Converts a note's contentJson (BlockNote block array) into an HTML string
 * suitable for printing / PDF export, then opens a styled print window.
 *
 * Uses native browser print so the PDF contains real, selectable text —
 * not a rasterized image like the html2canvas approach used elsewhere.
 */

// ---------------------------------------------------------------------------
// BlockNote JSON types (minimal — only what we need to serialise)
// ---------------------------------------------------------------------------

type TextStyle = {
  bold?: true
  italic?: true
  underline?: true
  strikethrough?: true
  code?: true
}

type TextNode = {type: 'text'; text: string; styles: TextStyle}
type LinkNode = {type: 'link'; href: string; content: TextNode[]}
type InlineNode = TextNode | LinkNode

type Block = {
  type: string
  props?: Record<string, unknown>
  content?: InlineNode[]
  children?: Block[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inlineToHtml(node: InlineNode): string {
  if (node.type === 'link') {
    const inner = node.content.map(inlineToHtml).join('')
    return `<a href="${esc(node.href)}">${inner}</a>`
  }
  let text = esc(node.text)
  const s = node.styles
  if (s.code) text = `<code>${text}</code>`
  if (s.bold) text = `<strong>${text}</strong>`
  if (s.italic) text = `<em>${text}</em>`
  if (s.underline) text = `<u>${text}</u>`
  if (s.strikethrough) text = `<s>${text}</s>`
  return text
}

function blocksToHtml(blocks: Block[]): string {
  const out: string[] = []
  let i = 0

  while (i < blocks.length) {
    const b = blocks[i]

    // Collect consecutive bullet list items into one <ul>
    if (b.type === 'bulletListItem') {
      const items: string[] = []
      while (i < blocks.length && blocks[i].type === 'bulletListItem') {
        const item = blocks[i]
        const inner = (item.content ?? []).map(inlineToHtml).join('')
        items.push(`<li>${inner}${item.children?.length ? `<ul>${blocksToHtml(item.children)}</ul>` : ''}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // Collect consecutive numbered list items into one <ol>
    if (b.type === 'numberedListItem') {
      const items: string[] = []
      while (i < blocks.length && blocks[i].type === 'numberedListItem') {
        const item = blocks[i]
        const inner = (item.content ?? []).map(inlineToHtml).join('')
        items.push(`<li>${inner}${item.children?.length ? `<ol>${blocksToHtml(item.children)}</ol>` : ''}</li>`)
        i++
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    const inner = (b.content ?? []).map(inlineToHtml).join('')
    const kids = b.children?.length ? `<blockquote>${blocksToHtml(b.children)}</blockquote>` : ''

    switch (b.type) {
      case 'paragraph':
        out.push(inner ? `<p>${inner}</p>${kids}` : `<p><br></p>`)
        break
      case 'heading': {
        const lvl = Math.min(Math.max(Number(b.props?.level ?? 1), 1), 3)
        out.push(`<h${lvl}>${inner}</h${lvl}>${kids}`)
        break
      }
      case 'image': {
        const url = String(b.props?.url ?? '')
        const caption = String(b.props?.caption ?? '')
        out.push(
          `<figure><img src="${esc(url)}" alt="${esc(caption)}" style="max-width:100%">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`,
        )
        break
      }
      case 'codeBlock': {
        const code = (b.content ?? []).map((n) => (n as TextNode).text ?? '').join('')
        out.push(`<pre><code>${esc(code)}</code></pre>`)
        break
      }
      case 'checkListItem': {
        const checked = b.props?.checked === true
        out.push(`<p><input type="checkbox"${checked ? ' checked' : ''} disabled> ${inner}</p>`)
        break
      }
      case 'table': {
        // BlockNote tables have rows in children[].content as tableCell blocks
        const rows = (b.children ?? [])
          .map((row) => {
            const cells = (row.children ?? [])
              .map((cell) => {
                const cellInner = (cell.content ?? []).map(inlineToHtml).join('')
                return `<td>${cellInner}</td>`
              })
              .join('')
            return `<tr>${cells}</tr>`
          })
          .join('')
        out.push(`<table border="1" cellpadding="4" cellspacing="0">${rows}</table>`)
        break
      }
      default:
        // Unknown block type — render inner text as a paragraph
        if (inner) out.push(`<p>${inner}</p>`)
    }

    i++
  }

  return out.join('\n')
}

function parseBlocks(contentJson: string | null | undefined): Block[] {
  if (!contentJson) return []
  try {
    const parsed: unknown = JSON.parse(contentJson)
    if (Array.isArray(parsed)) return parsed as Block[]
  } catch {
    /* plain text */
  }
  // Plain-text fallback: one paragraph per line
  return contentJson.split('\n').map((line) => ({
    type: 'paragraph',
    content: line ? [{type: 'text' as const, text: line, styles: {}}] : [],
  }))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const PRINT_STYLES = `
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.6;
  color: #111;
  max-width: 700px;
  margin: 2rem auto;
  padding: 0 1rem;
}
h1.note-title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 1.5rem;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 0.75rem;
}
h1, h2, h3 { font-weight: 600; line-height: 1.3; margin: 1.25rem 0 0.5rem; }
h1 { font-size: 1.6rem; }
h2 { font-size: 1.3rem; }
h3 { font-size: 1.1rem; }
p { margin: 0.4rem 0; }
ul, ol { margin: 0.4rem 0; padding-left: 1.5rem; }
li { margin: 0.2rem 0; }
code {
  font-family: "SF Mono", SFMono-Regular, Menlo, monospace;
  background: #f4f4f4;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.88em;
}
pre {
  background: #f4f4f4;
  padding: 0.75rem 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.88em;
}
pre code { background: none; padding: 0; }
img { max-width: 100%; height: auto; }
figure { margin: 0.75rem 0; }
figcaption { font-size: 0.85rem; color: #666; margin-top: 0.25rem; }
a { color: #0066cc; }
blockquote { border-left: 3px solid #ccc; padding-left: 1rem; margin: 0.5rem 0; color: #555; }
table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
td { padding: 0.35rem 0.6rem; border: 1px solid #ccc; vertical-align: top; }
input[type=checkbox] { margin-right: 0.4em; }
@media print {
  body { margin: 0; max-width: none; }
  h1.note-title, h1, h2, h3 { page-break-after: avoid; }
  pre, blockquote, img, table { page-break-inside: avoid; }
}
`

/**
 * Opens a print-ready window for the note and triggers the system print dialog.
 * On macOS the dialog includes "Save as PDF".
 */
export function printNote(title: string, contentJson: string | null): void {
  const blocks = parseBlocks(contentJson)
  const bodyHtml = blocksToHtml(blocks)

  const win = window.open('', '_blank', 'width=820,height=700')
  if (!win) {
    alert('Please allow pop-ups for this page to use Print / Save as PDF.')
    return
  }

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  <h1 class="note-title">${esc(title)}</h1>
  ${bodyHtml || '<p style="color:#999;font-style:italic">Empty note.</p>'}
</body>
</html>`)

  win.document.close()
  win.focus()
  // Brief delay so styles render before the print dialog opens
  setTimeout(() => win.print(), 300)
}
