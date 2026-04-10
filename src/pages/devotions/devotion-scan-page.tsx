import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'
import {useQuery} from '@tanstack/react-query'
import {AlertTriangle, Camera, Check, CircleX, Loader2, Save, Trash2, Upload, ZoomIn} from 'lucide-react'
import {useRef, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import {toast} from 'sonner'

interface ParsedDevotion {
  date: string
  number: number
  devotionType: 'original' | 'favorite' | 'guest' | 'revisit'
  subcode: string | null
  guestSpeaker: string | null
  guestNumber: number | null
  referencedDevotions: number[]
  bibleReference: string | null
  songName: string | null
}

interface EnrichResult {
  number: number
  fullChain: number[]
  originalNumber: number | null
  originalReference: string | null
  verseMatch: boolean | null
}

interface RowState {
  devotion: ParsedDevotion
  existing: boolean
  selected: boolean
  enrichment?: EnrichResult
}

interface ScanDraft {
  id: number
  month: string
  year: number
  count: number
  createdAt: string
}

const TYPE_STYLES: Record<string, string> = {
  original: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  favorite: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  guest: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  revisit: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

function isVerseMatch(row: RowState): boolean | null {
  if (!row.enrichment?.originalReference || !row.devotion.bibleReference) return null
  return row.enrichment.originalReference.trim().toLowerCase() === row.devotion.bibleReference.trim().toLowerCase()
}

function RowStatusIcon({row}: {row: RowState}) {
  const match = isVerseMatch(row)
  if (match === false) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <CircleX className="h-4 w-4 text-red-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Verse mismatch</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  if (!row.devotion.bibleReference) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </span>
          </TooltipTrigger>
          <TooltipContent>Missing verse</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Check className="h-4 w-4 text-green-500" />
          </span>
        </TooltipTrigger>
        <TooltipContent>OK</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function DevotionScanPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const draftId = searchParams.get('draft')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageData, setImageData] = useState<{base64: string; mediaType: string} | null>(null)
  const [parsing, setParsing] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [resultMeta, setResultMeta] = useState<{month: string; year: number} | null>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(draftId ? Number(draftId) : null)
  const [editChainRow, setEditChainRow] = useState<number | null>(null)
  const [editChainValue, setEditChainValue] = useState('')
  const [editChainLoading, setEditChainLoading] = useState(false)
  const [devoDetail, setDevoDetail] = useState<{
    number: number
    date: string
    devotionType: string
    subcode?: string | null
    guestSpeaker?: string | null
    guestNumber?: number | null
    referencedDevotions?: string | null
    bibleReference?: string | null
    songName?: string | null
    notes?: string | null
    produced: boolean
    rendered: boolean
    youtube: boolean
    facebookInstagram: boolean
    podcast: boolean
  } | null>(null)

  // Load saved drafts
  const {data: drafts, refetch: refetchDrafts} = useQuery({
    queryKey: ['scan-drafts'],
    queryFn: () =>
      fetch('/api/devotions/scan-drafts', {credentials: 'include'}).then((r) => r.json()) as Promise<ScanDraft[]>,
  })

  const loadDraft = async (id: number) => {
    try {
      const res = await fetch(`/api/devotions/scan-drafts/${id}`, {credentials: 'include'})
      const draft = await res.json()
      setResultMeta({month: draft.month, year: draft.year})
      setCurrentDraftId(id)
      if (draft.imagePath) {
        setImagePreview(draft.imagePath)
      }
      await loadParsedData(draft.data.devotions, draft.month, draft.year)
    } catch {
      toast.error('Failed to load draft')
    }
  }

  // Load draft if URL has ?draft=id (on mount)
  useQuery({
    queryKey: ['scan-draft-load', draftId],
    queryFn: async () => {
      await loadDraft(Number(draftId))
      return true
    },
    enabled: !!draftId,
    staleTime: 0,
  })

  const handleFileSelect = (file: File) => {
    if (file.type !== 'image/jpeg') {
      toast.error('Please select a JPEG image')
      return
    }

    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let {width, height} = img
      const maxDim = 2048
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      setImagePreview(dataUrl)
      const base64 = dataUrl.split(',')[1]
      setImageData({base64, mediaType: 'image/jpeg'})
      setResultMeta(null)
      setRows([])
    }
    img.src = url
  }

  async function loadParsedData(devotions: ParsedDevotion[], month: string, year: number) {
    // Check existing
    const numbers = devotions.map((d) => d.number)
    const {existing} = await apiPost<{existing: number[]}>('/api/devotions/check-existing', {numbers})
    const existingSet = new Set(existing)

    // Enrich revisits
    setEnriching(true)
    let enrichments: EnrichResult[] = []
    try {
      enrichments = await apiPost<EnrichResult[]>('/api/devotions/enrich-parsed', {devotions})
    } catch (err) {
      console.error('Enrich failed:', err)
    }
    setEnriching(false)

    const enrichMap = new Map(enrichments.map((e) => [e.number, e]))

    setRows(
      devotions.map((d) => {
        const enrichment = enrichMap.get(d.number)
        // If enrichment found the full chain, update referencedDevotions
        const updatedDevotion = {...d}
        if (enrichment?.fullChain.length) {
          updatedDevotion.referencedDevotions = enrichment.fullChain
        }
        // If verse doesn't match and we have the original's reference, flag it
        return {
          devotion: updatedDevotion,
          existing: existingSet.has(d.number),
          selected: !existingSet.has(d.number),
          enrichment,
        }
      }),
    )

    const dupCount = devotions.filter((d) => existingSet.has(d.number)).length
    toast.success(
      `Loaded ${devotions.length} devotions for ${month} ${year}` +
        (dupCount > 0 ? ` (${dupCount} already exist)` : ''),
    )
  }

  const handleParse = async () => {
    if (!imageData) return
    setParsing(true)
    try {
      const data = await apiPost<{month: string; year: number; devotions: ParsedDevotion[]}>(
        '/api/devotions/parse-image',
        {
          image: imageData.base64,
          mediaType: imageData.mediaType,
        },
      )
      setResultMeta({month: data.month, year: data.year})
      await loadParsedData(data.devotions, data.month, data.year)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse image')
    } finally {
      setParsing(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!resultMeta || rows.length === 0) return
    setSaving(true)
    try {
      // Only send image if it's a new data URL (not an already-stored path)
      const isNewImage = imagePreview?.startsWith('data:')
      const body = {
        month: resultMeta.month,
        year: resultMeta.year,
        devotions: rows.map((r) => r.devotion),
        image: isNewImage ? imagePreview : undefined,
      }
      if (currentDraftId) {
        await fetch(`/api/devotions/scan-drafts/${currentDraftId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        })
      } else {
        const result = await apiPost<{id: number}>('/api/devotions/scan-drafts', body)
        setCurrentDraftId(result.id)
      }
      toast.success('Draft saved')
      refetchDrafts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteDraft = async (id: number) => {
    await fetch(`/api/devotions/scan-drafts/${id}`, {method: 'DELETE', credentials: 'include'})
    refetchDrafts()
    if (draftId === String(id) || currentDraftId === id) {
      setResultMeta(null)
      setRows([])
      setImagePreview(null)
      setImageData(null)
      setCurrentDraftId(null)
      navigate('/devotions/scan', {replace: true})
    }
    toast.success('Draft deleted')
  }

  const handleImport = async () => {
    const selected = rows.filter((r) => r.selected).map((r) => r.devotion)
    if (selected.length === 0) {
      toast.error('No rows selected')
      return
    }
    setImporting(true)
    try {
      const data = await apiPost<{inserted: number; updated: number; errors: string[]}>(
        '/api/devotions/import-parsed',
        {devotions: selected},
      )
      toast.success(`Imported: ${data.inserted} new, ${data.updated} updated`)
      if (data.errors.length > 0) {
        toast.error(`${data.errors.length} errors: ${data.errors.slice(0, 3).join(', ')}`)
      }
      navigate('/devotions')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to import')
    } finally {
      setImporting(false)
    }
  }

  const updateRow = async (index: number, patch: Partial<ParsedDevotion>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? {...r, devotion: {...r.devotion, ...patch}} : r)))
    if (patch.number != null) {
      try {
        const {existing} = await apiPost<{existing: number[]}>('/api/devotions/check-existing', {
          numbers: [patch.number],
        })
        setRows((prev) => prev.map((r, i) => (i === index ? {...r, existing: existing.includes(patch.number!)} : r)))
      } catch {
        /* ignore */
      }
    }
  }

  const toggleRow = (index: number) => {
    setRows((prev) => prev.map((r, i) => (i === index ? {...r, selected: !r.selected} : r)))
  }

  const toggleAll = (selected: boolean) => {
    setRows((prev) => prev.map((r) => ({...r, selected})))
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  const handleEditChainSave = async () => {
    if (editChainRow === null) return
    const num = Number(editChainValue)
    if (!num) {
      toast.error('Enter a valid number')
      return
    }
    setEditChainLoading(true)
    try {
      const row = rows[editChainRow]
      const tempDevo = {...row.devotion, referencedDevotions: [num]}
      const enrichments = await apiPost<EnrichResult[]>('/api/devotions/enrich-parsed', {
        devotions: [
          {
            number: tempDevo.number,
            devotionType: tempDevo.devotionType,
            referencedDevotions: [num],
            bibleReference: tempDevo.bibleReference,
          },
        ],
      })
      const enrichment = enrichments[0]
      setRows((prev) =>
        prev.map((r, i) =>
          i === editChainRow
            ? {
                ...r,
                devotion: {
                  ...r.devotion,
                  referencedDevotions: enrichment?.fullChain.length ? enrichment.fullChain : [num],
                },
                enrichment,
              }
            : r,
        ),
      )
      setEditChainRow(null)
      toast.success('Chain updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update chain')
    } finally {
      setEditChainLoading(false)
    }
  }

  const showDevoDetail = async (num: number) => {
    try {
      const res = await fetch(`/api/devotions?search=${num}&limit=1`, {credentials: 'include'})
      const data = await res.json()
      if (data.data?.[0]) {
        setDevoDetail(data.data[0])
      } else {
        toast.error(`Devotion #${num} not found in database`)
      }
    } catch {
      toast.error('Failed to load devotion')
    }
  }

  const selectedCount = rows.filter((r) => r.selected).length
  const existingCount = rows.filter((r) => r.existing).length
  const newCount = rows.filter((r) => !r.existing).length
  const verseMismatches = rows.filter((r) => isVerseMatch(r) === false).length
  const missingVerses = rows.filter((r) => !r.devotion.bibleReference && r.devotion.devotionType !== 'guest').length

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-5">
      <h2 className="text-2xl font-bold">Scan Handwritten Sheet</h2>

      {/* Saved Drafts */}
      {drafts && drafts.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Saved Drafts</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Devotions</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer hover:bg-muted/50" onClick={() => loadDraft(d.id)}>
                    <TableCell className="font-medium">
                      {d.month} {d.year}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{d.count}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(d.createdAt + 'Z').toLocaleDateString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteDraft(d.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Upload Photo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelect(file)
            }}
          />

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handleFileSelect(file)
            }}
          >
            {imagePreview ? (
              <div className="space-y-4">
                <div
                  className="border rounded-lg overflow-hidden max-w-xl mx-auto cursor-pointer relative group"
                  onClick={() => setLightboxOpen(true)}
                >
                  <img src={imagePreview} alt="Uploaded sheet" className="w-full" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1.5" />
                    Replace
                  </Button>
                  {imageData && (
                    <Button size="sm" onClick={handleParse} disabled={parsing}>
                      {parsing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          Parsing with AI...
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4 mr-1.5" />
                          {resultMeta ? 'Re-parse' : 'Parse Image'}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm font-medium">Drop a JPG here or click to browse</p>
                <p className="text-xs text-muted-foreground">JPEG images only</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parsed Results */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              Review Parsed Data
              {resultMeta && (
                <Badge variant="secondary">
                  {resultMeta.month} {resultMeta.year}
                </Badge>
              )}
              {newCount > 0 && <Badge className="bg-green-100 text-green-800">{newCount} new</Badge>}
              {existingCount > 0 && <Badge className="bg-amber-100 text-amber-800">{existingCount} existing</Badge>}
              {missingVerses > 0 && (
                <Badge className="bg-amber-100 text-amber-800">
                  {missingVerses} missing verse{missingVerses > 1 ? 's' : ''}
                </Badge>
              )}
              {verseMismatches > 0 && (
                <Badge className="bg-red-100 text-red-800">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {verseMismatches} verse mismatch{verseMismatches > 1 ? 'es' : ''}
                </Badge>
              )}
              {enriching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedCount === rows.length}
                      onCheckedChange={(checked) => toggleAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Song</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={i}
                    className={`
                        row.existing && !row.selected
                          ? 'opacity-50'
                          : isVerseMatch(row) === false
                            ? 'bg-red-50 dark:bg-red-950/20'
                            : row.existing
                              ? 'bg-amber-50 dark:bg-amber-950/20'
                              : ''
                      }`}
                  >
                    <TableCell className="px-2">
                      <RowStatusIcon row={row} />
                    </TableCell>
                    <TableCell>
                      <Checkbox checked={row.selected} onCheckedChange={() => toggleRow(i)} />
                    </TableCell>
                    <TableCell className="!align-top">
                      <DatePicker value={row.devotion.date} onChange={(v) => updateRow(i, {date: v})} />
                    </TableCell>
                    <TableCell className="!align-top">
                      <div className="space-y-1">
                        <Input
                          type="number"
                          value={row.devotion.number}
                          onChange={(e) => updateRow(i, {number: Number(e.target.value)})}
                          className="w-30 h-8 text-xs"
                        />
                        {row.existing && <p className="text-[10px] text-amber-600">Duplicate #</p>}
                      </div>
                    </TableCell>
                    <TableCell className="!align-top">
                      <Select
                        value={
                          row.devotion.devotionType === 'guest'
                            ? `guest-${row.devotion.guestSpeaker || ''}`
                            : row.devotion.devotionType
                        }
                        onValueChange={(v) => {
                          if (v.startsWith('guest-')) {
                            updateRow(i, {devotionType: 'guest', guestSpeaker: v.replace('guest-', '')})
                          } else {
                            updateRow(i, {devotionType: v as ParsedDevotion['devotionType'], guestSpeaker: null})
                          }
                        }}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">Original</SelectItem>
                          <SelectItem value="favorite">Favorite</SelectItem>
                          <SelectItem value="revisit">Revisit</SelectItem>
                          <SelectItem value="guest-Tyler">Guest - Tyler</SelectItem>
                          <SelectItem value="guest-Gabe">Guest - Gabe</SelectItem>
                          <SelectItem value="guest-Ed">Guest - Ed</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="!align-top">
                      <div className="space-y-1">
                        <Input
                          value={row.devotion.bibleReference || ''}
                          onChange={(e) => updateRow(i, {bibleReference: e.target.value || null})}
                          className={`w-44 h-8 text-xs ${isVerseMatch(row) === false ? 'border-red-400' : !row.devotion.bibleReference ? 'border-amber-400' : ''}`}
                          placeholder="e.g. John 3:16"
                        />
                        {isVerseMatch(row) === false && row.enrichment?.originalReference && (
                          <p className="text-[10px] text-red-600">
                            Original #{row.enrichment.originalNumber}: {row.enrichment.originalReference}{' '}
                            <button
                              className="underline hover:text-red-800 cursor-pointer"
                              onClick={() => updateRow(i, {bibleReference: row.enrichment!.originalReference})}
                            >
                              Use this
                            </button>
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="!align-top">
                      <Input
                        value={row.devotion.songName || ''}
                        onChange={(e) => updateRow(i, {songName: e.target.value || null})}
                        className="w-40 h-8 text-xs"
                        placeholder="Song name"
                      />
                    </TableCell>
                    <TableCell>
                      {row.devotion.devotionType === 'revisit' ? (
                        <div className="flex items-center gap-1">
                          <span className="text-xs">
                            {row.devotion.referencedDevotions.map((n, j) => (
                              <span key={n}>
                                {j > 0 && <span className="text-muted-foreground"> → </span>}
                                <button
                                  className="text-primary hover:underline cursor-pointer"
                                  onClick={() => showDevoDetail(n)}
                                >
                                  #{n}
                                </button>
                              </span>
                            ))}
                            {row.devotion.referencedDevotions.length === 0 && (
                              <span className="text-muted-foreground">none</span>
                            )}
                          </span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="p-0.5 rounded hover:bg-muted cursor-pointer shrink-0"
                                  onClick={() => {
                                    setEditChainRow(i)
                                    setEditChainValue(String(row.devotion.referencedDevotions[0] || ''))
                                  }}
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-muted-foreground"
                                  >
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  </svg>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Edit reference number</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <button
                        className="p-1 rounded hover:bg-destructive/10 cursor-pointer"
                        onClick={() => removeRow(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="flex flex-wrap gap-2 text-sm">
              {(['original', 'favorite', 'guest', 'revisit'] as const).map((type) => {
                const count = rows.filter((r) => r.devotion.devotionType === type).length
                if (count === 0) return null
                return (
                  <Badge key={type} variant="outline" className={TYPE_STYLES[type]}>
                    {type}: {count}
                  </Badge>
                )
              })}
              <span className="text-muted-foreground">|</span>
              <span className="text-sm text-muted-foreground">{selectedCount} selected for import</span>
            </div>

            {existingCount > 0 && (
              <p className="text-sm text-amber-600">
                {existingCount} devotion{existingCount > 1 ? 's' : ''} already exist. Select them to override.
              </p>
            )}

            {verseMismatches > 0 && (
              <p className="text-sm text-red-600">
                {verseMismatches} verse{verseMismatches > 1 ? "s don't" : " doesn't"} match the original devotion. Check
                the red-highlighted rows.
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setResultMeta(null)
                  setRows([])
                  setCurrentDraftId(null)
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Discard
              </Button>
              <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save Draft
              </Button>
              <Button size="sm" onClick={handleImport} disabled={importing || selectedCount === 0}>
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1.5" />
                    Approve &amp; Import ({selectedCount})
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Lightbox */}
      {/* Edit Chain Modal */}
      <Dialog open={editChainRow !== null} onOpenChange={(open) => !open && setEditChainRow(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              Edit Reference for #{editChainRow !== null ? rows[editChainRow]?.devotion.number : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the first referenced devotion number. The full chain will be resolved automatically.
            </p>
            <Input
              type="number"
              value={editChainValue}
              onChange={(e) => setEditChainValue(e.target.value)}
              placeholder="e.g. 1101"
              onKeyDown={(e) => e.key === 'Enter' && handleEditChainSave()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditChainRow(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleEditChainSave} disabled={editChainLoading}>
                {editChainLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Devotion Detail Modal */}
      <Dialog open={!!devoDetail} onOpenChange={(open) => !open && setDevoDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Devotion #{String(devoDetail?.number as number).padStart(3, '0')}</DialogTitle>
          </DialogHeader>
          {devoDetail && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Date</span>
                <p className="font-medium">{devoDetail.date}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type</span>
                <p className="font-medium capitalize">{devoDetail.devotionType}</p>
              </div>
              {devoDetail.guestSpeaker && (
                <div>
                  <span className="text-muted-foreground">Speaker</span>
                  <p className="font-medium">
                    {devoDetail.guestSpeaker}
                    {devoDetail.guestNumber ? ` #${devoDetail.guestNumber}` : ''}
                  </p>
                </div>
              )}
              {devoDetail.subcode && (
                <div>
                  <span className="text-muted-foreground">Subcode</span>
                  <p className="font-medium">{devoDetail.subcode}</p>
                </div>
              )}
              <div className="col-span-2">
                <span className="text-muted-foreground">Bible Reference</span>
                <p className="font-medium">{devoDetail.bibleReference || '—'}</p>
              </div>
              {devoDetail.songName && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Song</span>
                  <p className="font-medium">{devoDetail.songName}</p>
                </div>
              )}
              {devoDetail.referencedDevotions && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Referenced</span>
                  <p className="font-medium">
                    {(JSON.parse(devoDetail.referencedDevotions) as number[]).map((n, j) => (
                      <span key={n}>
                        {j > 0 && ', '}
                        <button
                          className="text-primary hover:underline cursor-pointer"
                          onClick={() => showDevoDetail(n)}
                        >
                          #{n}
                        </button>
                      </span>
                    ))}
                  </p>
                </div>
              )}
              {devoDetail.notes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="font-medium">{devoDetail.notes}</p>
                </div>
              )}
              <div className="col-span-2 flex gap-3 pt-1">
                {(['produced', 'rendered', 'youtube', 'facebookInstagram', 'podcast'] as const).map((field) => {
                  const labels: Record<string, string> = {
                    produced: 'Produced',
                    rendered: 'Rendered',
                    youtube: 'YouTube',
                    facebookInstagram: 'FB/IG',
                    podcast: 'Podcast',
                  }
                  return (
                    <div key={field} className="flex items-center gap-1">
                      {devoDetail[field] ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-xs">{labels[field]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxOpen(false)}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-white/80 cursor-pointer z-10"
            onClick={() => setLightboxOpen(false)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Uploaded sheet"
              className="max-w-[95vw] max-h-[95vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  )
}
