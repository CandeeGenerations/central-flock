# Prayer Request

One press, from anywhere, opens a compose already addressed to the worldwide prayer chain with the
prayer template filled in, cursor on the first numbered line. An urgent need should take seconds to
send, not six clicks.

**Prayer Request** is defined in [CONTEXT.md](../CONTEXT.md), alongside the amended **Unsent
Message** and **Discard** entries. No ADR: nothing here is expensive to reverse.

## The problem

Sending one today means: Messages → Compose → open the group multi-select → find "Prayer Warriors" →
open the template picker → find "Prayer Chain" → click into the box → type. Every step is the same
every time, and the whole point of a prayer chain is speed.

Today's parts are already in place:

| Part               | Where                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| Group              | `Prayer Warriors`, id 30, 91 members                                              |
| Template           | `Prayer Chain`, id 50, no custom variables, ends `1. ` and `{{signature}}`        |
| Group preset       | `?groupId=` already read at `src/pages/message-compose-page.tsx:118`              |
| Template preset    | **missing** — a template can only be chosen by hand                               |
| Settings precedent | `schedules.fairBooth.reminderTemplateId`, `schedules.specialMusic.singerGroupIds` |

## Decisions

- **Prefilled, not restricted.** A Prayer Request is the ordinary compose page with the group and
  template preselected. Adding Deacons, excluding one person, scheduling for 6 AM, Save Draft — all
  still work. Save Draft produces an ordinary **Draft**.
- **Configured, not hardcoded.** Two settings keys, picked in Settings, following the fair booth
  precedent. Renaming the group or template can't break it.
- **Hidden until configured.** If either setting is missing or points at something deleted, the
  shortcut does not appear anywhere. Deleting the configured group or template warns first.
- **Its own compose context.** A half-written Prayer Request is kept in its own **Unsent Message**
  buffer, so a leftover plain new message can never replace the preselected group and template — and
  isn't clobbered in return.
- **Not stored.** A sent Prayer Request is a plain `manual` message. No `source` value, no history
  filter, no migration. "Prayer Request" describes how compose was started, nothing more.

## Scope

- **In:** one settings card, one compose context, three entry points, four delete warnings.
- **Out:** a separate mini compose UI, locked recipients, marking sent messages, a "last sent" hint
  on Home, multiple prayer groups (add people to Prayer Warriors instead).
- **No new routes**, so no `usage-entity-resolver.ts` entry and no new palette group.

## Phase 1: Settings

Keys, both storing a single id as a string:

- `prayerRequest.groupId`
- `prayerRequest.templateId`

1. **Seed migration** (`pnpm db:generate` for the file, body written by hand, in the style of
   `0042_double_booking_service_times.sql`): insert each key only when it is absent _and_ the target
   row exists, so a restored-from-scratch DB doesn't get dangling ids.

   Built as `0053_prayer_request_seed.sql`, matching by name rather than by id so the ids never
   have to be trusted:

   ```sql
   INSERT INTO settings (`key`, `value`)
   SELECT 'prayerRequest.groupId', CAST(id AS text) FROM groups WHERE name = 'Prayer Warriors'
   AND NOT EXISTS (SELECT 1 FROM settings WHERE `key` = 'prayerRequest.groupId')
   LIMIT 1;
   -- and the same shape for prayerRequest.templateId from templates WHERE name = 'Prayer Chain'
   ```

2. **Settings card** in `src/pages/settings-page.tsx`, following the existing cards: title "Prayer
   Request", a `SearchableSelect` of groups and one of templates, each saved with
   `updateSetting(key, value)` (`src/lib/api.ts:622`). Helper text naming what the shortcut does and
   that it stays hidden until both are set.

3. **`usePrayerRequest()`** — new hook, `src/hooks/use-prayer-request.ts`. Reads `fetchSettings`,
   `fetchGroups`, `fetchTemplates` (all already cached by React Query elsewhere) and returns:

   ```ts
   {ready: boolean, groupId: number | null, templateId: number | null, href: string}
   ```

   `ready` is true only when both ids parse _and_ resolve to a live group and template. This single
   hook decides whether each of the three entry points renders. `href` is
   `/messages/compose?prayerRequest=1`.

## Phase 2: The compose context

All in `src/pages/message-compose-page.tsx` unless noted.

1. **Read the flag.** `const isPrayerRequest = searchParams.get('prayerRequest') === '1'`.

