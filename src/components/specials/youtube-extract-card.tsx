import {Button} from '@/components/ui/button'
import {Card, CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {type YoutubeExtraction, specialsApi} from '@/lib/specials-api'
import {useMutation} from '@tanstack/react-query'
import {Loader2, Sparkles} from 'lucide-react'
import {useState} from 'react'
import {toast} from 'sonner'

interface YoutubeExtractCardProps {
  initialUrl?: string
  onExtracted: (result: YoutubeExtraction, sourceUrl: string) => void
}

export function YoutubeExtractCard({initialUrl, onExtracted}: YoutubeExtractCardProps) {
  const [url, setUrl] = useState(initialUrl ?? '')

  const mutation = useMutation({
    mutationFn: (u: string) => specialsApi.fromYoutube(u),
    onSuccess: (data) => {
      toast.success('Extracted YouTube data')
      onExtracted(data, url)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <Label htmlFor="yt-url">Paste a YouTube URL to auto-fill</Label>
        <div className="flex gap-2">
          <Input
            id="yt-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <Button type="button" onClick={() => url.trim() && mutation.mutate(url.trim())} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-2">Auto-fill</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
