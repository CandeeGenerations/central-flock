import {Input} from '@/components/ui/input'
import {cn} from '@/lib/utils'
import {Search, X} from 'lucide-react'

interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  containerClassName?: string
  ref?: React.Ref<HTMLInputElement>
  hideShortcut?: boolean
}

export function SearchInput({
  value,
  onChange,
  onClear,
  className,
  containerClassName,
  ref,
  hideShortcut,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative', containerClassName)} data-search-input>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pl-10 md:pl-9 pr-9', className)}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('')
            onClear?.()
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="h-5 w-5 md:h-4 md:w-4" />
        </button>
      ) : !hideShortcut ? (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none hidden md:inline-flex items-center rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
          {typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC') ? '⌘⇧' : 'Ctrl+Shift+'}K
        </kbd>
      ) : null}
    </div>
  )
}
