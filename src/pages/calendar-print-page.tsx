import {
  CalendarGrid,
  DEFAULT_PLACEMENT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  getAvailablePlacements,
  parseInlineItemIds,
} from '@/components/calendar-print/calendar-grid'
import {CalendarGridEditor} from '@/components/calendar-print/calendar-grid-editor'
import {DayEditorDialog} from '@/components/calendar-print/day-editor-dialog'
import {ScheduleEditorDialog} from '@/components/calendar-print/schedule-editor-dialog'
import {ConfirmDialog} from '@/components/confirm-dialog'
import {Button} from '@/components/ui/button'
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card'
import {DatePicker} from '@/components/ui/date-time-picker'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {PageSpinner} from '@/components/ui/spinner'
import {Textarea} from '@/components/ui/textarea'
import type {
  CalendarPrintDayOverride,
  CalendarPrintEvent,
  CalendarPrintEventStyle,
  CalendarPrintPage,
  NormalScheduleItem,
  NormalScheduleItemInput,
} from '@/lib/api'
import {
  createCalendarPrintEvent,
  deleteCalendarPrintDayOverride,
  deleteCalendarPrintEvent,
  fetchCalendarPrintDefaultSchedule,
  fetchCalendarPrintPage,
  updateCalendarPrintDefaultSchedule,
  updateCalendarPrintEvent,
  updateCalendarPrintPage,
  upsertCalendarPrintDayOverride,
} from '@/lib/api'
import {type CalendarExportFormat, generateCalendarExport} from '@/lib/calendar-pdf'
import {queryKeys} from '@/lib/query-keys'
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query'
import {ChevronDown, ChevronLeft, ChevronRight, Download} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'
import {toast} from 'sonner'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface EventFormState {
  id: number | null
  date: string
  title: string
  style: CalendarPrintEventStyle
}

const styleOptions: {value: CalendarPrintEventStyle; label: string; description: string}[] = [
  {
    value: 'bold',
    label: 'Bold',
    description: 'Highlights the entire cell — for special days like Mother’s Day, Memorial Day',
  },
  {value: 'regular', label: 'Regular', description: 'Plain text — events like Bible Study, National Day of Prayer'},
]

