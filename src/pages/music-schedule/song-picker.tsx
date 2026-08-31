import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {type HymnOption, musicScheduleKeys, searchMusicHymns} from '@/lib/music-schedule-api'
import {type HymnBook, hymnRef, toTitleCase} from '@/lib/music-schedule-core'
import {useQuery} from '@tanstack/react-query'
import {Music} from 'lucide-react'
import {useRef, useState} from 'react'

export interface SongValue {
  hymnId: number | null
  hymnBook: HymnBook | null
  hymnNumber: number | null
  hymnTitle: string | null
  freeSongTitle: string | null
  /** The printed wording, when it differs from the hymnal's. */
  text: string
}

/**
 * One button showing the chosen song, opening a popover to change it. Book +
 * number is the fast path — the title fills in the moment it resolves, so the
 * printed reference cannot be wrong. Title search is the fallback, and a song in
 * neither hymnal is free text with no reference.
 */
export function SongButton({value, onChange}: {value: SongValue; onChange: (next: Partial<SongValue>) => void}) {
  const [open, setOpen] = useState(false)
  const numberRef = useRef<HTMLInputElement>(null)
  const [book, setBook] = useState<HymnBook>(value.hymnBook ?? 'burgundy')
  const [number, setNumber] = useState(value.hymnNumber != null ? String(value.hymnNumber) : '')
  const [search, setSearch] = useState('')

  const numberQuery = useQuery({
    queryKey: musicScheduleKeys.hymns(`n:${number}`),
    queryFn: () => searchMusicHymns(number),
    enabled: open && number.trim().length > 0,
  })
  const searchQuery = useQuery({
    queryKey: musicScheduleKeys.hymns(search),
    queryFn: () => searchMusicHymns(search),
    enabled: open && search.trim().length > 1,
  })
  const numberMatch = numberQuery.data?.find((h) => h.book === book && String(h.number) === number.trim())

  const ref = hymnRef(value.hymnBook, value.hymnNumber)
  const shown =
    value.text.trim() || value.freeSongTitle?.trim() || (value.hymnTitle ? toTitleCase(value.hymnTitle) : '')

  const pick = (h: HymnOption) => {
    setBook(h.book)
    setNumber(String(h.number))
    setSearch('')
    onChange({hymnId: h.id, hymnBook: h.book, hymnNumber: h.number, hymnTitle: h.title, freeSongTitle: null})
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 min-w-0 flex-1 justify-start font-normal">
          <Music className="mr-2 h-3 w-3 shrink-0 opacity-60" />
          {ref ? <span className="mr-2 font-medium">{ref}</span> : null}
          <span className="truncate">{shown || <span className="text-muted-foreground">Pick a song…</span>}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-3"
        align="start"
        // Book + number is the fast path, so opening lands on the number rather
        // than on the book Select that Radix would focus first. Selected, not
        // just focused: the next keystroke replaces the number already there.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          numberRef.current?.focus()
          numberRef.current?.select()
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-xs">Book and number</Label>
          <div className="flex items-center gap-1">
            <Select value={book} onValueChange={(v) => setBook(v as HymnBook)}>
              <SelectTrigger size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="burgundy">B</SelectItem>
                <SelectItem value="silver">S</SelectItem>
              </SelectContent>
            </Select>
            <Input
              ref={numberRef}
              className="h-8 w-20 text-xs"
              placeholder="#"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onBlur={() => numberMatch && pick(numberMatch)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && numberMatch) pick(numberMatch)
              }}
            />
            <span className="text-muted-foreground truncate text-xs">
              {numberMatch
                ? toTitleCase(numberMatch.title)
                : number.trim() && !numberQuery.isFetching
                  ? `no ${book} #${number}`
                  : ''}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Or search by title</Label>
          <Input className="h-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search.trim().length > 1 && searchQuery.data?.length ? (
            <div className="max-h-40 overflow-y-auto rounded border text-xs">
              {searchQuery.data.slice(0, 15).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="hover:bg-muted block w-full px-2 py-1 text-left"
                  onClick={() => pick(h)}
                >
                  <span className="font-medium">{hymnRef(h.book, h.number)}</span> {toTitleCase(h.title)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Printed as</Label>
          <Input
            className="h-8 text-xs"
            placeholder={value.hymnTitle ? toTitleCase(value.hymnTitle) : 'hymnal title'}
            value={value.text}
            onChange={(e) => onChange({text: e.target.value})}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Not in either book</Label>
          <Input
            className="h-8 text-xs"
            placeholder="type the title…"
            value={value.freeSongTitle ?? ''}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? {freeSongTitle: e.target.value, hymnId: null, hymnBook: null, hymnNumber: null, hymnTitle: null}
                  : {freeSongTitle: null},
              )
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
