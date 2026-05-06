import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {cn} from '@/lib/utils'
import {CheckIcon, ChevronDownIcon} from 'lucide-react'
import {useCallback, useEffect, useRef, useState} from 'react'

interface SearchableSelectProps {
  value: string
  onValueChange: (value: string) => void
  options: {value: string; label: string}[]
  placeholder?: string
  className?: string
  searchable?: boolean
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  searchable = true,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options

  const selectedLabel = options.find((o) => o.value === value)?.label

  // Lock page scroll while popover is open so mobile touch doesn't scroll the body behind
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = original
      }
    }
  }, [open])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setSearch('')
      setHighlightIndex(-1)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [])

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v)
    setHighlightIndex(-1)
  }, [])

  const select = useCallback(
    (optionValue: string) => {
      onValueChange(optionValue)
      setOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    },
    [onValueChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!filtered.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          select(filtered[highlightIndex].value)
        }
      }
    },
    [filtered, highlightIndex, select],
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            'flex w-fit items-center justify-between gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 h-9 cursor-pointer data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
            className,
          )}
          data-placeholder={!selectedLabel ? '' : undefined}
        >
          <span className={cn('line-clamp-1', !selectedLabel && 'text-muted-foreground')}>
            {selectedLabel || placeholder || 'Select...'}
          </span>
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-0 relative bg-popover/70 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {searchable && (
          <div className="px-2 pt-2 pb-1">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="flex h-8 w-full rounded-2xl border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div
          ref={listRef}
          className="max-h-60 overflow-y-auto overscroll-contain p-1.5"
          onWheel={(e) => {
            // Inside a scroll-locked Dialog, Radix's RemoveScroll prevents wheel default at
            // capture phase — manually advance scrollTop so the popover list still scrolls.
            if (e.defaultPrevented) e.currentTarget.scrollTop += e.deltaY
          }}
        >
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No results</p>
          ) : (
            filtered.map((option, i) => (
              <button
                key={option.value}
                type="button"
                ref={i === highlightIndex ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                className={cn(
                  'relative flex w-full items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none cursor-pointer',
                  i === highlightIndex ? 'bg-foreground/10' : 'hover:bg-foreground/10',
                )}
                onClick={() => select(option.value)}
              >
                {option.label}
                {option.value === value && (
                  <span className="absolute right-2 flex size-3.5 items-center justify-center">
                    <CheckIcon className="size-4" />
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
