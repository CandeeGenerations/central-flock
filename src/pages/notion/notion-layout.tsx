import {NotionSidebar} from '@/components/notion/notion-sidebar'
import {Outlet} from 'react-router-dom'

export function NotionLayout() {
  return (
    <div className="flex h-full">
      <NotionSidebar />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
