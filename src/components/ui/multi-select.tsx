import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {cn} from '@/lib/utils'
import {CheckIcon, ChevronDownIcon} from 'lucide-react'
import {useCallback, useEffect, useRef, useState} from 'react'

interface MultiSelectProps {
  value: string[]
  onValueChange: (value: string[]) => void
  options: {value: string; label: string}[]
  placeholder?: string
  className?: string
  searchable?: boolean
  allLabel?: string
}

export function MultiSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  searchable = true,
  allLabel = 'All',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options
  const valueSet = new Set(value)

  const triggerLabel = (() => {
    if (value.length === 0) return placeholder || allLabel
    if (value.length === 1) return options.find((o) => o.value === value[0])?.label ?? value[0]
    if (value.length === options.length) return allLabel
    return `${value.length} selected`
  })()

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
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [])

  const toggle = useCallback(
    (optionValue: string) => {
      const next = new Set(value)
      if (next.has(optionValue)) next.delete(optionValue)
      else next.add(optionValue)
      onValueChange([...next])
    },
    [value, onValueChange],
  )

  const clear = useCallback(() => {
    onValueChange([])
  }, [onValueChange])

  const selectAll = useCallback(() => {
    onValueChange(options.map((o) => o.value))
  }, [onValueChange, options])

  const isPlaceholder = value.length === 0

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            'flex w-fit items-center justify-between gap-1.5 rounded-3xl border border-transparent bg-input/50 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 h-9 cursor-pointer [&_svg]:pointer-events-none [&_svg]:shrink-0',
            className,
          )}
        >
          <span className={cn('line-clamp-1', isPlaceholder && 'text-muted-foreground')}>{triggerLabel}</span>
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        usePortal={false}
        className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden p-0 relative bg-popover/70 before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {searchable && (
          <div className="px-2 pt-2 pb-1">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex h-8 w-full rounded-2xl border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground border-b">
          <button
            type="button"
            onClick={selectAll}
            className="hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={value.length === options.length}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clear}
            className="hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={value.length === 0}
          >
            Clear
          </button>
        </div>
        <div ref={listRef} className="max-h-60 overflow-y-auto overscroll-contain p-1.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No results</p>
          ) : (
            filtered.map((option) => {
              const checked = valueSet.has(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'relative flex w-full items-center gap-2.5 rounded-2xl py-2 pr-8 pl-3 text-sm font-medium outline-hidden select-none cursor-pointer',
                    checked ? 'bg-foreground/5' : 'hover:bg-foreground/10',
                  )}
                  onClick={() => toggle(option.value)}
                >
                  {option.label}
                  {checked && (
                    <span className="absolute right-2 flex size-3.5 items-center justify-center">
                      <CheckIcon className="size-4" />
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
