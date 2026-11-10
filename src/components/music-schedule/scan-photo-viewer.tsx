import {Button} from '@/components/ui/button'
import {ZoomIn, ZoomOut} from 'lucide-react'
import {useState} from 'react'

const ZOOMS = [1, 1.5, 2, 3]

/**
 * The pastor's pages from a Schedule Scan, one at a time, zoomable. Scrolls inside
 * its own box so a song can be checked against the handwriting while the order
 * stays where it is. Pinch-zoom on a tablet works natively inside the scroller.
 */
export function ScanPhotoViewer({photos, className}: {photos: string[]; className?: string}) {
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(0)
  if (!photos.length) return null
  const current = photos[Math.min(page, photos.length - 1)]

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className ?? ''}`}>
      <div className="flex items-center gap-1">
        {photos.map((_, i) => (
          <Button
            key={i}
            size="sm"
            variant={i === page ? 'default' : 'outline'}
            className="h-8 min-w-10 pointer-coarse:h-10"
            onClick={() => setPage(i)}
          >
            Page {i + 1}
          </Button>
        ))}
        <div className="ml-auto flex gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"
            aria-label="Zoom out"
            disabled={zoom === 0}
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 pointer-coarse:h-10 pointer-coarse:w-10"
            aria-label="Zoom in"
            disabled={zoom === ZOOMS.length - 1}
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded border bg-white">
        <img
          src={current}
          alt={`Scanned page ${page + 1}`}
          style={{width: `${ZOOMS[zoom] * 100}%`, maxWidth: 'none'}}
          className="block"
        />
      </div>
    </div>
  )
}
