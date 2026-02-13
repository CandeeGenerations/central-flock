import {Input} from '@/components/ui/input'
import {cn} from '@/lib/utils'
import {Search, X} from 'lucide-react'

interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  onClear?: () => void
  containerClassName?: string
  ref?: React.Ref<HTMLInputElement>
}

export function SearchInput({value, onChange, onClear, className, containerClassName, ref, ...props}: SearchInputProps) {
  return (
    <div className={cn('relative', containerClassName)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('pl-9 pr-9', className)}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            onClear?.()
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