function LightboxPreview({children}: {children: React.ReactNode}) {
  const [width, setWidth] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = width > 0 ? width / PAGE_WIDTH : 1

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-md overflow-hidden mx-auto"
      style={{
        width: '100%',
        aspectRatio: `${PAGE_WIDTH} / ${PAGE_HEIGHT}`,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          width: `${PAGE_WIDTH}px`,
          height: `${PAGE_HEIGHT}px`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

function styleBadgeColor(style: CalendarPrintEventStyle) {
  if (style === 'bold') return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100'
  return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100'
}

interface ColorSuggestion {
  name: string
  value: string
}

const COLORS_BY_MONTH: Record<number, ColorSuggestion[]> = {
  1: [
    {name: 'Winter Blue', value: '#1e40af'},
    {name: 'Frost', value: '#0f766e'},
    {name: 'Slate', value: '#334155'},
    {name: 'New Year Gold', value: '#b45309'},
  ],
  2: [
    {name: 'Valentine Red', value: '#dc2626'},
    {name: 'Rose', value: '#e11d48'},
    {name: 'Burgundy', value: '#9f1239'},
    {name: 'Plum', value: '#86198f'},
  ],
  3: [
    {name: 'Spring Green', value: '#16a34a'},
    {name: 'Shamrock', value: '#15803d'},
    {name: 'Daffodil', value: '#ca8a04'},
    {name: 'Lavender', value: '#7c3aed'},
  ],
  4: [
    {name: 'Easter Pink', value: '#ec4899'},
    {name: 'Pastel Lilac', value: '#a855f7'},
    {name: 'Spring Yellow', value: '#eab308'},
    {name: 'Mint', value: '#10b981'},
  ],
  5: [
    {name: "Mother's Pink", value: '#db2777'},
    {name: 'Garden Green', value: '#16a34a'},
    {name: 'Lily Lavender', value: '#8b5cf6'},
    {name: 'May Coral', value: '#f43f5e'},
  ],
  6: [
    {name: 'Summer Orange', value: '#ea580c'},
    {name: 'Sky Blue', value: '#0284c7'},
    {name: 'Sunshine', value: '#facc15'},
    {name: 'Rose', value: '#e11d48'},
  ],
  7: [
    {name: 'Patriotic Red', value: '#dc2626'},
    {name: 'Patriotic Blue', value: '#1d4ed8'},
    {name: 'Summer Coral', value: '#f97316'},
    {name: 'Ocean', value: '#0891b2'},
  ],
  8: [
    {name: 'Golden Yellow', value: '#ca8a04'},
    {name: 'Sunflower', value: '#eab308'},
    {name: 'Late Summer Teal', value: '#0d9488'},
    {name: 'Watermelon', value: '#f43f5e'},
  ],
  9: [
    {name: 'Harvest Amber', value: '#d97706'},
    {name: 'Maple', value: '#b45309'},
    {name: 'Autumn Olive', value: '#65a30d'},
    {name: 'Burnt Orange', value: '#c2410c'},
  ],
  10: [
    {name: 'Pumpkin Orange', value: '#ea580c'},
    {name: 'Halloween Black', value: '#0a0a0a'},
    {name: 'Crimson', value: '#b91c1c'},
    {name: 'Fall Brown', value: '#78350f'},
  ],
  11: [
    {name: 'Thanksgiving Brown', value: '#92400e'},
    {name: 'Cranberry', value: '#9f1239'},
    {name: 'Acorn', value: '#78350f'},
    {name: 'Harvest Gold', value: '#b45309'},
  ],
  12: [
    {name: 'Christmas Red', value: '#b91c1c'},
    {name: 'Pine Green', value: '#15803d'},
    {name: 'Gold', value: '#b45309'},
    {name: 'Holly', value: '#166534'},
  ],
}

export function CalendarPrintPage() {
  const today = new Date()
  const [year, setYear] = useState<number>(today.getFullYear())
  const [month, setMonth] = useState<number>(today.getMonth() + 1)

  const pageQuery = useQuery({
    queryKey: queryKeys.calendarPrintPage(year, month),
    queryFn: () => fetchCalendarPrintPage(year, month),
  })

  const navigateMonth = (delta: number) => {
    let m = month + delta
    let y = year
    while (m < 1) {
      m += 12
      y -= 1
    }
    while (m > 12) {
      m -= 12
      y += 1
    }
    setYear(y)
    setMonth(m)
  }

  const goToToday = () => {
    const t = new Date()
    setYear(t.getFullYear())
    setMonth(t.getMonth() + 1)
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-2xl font-heading min-w-[200px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </div>
          <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToToday}>
            Today
          </Button>
        </div>
      </header>

      {pageQuery.isLoading ? (
        <PageSpinner />
      ) : !pageQuery.data ? (
        <div className="p-6">Failed to load.</div>
      ) : (
        <CalendarPrintEditor
          key={`${year}-${month}`}
          year={year}
          month={month}
          page={pageQuery.data.page}
          events={pageQuery.data.events}
          scheduleItems={pageQuery.data.scheduleItems}
          dayOverrides={pageQuery.data.dayOverrides}
          isFetching={pageQuery.isFetching}
        />
      )}
    </div>
  )
}

interface EditorProps {
  year: number
  month: number
  page: CalendarPrintPage
  events: CalendarPrintEvent[]
  scheduleItems: NormalScheduleItem[]
  dayOverrides: CalendarPrintDayOverride[]
  isFetching: boolean
}

function CalendarPrintEditor({year, month, page, events, scheduleItems, dayOverrides, isFetching}: EditorProps) {
  const queryClient = useQueryClient()
  const captureRef = useRef<HTMLDivElement>(null)

  // Initial form state seeded from server data; component is keyed by year-month so it
  // remounts on month change and these initializers re-run.
  const [theme, setTheme] = useState(page.theme ?? '')
  const [themeColor, setThemeColor] = useState(page.themeColor ?? '')
  const [themePlacement, setThemePlacement] = useState(page.themePlacement ?? DEFAULT_PLACEMENT)
  const [versePlacement, setVersePlacement] = useState(page.versePlacement ?? DEFAULT_PLACEMENT)
  const [verseText, setVerseText] = useState(page.verseText ?? '')
  const [verseReference, setVerseReference] = useState(page.verseReference ?? '')
  const [hideNormalScheduleFooter, setHideNormalScheduleFooter] = useState(page.hideNormalScheduleFooter)

  const placementOptions = useMemo(() => getAvailablePlacements(year, month), [year, month])

  const [eventForm, setEventForm] = useState<EventFormState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarPrintEvent | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [defaultScheduleOpen, setDefaultScheduleOpen] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [pendingOverrideSave, setPendingOverrideSave] = useState<NormalScheduleItemInput[] | null>(null)
  const [pendingRevert, setPendingRevert] = useState(false)
  const [dayEditorDate, setDayEditorDate] = useState<string | null>(null)

  const inlineSelectionByDate = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const ov of dayOverrides) {
      map.set(ov.date, parseInlineItemIds(ov.inlineItemIds))
    }
    return map
  }, [dayOverrides])
  const showNoKayaByDate = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const ov of dayOverrides) {
      if (ov.showNoKaya) map.set(ov.date, true)
    }
    return map
  }, [dayOverrides])
  const showLabelByDate = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const ov of dayOverrides) {
      map.set(ov.date, ov.showNormalScheduleLabel)
    }
    return map
  }, [dayOverrides])

  const isOverriding = scheduleItems.some((it) => it.scopeType === 'page')
  const hasInlineSelections = dayOverrides.some((ov) => {
    try {
      return Array.isArray(JSON.parse(ov.inlineItemIds)) && JSON.parse(ov.inlineItemIds).length > 0
    } catch {
      return false
    }
  })

  const defaultScheduleQuery = useQuery({
    queryKey: queryKeys.calendarPrintDefaultSchedule,
    queryFn: fetchCalendarPrintDefaultSchedule,
  })

  const updatePageMutation = useMutation({
    mutationFn: () =>
      updateCalendarPrintPage(year, month, {
        theme: theme || null,
        themeColor: themeColor || null,
        themePlacement: themePlacement === DEFAULT_PLACEMENT ? null : themePlacement,
        versePlacement: versePlacement === DEFAULT_PLACEMENT ? null : versePlacement,
        verseText: verseText || null,
        verseReference: verseReference || null,
        hideNormalScheduleFooter,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
      toast.success('Saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const createEventMutation = useMutation({
    mutationFn: (data: {date: string; title: string; style: CalendarPrintEventStyle}) =>
      createCalendarPrintEvent(year, month, data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateEventMutation = useMutation({
    mutationFn: ({id, data}: {id: number; data: {date: string; title: string; style: CalendarPrintEventStyle}}) =>
      updateCalendarPrintEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => deleteCalendarPrintEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateDefaultScheduleMutation = useMutation({
    mutationFn: (items: NormalScheduleItemInput[]) => updateCalendarPrintDefaultSchedule(items),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintDefaultSchedule})
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
      setDefaultScheduleOpen(false)
      toast.success('Default schedule saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const saveOverrideMutation = useMutation({
    mutationFn: (items: NormalScheduleItemInput[] | null) =>
      updateCalendarPrintPage(year, month, {scheduleItems: items}),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
      setOverrideOpen(false)
      setPendingOverrideSave(null)
      setPendingRevert(false)
      toast.success('Schedule saved')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleOverrideSave = (items: NormalScheduleItemInput[]) => {
    // Scope change (default -> page) clears inline selections. Confirm if any exist.
    if (!isOverriding && hasInlineSelections) {
      setPendingOverrideSave(items)
      return
    }
    saveOverrideMutation.mutate(items)
  }

  const handleOverrideRevert = () => {
    if (isOverriding && hasInlineSelections) {
      setPendingRevert(true)
      return
    }
    saveOverrideMutation.mutate(null)
  }

  const upsertOverrideMutation = useMutation({
    mutationFn: (data: {
      date: string
      inlineItemIds: number[]
      showNoKaya?: boolean
      showNormalScheduleLabel?: boolean
    }) => upsertCalendarPrintDayOverride(year, month, data),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: (id: number) => deleteCalendarPrintDayOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const saveInlineSelection = (date: string, ids: number[], showNoKaya: boolean, showNormalScheduleLabel: boolean) => {
    upsertOverrideMutation.mutate(
      {date, inlineItemIds: ids, showNoKaya, showNormalScheduleLabel},
      {onSuccess: () => setDayEditorDate(null)},
    )
  }

  const revertToDefaultLabel = (date: string) => {
    const existing = dayOverrides.find((ov) => ov.date === date)
    if (existing) deleteOverrideMutation.mutate(existing.id, {onSuccess: () => setDayEditorDate(null)})
    else setDayEditorDate(null)
  }

  const applyToAllSlot = (sourceDate: string, ids: number[], showNoKaya: boolean, showNormalScheduleLabel: boolean) => {
    const daysInMonth = new Date(year, month, 0).getDate()
    const sourceDow = new Date(year, month - 1, Number(sourceDate.split('-')[2])).getDay()
    const targets: string[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month - 1, d)
      if (dt.getDay() !== sourceDow) continue
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      targets.push(iso)
    }
    Promise.all(
      targets.map((iso) =>
        ids.length === 0 && !showNoKaya
          ? (() => {
              const existing = dayOverrides.find((ov) => ov.date === iso)
              return existing ? deleteCalendarPrintDayOverride(existing.id) : Promise.resolve()
            })()
          : upsertCalendarPrintDayOverride(year, month, {
              date: iso,
              inlineItemIds: ids,
              showNoKaya,
              showNormalScheduleLabel,
            }),
      ),
    )
      .then(() => {
        queryClient.invalidateQueries({queryKey: queryKeys.calendarPrintPage(year, month)})
        setDayEditorDate(null)
        toast.success(`Applied to ${targets.length} day(s)`)
      })
      .catch((err: Error) => toast.error(err.message))
  }

  const eventsByDate = useMemo(
    () =>
      events.reduce<Record<string, CalendarPrintEvent[]>>((acc, e) => {
        if (!acc[e.date]) acc[e.date] = []
        acc[e.date].push(e)
        return acc
      }, {}),
    [events],
  )
  const sortedDates = useMemo(() => Object.keys(eventsByDate).sort(), [eventsByDate])

  const submitEventForm = () => {
    if (!eventForm) return
    if (!eventForm.date) return
    if (!eventForm.title.trim()) return
    const data = {
      date: eventForm.date,
      title: eventForm.title.trim(),
      style: eventForm.style,
    }
    if (eventForm.id == null) {
      createEventMutation.mutate(data, {onSuccess: () => setEventForm(null)})
    } else {
      updateEventMutation.mutate({id: eventForm.id, data}, {onSuccess: () => setEventForm(null)})
    }
  }

  const handleDownload = async (format: CalendarExportFormat) => {
    if (!captureRef.current) return
    try {
      await generateCalendarExport({element: captureRef.current, year, month, format})
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <>
      <div className="flex justify-end -mt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={isFetching}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleDownload('pdf')}>PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload('jpg')}>JPG image</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Page Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="theme">Theme</Label>
                <Textarea
                  id="theme"
                  rows={2}
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="Rejoice that we’re part of God’s family!"
                />
                <p className="text-xs text-muted-foreground">Press Enter to add a line break.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="theme-color">Theme Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="theme-color"
                    value={themeColor || '#1e293b'}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer"
                    aria-label="Pick custom color"
                  />
                  <Input
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    placeholder="#1e293b"
                    className="flex-1 font-mono text-xs"
                  />
                  {themeColor && (
                    <button
                      type="button"
                      onClick={() => setThemeColor('')}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground self-center mr-1">
                    Suggestions for {MONTH_NAMES[month - 1]}:
                  </span>
                  {COLORS_BY_MONTH[month].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setThemeColor(c.value)}
                      title={c.name}
                      style={{backgroundColor: c.value}}
                      className="h-6 w-6 rounded border border-border shadow-sm hover:scale-110 transition-transform cursor-pointer"
                      aria-label={c.name}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verse-text">Verse Text</Label>
                <Textarea
                  id="verse-text"
                  rows={3}
                  value={verseText}
                  onChange={(e) => setVerseText(e.target.value)}
                  placeholder="For this cause I bow my knees unto the Father…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="verse-ref">Verse Reference</Label>
                <Input
                  id="verse-ref"
                  value={verseReference}
                  onChange={(e) => setVerseReference(e.target.value)}
                  placeholder="Ephesians 3:14-15"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Theme placement</Label>
                <Select value={themePlacement} onValueChange={setThemePlacement}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {placementOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Verse placement</Label>
                <Select value={versePlacement} onValueChange={setVersePlacement}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {placementOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Schedule:{' '}
                  <span className={isOverriding ? 'text-foreground' : ''}>
                    {isOverriding ? 'Custom (this month)' : 'Using default'}
                  </span>
                </span>
                <button type="button" className="underline hover:text-foreground" onClick={() => setOverrideOpen(true)}>
                  {isOverriding ? 'Edit override' : 'Override for this month'}
                </button>
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={() => setDefaultScheduleOpen(true)}
                >
                  Edit default
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideNormalScheduleFooter}
                  onChange={(e) => setHideNormalScheduleFooter(e.target.checked)}
                />
                <span>Hide Normal Schedule block in footer (this month)</span>
              </label>
              <Button onClick={() => updatePageMutation.mutate()} disabled={updatePageMutation.isPending}>
                Save Page Details
              </Button>
            </CardContent>
          </Card>

          <Card>
            <button
              type="button"
              onClick={() => setEventsOpen((v) => !v)}
              className="w-full"
              aria-expanded={eventsOpen}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 cursor-pointer hover:bg-muted/40 rounded-t-lg">
                <CardTitle className="text-base flex items-center gap-2">
                  {eventsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Events this month
                  <span className="text-xs font-normal text-muted-foreground">({sortedDates.length})</span>
                </CardTitle>
              </CardHeader>
            </button>
            {eventsOpen && (
              <CardContent className="space-y-3">
                {sortedDates.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No events yet.</p>
                ) : (
                  sortedDates.map((date) => (
                    <div key={date} className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">{date}</div>
                      {eventsByDate[date].map((event) => (
                        <div key={event.id} className="flex items-center gap-2 text-sm">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${styleBadgeColor(event.style)}`}
                          >
                            {event.style.replace('_', ' ')}
                          </span>
                          <span className="flex-1 break-words text-left">
                            {event.title || <span className="italic text-muted-foreground">NO KAYA or Choir</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Preview (click a day to edit)</div>
            <Button size="sm" variant="outline" onClick={() => setLightboxOpen(true)}>
              Expand
            </Button>
          </div>
          <div className="block w-full bg-zinc-100 dark:bg-zinc-900 rounded-md p-4 overflow-hidden">
            <LightboxPreview>
              <CalendarGridEditor
                year={year}
                month={month}
                theme={theme || null}
                themeColor={themeColor || null}
                themePlacement={themePlacement}
                versePlacement={versePlacement}
                verseText={verseText || null}
                verseReference={verseReference || null}
                scheduleItems={scheduleItems}
                dayOverrides={dayOverrides}
                events={events}
                hideNormalScheduleFooter={hideNormalScheduleFooter}
                onCellClick={(d) => setDayEditorDate(d)}
              />
            </LightboxPreview>
          </div>
        </div>
      </div>

      {/* Lightbox preview */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="!max-w-[min(96vw,1200px)] sm:!max-w-[min(96vw,1200px)] !rounded-2xl !p-3">
          <DialogTitle className="sr-only">Calendar Preview</DialogTitle>
          {lightboxOpen && (
            <LightboxPreview>
              <CalendarGridEditor
                year={year}
                month={month}
                theme={theme || null}
                themeColor={themeColor || null}
                themePlacement={themePlacement}
                versePlacement={versePlacement}
                verseText={verseText || null}
                verseReference={verseReference || null}
                scheduleItems={scheduleItems}
                dayOverrides={dayOverrides}
                events={events}
                hideNormalScheduleFooter={hideNormalScheduleFooter}
                onCellClick={(d) => {
                  setLightboxOpen(false)
                  setDayEditorDate(d)
                }}
              />
            </LightboxPreview>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden full-size capture target for PDF/JPG. Wrapper is 0×0 + overflow:hidden
          so it never contributes to layout or page scroll. html2canvas captures the
          inner element directly via captureRef. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          opacity: 0,
        }}
      >
        <div
          ref={captureRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${PAGE_WIDTH}px`,
            height: `${PAGE_HEIGHT}px`,
          }}
        >
          <CalendarGrid
            year={year}
            month={month}
            theme={theme || null}
            themeColor={themeColor || null}
            themePlacement={themePlacement}
            versePlacement={versePlacement}
            verseText={verseText || null}
            verseReference={verseReference || null}
            scheduleItems={scheduleItems}
            dayOverrides={dayOverrides}
            events={events}
            hideNormalScheduleFooter={hideNormalScheduleFooter}
          />
        </div>
      </div>

      <Dialog open={eventForm !== null} onOpenChange={(open) => !open && setEventForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{eventForm?.id == null ? 'Add Event' : 'Edit Event'}</DialogTitle>
          </DialogHeader>
          {eventForm && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="event-date">Date</Label>
                <DatePicker
                  value={eventForm.date}
                  onChange={(date) => setEventForm({...eventForm, date})}
                  placeholder="Pick a date..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event-title">Title</Label>
                <Textarea
                  id="event-title"
                  rows={2}
                  value={eventForm.title}
                  onChange={(e) => setEventForm({...eventForm, title: e.target.value})}
                  placeholder="Mother's Day"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Press Enter to add a line break.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Style</Label>
                <div className="space-y-1.5">
                  {styleOptions.map((opt) => (
                    <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="event-style"
                        value={opt.value}
                        checked={eventForm.style === opt.value}
                        onChange={() => setEventForm({...eventForm, style: opt.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventForm(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitEventForm}
              disabled={!eventForm?.title.trim() || createEventMutation.isPending || updateEventMutation.isPending}
            >
              {eventForm?.id == null ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete event?"
        description={deleteTarget ? `Remove “${deleteTarget.title}” from ${deleteTarget.date}?` : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            deleteEventMutation.mutate(deleteTarget.id, {onSuccess: () => setDeleteTarget(null)})
          }
        }}
      />

      <DayEditorDialog
        open={dayEditorDate !== null}
        onOpenChange={(open) => !open && setDayEditorDate(null)}
        date={dayEditorDate}
        monthLabel={dayEditorDate ? MONTH_NAMES[Number(dayEditorDate.split('-')[1]) - 1] : ''}
        dayEvents={dayEditorDate ? (eventsByDate[dayEditorDate] ?? []) : []}
        scheduleItems={scheduleItems}
        inlineItemIds={dayEditorDate ? (inlineSelectionByDate.get(dayEditorDate) ?? null) : null}
        hasOverride={dayEditorDate ? dayOverrides.some((ov) => ov.date === dayEditorDate) : false}
        showNoKaya={dayEditorDate ? (showNoKayaByDate.get(dayEditorDate) ?? false) : false}
        showNormalScheduleLabel={dayEditorDate ? (showLabelByDate.get(dayEditorDate) ?? true) : true}
        onAddEvent={() => {
          if (!dayEditorDate) return
          setEventForm({
            id: null,
            date: dayEditorDate,
            title: '',
            style: 'regular',
          })
        }}
        onEditEvent={(event) =>
          setEventForm({
            id: event.id,
            date: event.date,
            title: event.title,
            style: event.style,
          })
        }
        onDuplicateEvent={(event) =>
          setEventForm({
            id: null,
            date: event.date,
            title: event.title,
            style: event.style,
          })
        }
        onDeleteEvent={(event) => setDeleteTarget(event)}
        onSaveInlineSelection={(ids, showNoKaya, showLabel) => {
          if (dayEditorDate) saveInlineSelection(dayEditorDate, ids, showNoKaya, showLabel)
        }}
        onApplyToAll={(ids, showNoKaya, showLabel) => {
          if (dayEditorDate) applyToAllSlot(dayEditorDate, ids, showNoKaya, showLabel)
        }}
        onUseDefaultLabel={() => {
          if (dayEditorDate) revertToDefaultLabel(dayEditorDate)
        }}
        isSavingInline={upsertOverrideMutation.isPending || deleteOverrideMutation.isPending}
      />

      <ScheduleEditorDialog
        open={defaultScheduleOpen}
        onOpenChange={setDefaultScheduleOpen}
        title="Default Normal Schedule"
        initialItems={defaultScheduleQuery.data?.items ?? []}
        isSaving={updateDefaultScheduleMutation.isPending}
        onSave={(items) => updateDefaultScheduleMutation.mutate(items)}
      />

      <ScheduleEditorDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        title={`Normal Schedule — override for ${MONTH_NAMES[month - 1]} ${year}`}
        initialItems={scheduleItems}
        isSaving={saveOverrideMutation.isPending}
        onSave={handleOverrideSave}
        showRevert={isOverriding}
        onRevert={handleOverrideRevert}
      />

      <ConfirmDialog
        open={pendingOverrideSave !== null}
        onOpenChange={(open) => !open && setPendingOverrideSave(null)}
        title="Clear inline schedule selections?"
        description={`This page has inline schedule selections on individual cells that reference the current default-schedule items. Switching to a custom override for this month will clear those selections.`}
        confirmLabel="Save override and clear"
        onConfirm={() => {
          if (pendingOverrideSave) saveOverrideMutation.mutate(pendingOverrideSave)
        }}
      />

      <ConfirmDialog
        open={pendingRevert}
        onOpenChange={(open) => !open && setPendingRevert(false)}
        title="Clear inline schedule selections?"
        description={`Reverting to the default schedule will clear any inline schedule selections on this month's cells (they reference override items).`}
        confirmLabel="Revert and clear"
        onConfirm={() => saveOverrideMutation.mutate(null)}
      />
    </>
  )
}
