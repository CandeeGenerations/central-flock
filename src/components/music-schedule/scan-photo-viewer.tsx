import {Button} from '@/components/ui/button'
import {ZoomableImage} from '@/components/zoomable-image'
import {useState} from 'react'

/**
 * The pastor's pages from a Schedule Scan, one at a time. Scroll or pinch to zoom
 * toward the pointer and drag to move, so a song can be checked against the
 * handwriting while the order stays where it is.
 */
export function ScanPhotoViewer({
  photos,
  className,
  fitToPhoto,
}: {
  photos: string[]
  className?: string
  /** Size the photo box to the photo's shape instead of filling the given height. */
  fitToPhoto?: boolean
}) {
  const [page, setPage] = useState(0)
  if (!photos.length) return null
  const index = Math.min(page, photos.length - 1)
  const current = photos[index]

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className ?? ''}`}>
      {photos.length > 1 ? (
        <div className="flex items-center gap-1">
          {photos.map((_, i) => (
            <Button
              key={i}
              size="sm"
              variant={i === index ? 'default' : 'outline'}
              className="h-8 min-w-10 pointer-coarse:h-10"
              onClick={() => setPage(i)}
            >
              Page {i + 1}
            </Button>
          ))}
        </div>
      ) : null}
      <ZoomableImage
        key={current}
        src={current}
        alt={`Scanned page ${index + 1}`}
        fitToPhoto={fitToPhoto}
        className={fitToPhoto ? 'bg-muted/30 rounded border' : 'bg-muted/30 min-h-0 flex-1 rounded border'}
      />
    </div>
  )
}