2. **Prefill.** The existing presets are `useState` initializers, which can't wait for settings to
   load. Follow the pattern already used for drafts and the unsent buffer instead: a render-time
   init guarded by a "have I done this for this context yet" state, applying the configured group to
   `selectedGroupIds` and running the existing `handleTemplateSelect(String(templateId))`
   (`:386`) so content, vars and formats are set exactly as a manual pick would set them.

3. **`composeReady`** (`:643`) must also wait on the prayer prefill, or the unsent restore would run
   against a form that hasn't been prefilled yet and write a half-empty baseline.

4. **Cursor.** After the prefill, focus the textarea and place the caret after the last `1. ` in the
   content, falling back to the end of the text if the template no longer has one. Only on a fresh
   prefill — a restored buffer keeps the caret at the end.

5. **Page title.** "Prayer Request" instead of "Compose", so it's obvious where you are.

6. **Remount on context change.** Pressing the shortcut while already sitting on a plain compose must
   re-run the prefill. Give the route element in `src/App.tsx:627` a key derived from the compose
   context only — `draftId` / `editMessageId` / `prayerRequest` — not from the whole query string, so
   unrelated `setSearchParams` calls don't blow the form away.

7. **Discard** (`discardUnsent`, `:736`) branches: in a Prayer Request it clears the buffer and
   re-prefills a fresh Prayer Request (keeping `?prayerRequest=1`) rather than dropping to a blank
   new compose.

8. **Unsent key** — `src/lib/unsent-message.ts`:
   - `unsentKey()` takes a `prayerRequest` flag and returns `flock:unsent:prayer-request`. Order:
     `editMessageId` → `draftId` → prayer → `new`.
   - `unsentComposeHref()` gains the matching branch → `/messages/compose?prayerRequest=1`, so the
     Home **Needs attention** link reopens the Prayer Request instead of a blank compose.
   - A buffer restored while the settings are missing still restores: the group and template ids live
     in the buffer itself.

## Phase 3: Entry points

All three render only when `usePrayerRequest().ready`.

1. **Home** — `src/pages/home-page.tsx`, a `HandHeart` button directly under the `Home` heading,
   above **Needs attention**.
2. **Desktop sidebar header** — `src/App.tsx:591`, an icon button beside the collapse toggle, with a
   `Tooltip` reading "Prayer Request" (the sidebar is already wrapped in `TooltipProvider`). Icon-only
   in both states, so the collapsed rail needs no special case.
3. **Mobile top bar** — `src/App.tsx:605`, mirroring `MobileSearchButton` on the left
   (`absolute left-4`), same 8×8 hit area.
4. **Command palette** — `src/lib/search/actions.ts`. `buildCreateActions()` currently takes no
   context, so `ActionsBuildContext` (`src/lib/search/registry.ts:47`) gains
   `prayerRequest: {ready: boolean; href: string}`, supplied from `usePrayerRequest()` in
   `src/lib/search/use-search-index.ts:35`. Item: group `Create`, label "Prayer Request", icon
   `HandHeart`, keywords `prayer, chain, warriors, request, urgent`.

## Phase 4: Delete warnings

When the group or template being deleted is the configured one, the confirm dialog adds a line:
_"This is the Prayer Request group — the shortcut will be hidden until you choose another in
Settings."_ Four sites, all using `ConfirmDialog`:

- `src/pages/groups-page.tsx:312`
- `src/pages/group-detail-page.tsx` (delete mutation at `:157`)
- `src/pages/templates-page.tsx:357` — bulk delete; check whether the configured id is in the selection
- `src/pages/template-edit-page.tsx:399`

Warning only. Nothing is blocked, and nothing clears the setting — the shortcut simply hides until a
live group and template are chosen again.

## Check before shipping

- [ ] Fresh press: group and template set, caret after `1. `, one press from Home, sidebar, mobile bar, Cmd+K.
- [ ] A leftover plain new message (`flock:unsent:new`) does **not** appear in a Prayer Request, and is still there afterwards on a plain compose.
- [ ] Type half a request, reload → it comes back; Home shows the unsent notice and its link returns to the Prayer Request, not a blank compose.
- [ ] Discard inside a Prayer Request → fresh Prayer Request, not a blank compose.
- [ ] Press the shortcut while already composing a plain message → switches context, plain text preserved in its own buffer.
- [ ] Save Draft → ordinary Draft; reopening it is a normal draft compose, not a Prayer Request.
- [ ] Send → ordinary message, `source` still `manual`.
- [ ] Unset either setting → all three entry points disappear; deleting the group or template warns first.
- [ ] `pnpm lint` and `pnpm prettier` clean.
