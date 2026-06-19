import {Badge} from '@/components/ui/badge'
import type {HymnBook} from '@/lib/hymns-api'
import {cn} from '@/lib/utils'

export function BookNumberBadge({book, number}: {book: HymnBook; number: number}) {
  const label = `${book === 'burgundy' ? 'Burgundy' : 'Silver'} #${number}`
  return (
    <Badge
      className={cn(
        book === 'burgundy'
          ? 'bg-red-900 text-white border-red-950'
          : 'bg-zinc-300 text-zinc-900 border-zinc-400 dark:bg-zinc-400 dark:text-zinc-900',
      )}
    >
      {label}
    </Badge>
  )
}
