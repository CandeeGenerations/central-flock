import {ConfirmDialog} from '@/components/confirm-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {SearchableSelect} from '@/components/ui/searchable-select'
import {PageSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import {
  type Devotion,
  createDevotion,
  deleteDevotion,
  fetchDevotion,
  fetchNextDevotionNumber,
  generateFacebookDescription,
  generatePodcastDescription,
  generatePodcastTitle,
  generateSongDescription,
  generateSongTitle,
  generateYoutubeDescription,
  updateDevotion,
  youtubeSearchUrl,
} from '@/lib/devotion-api'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ArrowLeft, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Save, Trash2} from 'lucide-react'
import {useEffect, useState} from 'react'
import {useNavigate, useParams} from 'react-router-dom'
import {toast} from 'sonner'

type DevotionType = 'original' | 'favorite' | 'guest' | 'revisit'

interface DevotionForm {
  date: string
  number: number | ''
  devotionType: DevotionType
  subcode: string
  guestSpeaker: string
  guestNumber: string
  referencedDevotions: string
  bibleReference: string
  songName: string
  notes: string
  produced: boolean
  rendered: boolean
  youtube: boolean
  facebookInstagram: boolean
  podcast: boolean
}

const emptyForm: DevotionForm = {
  date: new Date().toISOString().slice(0, 10),
  number: '',
  devotionType: 'original',
  subcode: '',
  guestSpeaker: '',
  guestNumber: '',
  referencedDevotions: '',
  bibleReference: '',
  songName: '',
  notes: '',
  produced: false,
  rendered: false,
  youtube: false,
  facebookInstagram: false,
  podcast: false,
}

function devotionToForm(d: Devotion): DevotionForm {
  return {
    date: d.date ?? new Date().toISOString().slice(0, 10),
    number: d.number ?? '',
    devotionType: d.devotionType ?? 'original',
    subcode: d.subcode ?? '',
    guestSpeaker: d.guestSpeaker ?? '',
    guestNumber: d.guestNumber != null ? String(d.guestNumber) : '',
    referencedDevotions: d.referencedDevotions
      ? JSON.parse(d.referencedDevotions).join(', ')
      : '',
    bibleReference: d.bibleReference ?? '',
    songName: d.songName ?? '',
    notes: d.notes ?? '',
    produced: d.produced ?? false,
    rendered: d.rendered ?? false,
    youtube: d.youtube ?? false,
    facebookInstagram: d.facebookInstagram ?? false,
    podcast: d.podcast ?? false,
  }
}

function formToPayload(form: DevotionForm): Partial<Devotion> {
  return {
    date: form.date,
    number: form.number === '' ? undefined : form.number,
    devotionType: form.devotionType,
    subcode: form.subcode || null,
    guestSpeaker: form.devotionType === 'guest' ? form.guestSpeaker || null : null,
    guestNumber: form.devotionType === 'guest' && form.guestNumber ? Number(form.guestNumber) : null,
    referencedDevotions: form.referencedDevotions
      ? JSON.stringify(form.referencedDevotions.split(',').map((s) => Number(s.trim())).filter(Boolean))
      : null,
    bibleReference: form.bibleReference || null,
    songName: form.songName || null,
    notes: form.notes || null,
    produced: form.produced,
    rendered: form.rendered,
    youtube: form.youtube,
    facebookInstagram: form.facebookInstagram,
    podcast: form.podcast,
  }
}

