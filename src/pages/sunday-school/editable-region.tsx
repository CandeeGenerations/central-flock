import {PAGE_PADDING_X_PX, PAGE_WIDTH_PX} from '@/components/workers-notes/page-frame'

/**
 * A transparent tap target laid over the printed page. Lives in a wrapper so
 * the page components themselves stay pure render and nothing here can reach
 * the PDF — the ADR 0005 rule.
 */
export function EditableRegion({
  label,
  top,
  height,
  onClick,
}: {
  label: string
  top: number
  height: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Edit ${label}`}
      className="group absolute cursor-pointer rounded-sm border-2 border-transparent transition-colors hover:border-sky-400/70 hover:bg-sky-200/20 active:bg-sky-300/30"
      style={{
        left: PAGE_PADDING_X_PX - 8,
        width: PAGE_WIDTH_PX - (PAGE_PADDING_X_PX - 8) * 2,
        top,
        height,
      }}
    >
      <span className="pointer-events-none absolute top-1 right-1 rounded bg-sky-500 px-1.5 py-0.5 text-[11px] text-white opacity-0 group-hover:opacity-100">
        {label}
      </span>
    </button>
  )
}
