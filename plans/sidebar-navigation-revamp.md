# Sidebar Navigation Revamp

## Context

Central Flock is evolving from a messaging + devotion tracker into a central ministry tooling hub. The current flat sidebar lists all 10+ nav items in a single column with a divider — this won't scale as more tool categories are added. The revamp groups navigation into collapsible dropdown sections (like shadcn sidebar-07), where each "tool" is a parent that expands to reveal its child pages. Shortcuts button is removed from the footer.

## Navigation Structure

```
[Central Flock Logo]

Messaging ▾ (collapsible)
  Dashboard
  People
  Groups
  Messages
  Templates

Devotions ▾ (collapsible)
  Stats
  Devotions
  Scriptures
  Passages
  Audit

─────────────
Settings
Theme toggle
Logout (conditional)
```

## Implementation Steps

### 1. Create nav config — `src/lib/nav-config.ts` (new file)

Extract navigation data into a shared config file. Both `App.tsx`, the keyboard shortcuts hook, and the shortcuts dialog will import from here.

```ts
type NavChild = { to: string; label: string; icon: LucideIcon; end?: boolean }
type NavGroup = { id: string; label: string; icon: LucideIcon; children: NavChild[] }

const navGroups: NavGroup[] = [
  { id: 'messaging', label: 'Messaging', icon: MessageSquare, children: [...] },
  { id: 'devotions', label: 'Devotions', icon: BookOpen, children: [...] },
]
```

- Adding a future tool = one new entry in this array
- `end: true` on `/` and `/devotions` for exact-match routing
- Remove `shortcut` property from all items (no longer displayed inline)

### 2. Create `CollapsibleNavGroup` component — `src/components/collapsible-nav-group.tsx` (new file)

Uses `Collapsible` from `radix-ui` (already installed via `radix-ui@1.4.3` monorepo).

Key behavior:

- **Auto-expand**: If any child route is active (via `useLocation()`), the group is forced open
- **User toggle**: When no child is active, user can manually expand/collapse
- **Default**: All groups start expanded
- **Animation**: `animate-collapsible-down` / `animate-collapsible-up` from `tw-animate-css` (already installed)
- **Chevron**: `ChevronRight` rotates to point down when open, using `data-[state=open]:rotate-90`
- **Sub-items**: Indented with `pl-4` inside the collapsible content, using existing `NavLink` styling

### 3. Refactor `SidebarNav` in `src/App.tsx`

Replace the two flat arrays (`navItems`, `devotionNavItems`) and the inline rendering with:

```tsx
function SidebarNav({onNavClick}) {
  return (
    <nav className="flex-1 p-2 space-y-2 overflow-y-auto">
      {navGroups.map((group) => (
        <CollapsibleNavGroup key={group.id} group={group} onNavClick={onNavClick} />
      ))}
    </nav>
  )
}
```

### 4. Update `SidebarFooter` in `src/App.tsx`

- Remove the Shortcuts button entirely
- Remove `setShortcutsOpen` prop (no longer needed from footer)
- Keep: Settings NavLink, Theme toggle, conditional Logout
- Remove `Keyboard` icon import from lucide-react
- The `?` keyboard shortcut still works via `useKeyboardShortcuts` — just no sidebar button

### 5. Update `BottomTabBar` in `src/App.tsx`

Generalize using `navGroups` instead of hardcoded arrays:

- Primary group (messaging) always shown as the main bottom bar
- When user is in a secondary group's routes, that group's children appear as a sub-bar above
- Driven by `navGroups` so future tools auto-appear on mobile too

### 6. Update `src/hooks/use-keyboard-shortcuts.ts`

Replace hardcoded `NAV_ROUTES` array with routes derived from `navGroups`:

```ts
import {navGroups} from '@/lib/nav-config'

const NAV_ROUTES = navGroups.flatMap((g) => g.children.map((c) => c.to))
```

### 7. Update `src/components/keyboard-shortcuts-dialog.tsx`

Derive the Navigation/Devotions shortcut categories from `navGroups` instead of hardcoded lists. Keep the Actions category as-is.

## Files Modified

| File                                           | Change                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/nav-config.ts`                        | **New** — shared nav group configuration                                |
| `src/components/collapsible-nav-group.tsx`     | **New** — collapsible nav group component                               |
| `src/App.tsx`                                  | Refactor SidebarNav, SidebarFooter, BottomTabBar; remove old nav arrays |
| `src/hooks/use-keyboard-shortcuts.ts`          | Derive NAV_ROUTES from nav-config                                       |
| `src/components/keyboard-shortcuts-dialog.tsx` | Derive shortcuts from nav-config                                        |

## Verification

1. `pnpm dev` — start the app and verify in browser:
   - Sidebar shows two collapsible groups (Messaging, Devotions)
   - Clicking a group header expands/collapses it
   - Active route's parent group auto-expands
   - Sub-items navigate correctly
   - Shortcuts button is gone from footer
   - Settings, theme toggle, logout still work
2. Navigate to devotion routes — verify mobile bottom tab bar shows devotion sub-tabs
3. Test keyboard shortcuts still work (Cmd+1-9, Cmd+K, Cmd+J, etc.)
4. `pnpm lint` — ensure no type errors or lint issues
