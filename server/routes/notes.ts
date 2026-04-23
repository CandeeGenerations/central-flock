import {randomUUID} from 'crypto'
import {eq, isNull, sql} from 'drizzle-orm'
import {Router} from 'express'
import fs from 'fs'
import multer from 'multer'
import path from 'path'

import {db, schema} from '../db/index.js'
import {asyncHandler} from '../lib/route-helpers.js'

// ---------------------------------------------------------------------------
// Multer — image upload to data/notes-attachments/
// ---------------------------------------------------------------------------
const ATTACHMENTS_DIR = path.join(process.cwd(), 'data', 'notes-attachments')

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ATTACHMENTS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin'
    cb(null, `${randomUUID()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: {fileSize: 10 * 1024 * 1024},
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

export const notesRouter = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk BlockNote Block[] JSON (or plain text) to derive a short excerpt. */
function deriveExcerpt(contentJson: string | null | undefined): string | null {
  if (!contentJson) return null
  try {
    const parsed: unknown = JSON.parse(contentJson)
    if (Array.isArray(parsed)) {
      const parts: string[] = []
      type InlineContent = {type: string; text?: string}
      type Block = {content?: InlineContent[]; children?: Block[]}
      function walk(blocks: Block[]) {
        for (const b of blocks) {
          if (Array.isArray(b.content)) {
            for (const inl of b.content) {
              if (inl.type === 'text' && inl.text) parts.push(inl.text)
            }
          }
          if (Array.isArray(b.children)) walk(b.children)
        }
      }
      walk(parsed as Block[])
      const text = parts.join(' ').replace(/\s+/g, ' ').trim()
      return text.slice(0, 200) || null
    }
  } catch {
    // Not JSON — treat as plain text
  }
  return contentJson.replace(/\s+/g, ' ').trim().slice(0, 200) || null
}

/** Walk up the parent chain to build a breadcrumb array (root → item). */
function buildBreadcrumb(id: number) {
  const chain: {id: number; title: string; type: 'folder' | 'note'}[] = []
  let current: number | null = id
  while (current !== null) {
    const item = db
      .select({
        id: schema.notesItems.id,
        title: schema.notesItems.title,
        type: schema.notesItems.type,
        parentId: schema.notesItems.parentId,
      })
      .from(schema.notesItems)
      .where(eq(schema.notesItems.id, current))
      .get()
    if (!item) break
    chain.unshift({id: item.id, title: item.title, type: item.type})
    current = item.parentId ?? null
  }
  return chain
}

// ---------------------------------------------------------------------------
// GET /api/notes/tree — full flat list (no contentJson) for client tree build
// ---------------------------------------------------------------------------
notesRouter.get(
  '/tree',
  asyncHandler(async (_req, res) => {
    const items = db
      .select({
        id: schema.notesItems.id,
        type: schema.notesItems.type,
        parentId: schema.notesItems.parentId,
        title: schema.notesItems.title,
        excerpt: schema.notesItems.excerpt,
        icon: schema.notesItems.icon,
        position: schema.notesItems.position,
        updatedAt: schema.notesItems.updatedAt,
        createdAt: schema.notesItems.createdAt,
      })
      .from(schema.notesItems)
      .all()
    res.json(items)
  }),
)

// ---------------------------------------------------------------------------
// GET /api/notes/breadcrumb/:id — ancestor chain, root first
// ---------------------------------------------------------------------------
notesRouter.get(
  '/breadcrumb/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    if (!id) {
      res.status(400).json({error: 'Invalid id'})
      return
    }
    res.json(buildBreadcrumb(id))
  }),
)

// ---------------------------------------------------------------------------
// POST /api/notes/delete — bulk delete
// ---------------------------------------------------------------------------
notesRouter.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const {ids} = req.body as {ids: number[]}
    if (!ids || ids.length === 0) {
      res.status(400).json({error: 'No ids provided'})
      return
    }
    for (const id of ids) {
      db.delete(schema.notesItems).where(eq(schema.notesItems.id, id)).run()
    }
    res.json({success: true, deleted: ids.length})
  }),
)

// ---------------------------------------------------------------------------
// GET /api/notes/:id — single item (includes contentJson for notes)
// ---------------------------------------------------------------------------
notesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = db
      .select()
      .from(schema.notesItems)
      .where(eq(schema.notesItems.id, Number(req.params.id)))
      .get()
    if (!item) {
      res.status(404).json({error: 'Note not found'})
      return
    }
    res.json(item)
  }),
)

// ---------------------------------------------------------------------------
// POST /api/notes — create folder or note
// ---------------------------------------------------------------------------
notesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const {type, parentId, title} = req.body as {
      type: 'folder' | 'note'
      parentId?: number | null
      title?: string
    }

    if (type !== 'folder' && type !== 'note') {
      res.status(400).json({error: 'type must be "folder" or "note"'})
      return
    }

    // Determine next position among siblings
    const siblings = db
      .select({position: schema.notesItems.position})
      .from(schema.notesItems)
      .where(parentId ? eq(schema.notesItems.parentId, parentId) : isNull(schema.notesItems.parentId))
      .all()
    const maxPosition = siblings.reduce((max, s) => Math.max(max, s.position), -1)

    const item = db
      .insert(schema.notesItems)
      .values({
        type,
        parentId: parentId ?? null,
        title: title?.trim() || 'Untitled',
        position: maxPosition + 1,
      })
      .returning()
      .get()

    res.status(201).json(item)
  }),
)

// ---------------------------------------------------------------------------
// PUT /api/notes/:id — update title, contentJson, icon
// ---------------------------------------------------------------------------
notesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {title, contentJson, icon} = req.body as {
      title?: string
      contentJson?: string | null
      icon?: string | null
    }

    const existing = db.select().from(schema.notesItems).where(eq(schema.notesItems.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Note not found'})
      return
    }

    const excerpt = contentJson !== undefined ? deriveExcerpt(contentJson) : undefined

    const updated = db
      .update(schema.notesItems)
      .set({
        ...(title !== undefined ? {title: title.trim() || 'Untitled'} : {}),
        ...(contentJson !== undefined ? {contentJson: contentJson ?? null} : {}),
        ...(excerpt !== undefined ? {excerpt} : {}),
        ...(icon !== undefined ? {icon: icon ?? null} : {}),
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.notesItems.id, id))
      .returning()
      .get()

    res.json(updated)
  }),
)

// ---------------------------------------------------------------------------
// PATCH /api/notes/:id/move — move to a different parent
// ---------------------------------------------------------------------------
notesRouter.patch(
  '/:id/move',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const {parentId, position} = req.body as {parentId: number | null; position?: number}

    const existing = db.select().from(schema.notesItems).where(eq(schema.notesItems.id, id)).get()
    if (!existing) {
      res.status(404).json({error: 'Note not found'})
      return
    }

    // Determine position if not provided
    let resolvedPosition = position
    if (resolvedPosition === undefined) {
      const siblings = db
        .select({position: schema.notesItems.position})
        .from(schema.notesItems)
        .where(parentId ? eq(schema.notesItems.parentId, parentId) : isNull(schema.notesItems.parentId))
        .all()
      resolvedPosition = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1
    }

    const updated = db
      .update(schema.notesItems)
      .set({
        parentId: parentId ?? null,
        position: resolvedPosition,
        updatedAt: sql`datetime('now')`,
      })
      .where(eq(schema.notesItems.id, id))
      .returning()
      .get()

    res.json(updated)
  }),
)

// ---------------------------------------------------------------------------
// POST /api/notes/:id/duplicate — clone a note or an entire folder subtree
// ---------------------------------------------------------------------------

type NoteItemRow = typeof schema.notesItems.$inferSelect

/** Recursively clone an item and all its descendants into newParentId.
 *  Only the root of the clone gets " (copy)" appended to its title. */
function cloneSubtree(originalId: number, newParentId: number | null, isRoot = false): NoteItemRow {
  const original = db.select().from(schema.notesItems).where(eq(schema.notesItems.id, originalId)).get()!

  // Position the clone at the end among its new siblings (root only; children keep original position)
  let position = original.position
  if (isRoot) {
    const siblings = db
      .select({position: schema.notesItems.position})
      .from(schema.notesItems)
      .where(newParentId !== null ? eq(schema.notesItems.parentId, newParentId) : isNull(schema.notesItems.parentId))
      .all()
    position = siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1
  }

  const copy = db
    .insert(schema.notesItems)
    .values({
      type: original.type,
      parentId: newParentId,
      title: isRoot ? `${original.title} (copy)` : original.title,
      contentJson: original.contentJson ?? null,
      excerpt: original.excerpt ?? null,
      icon: original.icon ?? null,
      position,
    })
    .returning()
    .get()!

  // Clone children into the newly created copy
  const children = db.select().from(schema.notesItems).where(eq(schema.notesItems.parentId, originalId)).all()
  for (const child of children) {
    cloneSubtree(child.id, copy.id, false)
  }

  return copy
}

notesRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const original = db.select().from(schema.notesItems).where(eq(schema.notesItems.id, id)).get()

    if (!original) {
      res.status(404).json({error: 'Item not found'})
      return
    }

    const copy = cloneSubtree(id, original.parentId ?? null, true)
    res.status(201).json(copy)
  }),
)

// ---------------------------------------------------------------------------
// POST /api/notes/:id/attachments — upload an image; returns {id, url}
// ---------------------------------------------------------------------------
notesRouter.post(
  '/:id/attachments',
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError || err instanceof Error) {
        res.status(400).json({error: err.message})
        return
      }
      next()
    })
  },
  asyncHandler(async (req, res) => {
    const noteId = Number(req.params.id)
    const file = req.file
    if (!file) {
      res.status(400).json({error: 'No file uploaded'})
      return
    }

    const note = db
      .select({id: schema.notesItems.id})
      .from(schema.notesItems)
      .where(eq(schema.notesItems.id, noteId))
      .get()
    if (!note) {
      fs.unlink(file.path, () => {})
      res.status(404).json({error: 'Note not found'})
      return
    }

    const attachment = db
      .insert(schema.notesAttachments)
      .values({
        noteId,
        fileName: file.originalname,
        storagePath: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      })
      .returning()
      .get()

    const url = `/data/notes-attachments/${file.filename}`
    res.status(201).json({id: attachment.id, url})
  }),
)

// ---------------------------------------------------------------------------
// DELETE /api/notes/attachments/:id — remove attachment row + file
// ---------------------------------------------------------------------------
notesRouter.delete(
  '/attachments/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id)
    const attachment = db.select().from(schema.notesAttachments).where(eq(schema.notesAttachments.id, id)).get()

    if (!attachment) {
      res.status(404).json({error: 'Attachment not found'})
      return
    }

    db.delete(schema.notesAttachments).where(eq(schema.notesAttachments.id, id)).run()

    const filePath = path.join(ATTACHMENTS_DIR, attachment.storagePath)
    fs.unlink(filePath, (err) => {
      if (err) console.warn('Could not delete attachment file:', filePath, err.message)
    })

    res.json({success: true})
  }),
)

// ---------------------------------------------------------------------------
// POST /api/notes/attachments/sweep — remove orphaned attachment files
// ---------------------------------------------------------------------------
notesRouter.post(
  '/attachments/sweep',
  asyncHandler(async (_req, res) => {
    const attachments = db.select().from(schema.notesAttachments).all()
    if (attachments.length === 0) {
      res.json({success: true, removed: 0})
      return
    }

    // Concatenate all note content_json for a simple URL presence check
    const allContent = db
      .select({contentJson: schema.notesItems.contentJson})
      .from(schema.notesItems)
      .all()
      .map((n) => n.contentJson ?? '')
      .join('')

    let removed = 0
    for (const attachment of attachments) {
      const url = `/data/notes-attachments/${attachment.storagePath}`
      if (!allContent.includes(url)) {
        db.delete(schema.notesAttachments).where(eq(schema.notesAttachments.id, attachment.id)).run()
        fs.unlink(path.join(ATTACHMENTS_DIR, attachment.storagePath), () => {})
        removed++
      }
    }

    res.json({success: true, removed})
  }),
)
