import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog'

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl'

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      {keys: [`${mod} 1`], description: 'Go to Dashboard'},
      {keys: [`${mod} 2`], description: 'Go to People'},
      {keys: [`${mod} 3`], description: 'Go to Groups'},
      {keys: [`${mod} 4`], description: 'Go to Messages'},
      {keys: [`${mod} 5`], description: 'Go to Templates'},
    ],
  },
  {
    category: 'Actions',
    items: [
      {keys: [`${mod} K`], description: 'Focus search'},
      {keys: [`${mod} J`], description: 'Quick compose'},
      {keys: [`${mod} P`], description: 'Add person'},
      {keys: [`${mod} D`], description: 'Toggle dark mode'},
      {keys: [`${mod} ,`], description: 'Open settings'},
      {keys: ['?'], description: 'Show keyboard shortcuts'},
    ],
  },
]

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({open, onOpenChange}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">{group.category}</h4>
              <div className="space-y-2">
                {group.items.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between">
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex items-center gap-1 rounded border bg-muted px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
