import {fetchNotionStatus} from '@/lib/notion-api'
import {queryKeys} from '@/lib/query-keys'
import {useQuery} from '@tanstack/react-query'
import {NotebookText} from 'lucide-react'

export function NotionPage() {
  const {data: status} = useQuery({
    queryKey: queryKeys.notionStatus,
    queryFn: fetchNotionStatus,
  })

  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <NotebookText className="h-10 w-10 text-muted-foreground mx-auto" />
        <h2 className="text-xl font-semibold">Notion Notes</h2>
        {status?.configured === false ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Notion is not configured yet.</p>
            <p>
              Add <code className="rounded bg-muted px-1 py-0.5">NOTION_API_TOKEN</code> to the launchd plist, then
              restart the service. Anything you've shared with the integration in Notion will appear here.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pick a page from the sidebar to preview it. Use the buttons in the preview to open it in the native Notion
            app for editing.
          </p>
        )}
      </div>
    </div>
  )
}
