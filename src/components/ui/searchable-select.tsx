import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {cn} from '@/lib/utils'
import {CheckIcon, ChevronDownIcon} from 'lucide-react'
import {useCallback, useRef, useState} from 'react'

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
            "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-card px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 h-9 cursor-pointer",
            className,
          )}
          data-placeholder={!selectedLabel ? '' : undefined}
        >
          <span className={cn('line-clamp-1', !selectedLabel && 'text-muted-foreground')}>
            {selectedLabel || placeholder || 'Select...'}
          </span>
          <ChevronDownIcon className="size-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {searchable && (
          <div className="p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div ref={listRef} className="max-h-60 overflow-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No results</p>
          ) : (
            filtered.map((option, i) => (
              <button
                key={option.value}
                type="button"
                ref={i === highlightIndex ? (el) => el?.scrollIntoView({block: 'nearest'}) : undefined}
                className={cn(
                  'relative flex w-full items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none cursor-pointer',
                  i === highlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent hover:text-accent-foreground',
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