export function DevotionDetailPage() {
  const {id} = useParams<{id: string}>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isNew = !id

  const [form, setForm] = useState<DevotionForm>(emptyForm)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [publishingOpen, setPublishingOpen] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const {data: devotion, isLoading} = useQuery({
    queryKey: ['devotion', id],
    queryFn: () => fetchDevotion(Number(id)),
    enabled: !isNew && !!id,
  })

  const {data: nextNumber} = useQuery({
    queryKey: ['devotion-next-number'],
    queryFn: fetchNextDevotionNumber,
    enabled: isNew,
  })

  useEffect(() => {
    if (devotion) {
      setForm(devotionToForm(devotion))
    }
  }, [devotion])

  useEffect(() => {
    if (isNew && nextNumber?.next != null) {
      setForm((f) => ({...f, number: nextNumber.next}))
    }
  }, [isNew, nextNumber])

  const createMutation = useMutation({
    mutationFn: (data: Partial<Devotion>) => createDevotion(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({queryKey: ['devotions']})
      toast.success('Devotion created')
      navigate(`/devotions/${created.id}`, {replace: true})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Devotion>) => updateDevotion(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['devotion', id]})
      queryClient.invalidateQueries({queryKey: ['devotions']})
      toast.success('Devotion updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteDevotion(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ['devotions']})
      navigate('/devotions')
      toast.success('Devotion deleted')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSave = () => {
    const payload = formToPayload(form)
    if (isNew) {
      createMutation.mutate(payload)
    } else {
      updateMutation.mutate(payload)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const update = (patch: Partial<DevotionForm>) => setForm((f) => ({...f, ...patch}))

  const isSaving = createMutation.isPending || updateMutation.isPending

  const showSongUpload =
    form.songName.trim() !== '' && (form.devotionType === 'original' || form.devotionType === 'favorite')

  // Build a pseudo-Devotion for song generation
  const songDevotion = {
    ...emptyForm,
    ...form,
    number: typeof form.number === 'number' ? form.number : 0,
    id: 0,
    createdAt: '',
    updatedAt: '',
    subcode: form.subcode || null,
    guestSpeaker: form.guestSpeaker || null,
    guestNumber: form.guestNumber ? Number(form.guestNumber) : null,
    referencedDevotions: form.referencedDevotions || null,
    bibleReference: form.bibleReference || null,
    songName: form.songName || null,
    notes: form.notes || null,
    title: null,
    youtubeDescription: null,
    facebookDescription: null,
    podcastDescription: null,
  } satisfies Devotion

  const songTitle = showSongUpload ? generateSongTitle(songDevotion) : null
  const songDescription = showSongUpload ? generateSongDescription(songDevotion) : null

  const ytDescription = devotion?.youtubeDescription || generateYoutubeDescription(songDevotion)
  const fbDescription = generateFacebookDescription(songDevotion)
  const podDescription = generatePodcastDescription(songDevotion)
  const podTitle = generatePodcastTitle(songDevotion)

  if (!isNew && isLoading) return <PageSpinner />
  if (!isNew && !devotion) return <div className="p-6">Devotion not found</div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/devotions')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-2xl font-bold">{isNew ? 'New Devotion' : `Devotion #${devotion?.number ?? id}`}</h2>
        {!isNew && devotion && (
          <a
            href={youtubeSearchUrl(devotion.number)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Main Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <DatePicker value={form.date} onChange={(v) => update({date: v})} />
            </div>
            <div>
              <Label>Number</Label>
              <Input
                type="number"
                value={form.number}
                onChange={(e) => update({number: e.target.value ? Number(e.target.value) : ''})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={form.devotionType !== 'guest' && form.devotionType !== 'revisit' ? 'md:col-span-3' : ''}>
              <Label>Type</Label>
              <SearchableSelect
                value={form.devotionType}
                onValueChange={(v) => update({devotionType: v as DevotionType})}
                options={[
                  {value: 'original', label: 'Original'},
                  {value: 'favorite', label: 'Favorite'},
                  {value: 'guest', label: 'Guest'},
                  {value: 'revisit', label: 'Revisit'},
                ]}
                className="w-full"
                searchable={false}
              />
            </div>
            {form.devotionType === 'guest' && (
              <>
                <div>
                  <Label>Speaker</Label>
                  <SearchableSelect
                    value={form.guestSpeaker}
                    onValueChange={(v) => update({guestSpeaker: v})}
                    options={[
                      {value: 'Tyler', label: 'Tyler'},
                      {value: 'Gabe', label: 'Gabe'},
                      {value: 'Ed', label: 'Ed'},
                    ]}
                    placeholder="Select speaker"
                    className="w-full"
                    searchable={false}
                  />
                </div>
                <div>
                  <Label>Guest Number</Label>
                  <Input
                    type="number"
                    value={form.guestNumber}
                    onChange={(e) => update({guestNumber: e.target.value})}
                    placeholder="Guest number"
                  />
                </div>
              </>
            )}
            {form.devotionType === 'revisit' && (
              <div className="md:col-span-2">
                <Label>Referenced Devotions</Label>
                <Input
                  value={form.referencedDevotions}
                  onChange={(e) => update({referencedDevotions: e.target.value})}
                  placeholder="e.g. 1801, 1439"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(form.devotionType === 'original' || form.devotionType === 'guest') && (
              <div>
                <Label>Subcode</Label>
                <Input
                  value={form.subcode}
                  onChange={(e) => update({subcode: e.target.value})}
                  placeholder={form.devotionType === 'guest' ? 'e.g. 001 - R-G' : 'e.g. E-14'}
                />
              </div>
            )}
            <div className={form.devotionType !== 'original' && form.devotionType !== 'guest' ? 'md:col-span-2' : ''}>
              <Label>Bible Reference</Label>
              <Input
                value={form.bibleReference}
                onChange={(e) => update({bibleReference: e.target.value})}
                placeholder="e.g. John 3:16"
              />
              {form.bibleReference && (
                <a
                  href={`https://www.biblegateway.com/passage/?search=${encodeURIComponent(form.bibleReference)}&version=AKJV`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  Open in BibleGateway
                </a>
              )}
            </div>
          </div>

          <div>
            <Label>Song Name</Label>
            <Input value={form.songName} onChange={(e) => update({songName: e.target.value})} placeholder="Optional" />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => update({notes: e.target.value})}
              rows={3}
              placeholder="Optional"
            />
          </div>

          {/* Pipeline checkboxes */}
          <div>
            <Label>Pipeline</Label>
            <div className="flex flex-wrap gap-4 mt-2">
              {(
                [
                  ['produced', 'Produced'],
                  ['rendered', 'Rendered'],
                  ['youtube', 'YouTube'],
                  ['facebookInstagram', 'FB/IG'],
                  ['podcast', 'Podcast'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form[key]} onCheckedChange={(checked) => update({[key]: !!checked})} />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Publishing Section (collapsible) */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none flex flex-row items-center justify-between"
          onClick={() => setPublishingOpen((o) => !o)}
        >
          <CardTitle>Publishing</CardTitle>
          {publishingOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardHeader>
        {publishingOpen && (
          <CardContent className="space-y-4">
            {[
              {label: 'Title', value: podTitle, key: 'podcastTitle'},
              {label: 'YouTube Description', value: ytDescription, key: 'youtubeDescription'},
              {label: 'Facebook / Instagram Description', value: fbDescription, key: 'facebookDescription'},
              {label: 'Podcast Description', value: podDescription, key: 'podcastDescription'},
            ].map(({label, value, key}) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <Label>{label}</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(value, key)}
                  >
                    {copiedField === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-sm bg-muted rounded-md p-3 font-mono whitespace-pre-wrap">{value}</p>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* Song Upload Section */}
      {showSongUpload && (
        <Card>
          <CardHeader>
            <CardTitle>Song Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Song YouTube Title</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => songTitle && copyToClipboard(songTitle, 'songTitle')}
                  disabled={!songTitle}
                >
                  {copiedField === 'songTitle' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-sm bg-muted rounded-md p-3 font-mono">{songTitle || '—'}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Song YouTube Description</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => songDescription && copyToClipboard(songDescription, 'songDescription')}
                  disabled={!songDescription}
                >
                  {copiedField === 'songDescription' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-sm bg-muted rounded-md p-3 font-mono whitespace-pre-wrap">
                {songDescription || '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {!isNew && (
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => navigate('/devotions')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-1.5" />
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Permanently delete this devotion?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  )
}
