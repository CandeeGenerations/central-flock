# Gloo Clone - Comprehensive Implementation Plan

## Context

We are building a local clone of the texting platform Gloo. The app manages contacts/people, organizes them into groups, and sends iMessages via macOS AppleScript integration. It also supports creating contacts in the macOS Contacts app. The app is for personal/local use on macOS only.

We have an existing CSV file (`gloo-people.csv`) with ~440 contacts to import as seed data.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Vite + React Frontend          │
│         (shadcn/ui + Tailwind CSS)          │
│                                             │
│  Pages: People | Groups | Messages | Import │
└──────────────────┬──────────────────────────┘
                   │ REST API (proxied in dev)
┌──────────────────▼──────────────────────────┐
│            Express.js Backend               │
│                                             │
│  Routes: /api/people, /api/groups,          │
│          /api/messages, /api/import,         │
│          /api/contacts                      │
│                                             │
│  Services: AppleScript, CSV Parser,         │
│            Message Queue/Batcher            │
└───────┬─────────────────────┬───────────────┘
        │                     │
   ┌────▼────┐         ┌─────▼──────┐
   │ SQLite  │         │  osascript  │
   │ (Drizzle│         │ (iMessage + │
   │  ORM)   │         │  Contacts)  │
   └─────────┘         └────────────┘
```

### Why These Choices?

**SQLite + Drizzle ORM** (over JSON files or Docker DB):
- Relational data (people, groups, memberships) maps perfectly to SQL
- Single file database, no server/Docker needed
- Drizzle provides full TypeScript type safety with zero runtime overhead
- Easy backup: just copy the `.db` file
- Complex queries (filter by group, search by name, etc.) are trivial
- Can handle thousands of records with no issues

**Express.js backend** (over Electron/Tauri):
- AppleScript requires shell access via `child_process.exec` calling `osascript`
- Simplest approach: local Express server handles API + AppleScript execution
- No heavy framework overhead
- In dev: Vite dev server proxies `/api` to Express on port 3001
- In prod: Express serves the built Vite static files

---

## Data Storage: Database Schema

### Tables

```
people
├── id (integer, PK, auto-increment)
├── firstName (text, nullable)
├── lastName (text, nullable)
├── phoneNumber (text, not null, unique) -- E.164 format: +15714668202
├── phoneDisplay (text) -- Original format: (571) 466-8202
├── status (text, default 'active') -- 'active' | 'inactive'
├── notes (text, nullable)
├── createdAt (timestamp)
└── updatedAt (timestamp)

groups
├── id (integer, PK, auto-increment)
├── name (text, not null, unique)
├── description (text, nullable)
├── createdAt (timestamp)
└── updatedAt (timestamp)

people_groups (junction table)
├── personId (integer, FK → people.id, ON DELETE CASCADE)
├── groupId (integer, FK → groups.id, ON DELETE CASCADE)
└── PRIMARY KEY (personId, groupId)

messages
├── id (integer, PK, auto-increment)
├── content (text, not null) -- raw template text
├── renderedPreview (text) -- example rendered version
├── groupId (integer, FK → groups.id, nullable) -- null if sent to individuals
├── serviceType (text, default 'iMessage') -- 'iMessage' | 'SMS'
├── totalRecipients (integer)
├── sentCount (integer, default 0)
├── failedCount (integer, default 0)
├── skippedCount (integer, default 0)
├── status (text) -- 'pending' | 'sending' | 'completed' | 'cancelled'
├── batchSize (integer, default 1)
├── batchDelayMs (integer, default 5000)
├── createdAt (timestamp)
└── completedAt (timestamp, nullable)

message_recipients
├── id (integer, PK, auto-increment)
├── messageId (integer, FK → messages.id, ON DELETE CASCADE)
├── personId (integer, FK → people.id)
├── renderedContent (text) -- personalized message
├── status (text) -- 'pending' | 'sent' | 'failed' | 'skipped'
├── errorMessage (text, nullable)
├── sentAt (timestamp, nullable)
└── skipped (boolean, default false)
```

### Phone Number Strategy
- **Store in E.164**: `+15714668202` (for uniqueness and AppleScript compatibility)
- **Keep display format**: `(571) 466-8202` (for UI display)
- **Normalization on import**: Strip all non-digits, prepend `+1` if 10 digits

---

## Project Structure

```
gloo-clone/
├── plans/
├── public/
├── server/                          # Backend
│   ├── index.ts                     # Express app entry point
│   ├── db/
│   │   ├── schema.ts                # Drizzle schema definitions
│   │   ├── index.ts                 # DB connection + Drizzle instance
│   │   └── migrations/              # Generated migrations
│   ├── routes/
│   │   ├── people.ts                # CRUD for people
│   │   ├── groups.ts                # CRUD for groups
│   │   ├── messages.ts              # Send + history
│   │   ├── import.ts                # CSV import
│   │   └── contacts.ts              # macOS contact creation
│   └── services/
│       ├── applescript.ts           # iMessage + Contacts AppleScript
│       ├── csv-parser.ts            # CSV parsing + normalization
│       └── message-queue.ts         # Batch sending orchestration
├── src/                             # Frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── lib/
│   │   ├── utils.ts                 # shadcn cn() utility
│   │   └── api.ts                   # Fetch wrapper for /api calls
│   ├── components/
│   │   └── ui/                      # shadcn components
│   ├── pages/
│   │   ├── people-page.tsx          # People list + CRUD
│   │   ├── person-detail-page.tsx   # Individual person view/edit
│   │   ├── groups-page.tsx          # Groups list + CRUD
│   │   ├── group-detail-page.tsx    # Group members view
│   │   ├── message-compose-page.tsx # Compose + send messages
│   │   ├── message-history-page.tsx # Past messages log
│   │   └── import-page.tsx          # CSV import UI
│   ├── hooks/                       # Custom React hooks
│   └── types/                       # Shared TypeScript types
├── drizzle.config.ts                # Drizzle Kit config
├── gloo-people.csv                  # Seed data
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## Backend API Endpoints

### People
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/people` | List all (with search, filter by group/status, pagination) |
| GET | `/api/people/:id` | Get person with their groups |
| POST | `/api/people` | Create person |
| PUT | `/api/people/:id` | Update person |
| DELETE | `/api/people/:id` | Delete person |
| PATCH | `/api/people/:id/status` | Toggle active/inactive |

### Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/groups` | List all groups with member counts |
| GET | `/api/groups/:id` | Get group with members |
| POST | `/api/groups` | Create group |
| PUT | `/api/groups/:id` | Update group (name, description) |
| DELETE | `/api/groups/:id` | Delete group (keeps people) |
| POST | `/api/groups/:id/members` | Add people to group (body: { personIds: [] }) |
| DELETE | `/api/groups/:id/members` | Remove people from group |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/messages/send` | Send message (group or individuals) |
| GET | `/api/messages` | Message history |
| GET | `/api/messages/:id` | Message detail with recipient statuses |
| GET | `/api/messages/:id/status` | Poll send progress |
| POST | `/api/messages/:id/cancel` | Cancel in-progress batch |

### Import
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import/preview` | Upload CSV, return parsed preview + duplicates |
| POST | `/api/import/execute` | Execute import with user-confirmed mappings |

### macOS Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/contacts/create` | Create contact in macOS Contacts app |
| POST | `/api/contacts/create-bulk` | Create multiple contacts |

---

## Frontend Pages & Components

### Layout
- **Sidebar navigation**: People, Groups, Messages, Import
- **Top bar**: App name, dark/light mode toggle
- **Content area**: Page-specific content

### People Page
- **Data table** (shadcn) with columns: Name, Phone, Status, Groups, Actions
- **Search bar**: Filter by name or phone number
- **Filters**: By group, by status (active/inactive)
- **Actions**: Add person (dialog), edit (dialog), delete (confirm dialog), create macOS contact
- **Bulk actions**: Select multiple people, add to group, change status

### Person Detail Page
- View/edit all fields
- List of groups with ability to add/remove
- Message history for this person
- "Create in Contacts" button
- "Send Message" quick action

### Groups Page
- **Card grid or table** showing each group with member count
- Create new group (dialog)
- Edit/delete group
- Click to view members

### Group Detail Page
- Group name/description (editable)
- Member list with ability to remove
- "Add Members" dialog (search people not in group)
- "Send Message to Group" button

### Message Compose Page (most complex)
1. **Delivery Method**: Toggle between iMessage and SMS (default: iMessage)
2. **Recipient Selection**: Choose a group OR select individuals
3. **Exclusion List**: If group selected, checkboxes to skip specific people
4. **Message Editor**: Text area with template variable buttons ({{firstName}}, {{lastName}}, {{fullName}})
5. **Character Counter**: Shows character count, with SMS segment warning (160 chars) when SMS is selected
6. **Preview Panel**: Shows rendered message for a sample recipient
7. **Batch Settings**: Batch size, delay between batches (default 5 seconds)
8. **Recipient Summary**: "Sending to X of Y people via iMessage/SMS"
9. **Send Button**: Confirm dialog before sending
10. **Progress View**: Real-time progress bar, per-recipient status

### Message History Page
- List of past messages with date, recipient count, status
- Click to see details: message content, all recipients, individual statuses

### Import Page
- File upload area
- Preview table showing parsed data
- Duplicate detection warnings
- Column mapping confirmation
- Import progress + results summary

---

## AppleScript Integration

### Send Message (iMessage + SMS)

The macOS Messages app handles both iMessage and SMS (via iPhone Text Message Forwarding / Continuity). The app will support both delivery methods. macOS automatically routes to iMessage when available and falls back to SMS when not.

**Strategy**: Use the phone number directly. macOS Messages will determine the best delivery method. Optionally, the user can force a specific service type per-send.

#### Approach 1: Auto-route (Recommended Default)
```applescript
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "+15714668202" of targetService
    send "Hello John!" to targetBuddy
end tell
```
This sends via iMessage if available, and through SMS Text Message Forwarding if the recipient doesn't have iMessage (requires an iPhone paired via Continuity).

#### Approach 2: Force SMS
```applescript
tell application "Messages"
    set targetService to 1st account whose service type = SMS
    set targetBuddy to participant "+15714668202" of targetService
    send "Hello John!" to targetBuddy
end tell
```
This forces SMS delivery via iPhone Text Message Forwarding.

**Node.js wrapper:**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type ServiceType = 'iMessage' | 'SMS';

async function sendMessage(
  phoneNumber: string,
  message: string,
  serviceType: ServiceType = 'iMessage'  // auto-routes to SMS if iMessage unavailable
): Promise<void> {
  const escapedMessage = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = ${serviceType}
      set targetBuddy to participant "${phoneNumber}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;
  await execAsync(`osascript -e '${script}'`);
}
```

### Create macOS Contact
```applescript
tell application "Contacts"
    set newPerson to make new person with properties {first name:"John", last name:"Doe"}
    make new phone at end of phones of newPerson with properties {label:"mobile", value:"+15714668202"}
    save
end tell
```

### Important Considerations
- **First run**: macOS will prompt for permissions (Messages, Contacts, Accessibility). User must grant these.
- **iPhone pairing required for SMS**: To send SMS (green bubble), your iPhone must be connected to your Mac via Text Message Forwarding (Settings > Messages > Text Message Forwarding on iPhone).
- **Error handling**: AppleScript can fail silently or throw. Wrap in try-catch, log errors.
- **Rate limiting**: Sending too many messages too fast may trigger Apple/carrier throttling. Default 5-second delay between messages is recommended. SMS may have stricter carrier limits.
- **Delivery method indicator**: The UI should show whether each person's message will likely go via iMessage (blue) or SMS (green), though macOS determines this at send time.
- **SMS character limits**: Unlike iMessage, SMS has a 160-character limit per segment. Long SMS messages get split into multiple segments. The compose UI should show a character counter with an SMS warning when composing for SMS delivery.

---

## CSV Import Strategy

### Phase 1: Parse & Preview
1. Read CSV with `papaparse` (handles BOM, quoted fields with commas)
2. Normalize phone numbers: strip `()`, `-`, spaces → digits only → prepend `+1` if 10 digits
3. Parse groups: split on `,`, trim whitespace
4. Handle edge cases:
   - Missing first/last name → store as null
   - Status `-` → map to `inactive`
   - Couples: `"Brian / Heather"` → store as-is (firstName)
   - Suffixes: `"De La Paz Jr"` → store as-is (lastName)
5. Detect duplicates: same phone number = duplicate
6. Return preview to user with flagged issues

### Phase 2: Execute Import
1. Create all unique groups first
2. Create/update people (upsert by phone number)
3. Create group memberships
4. Return summary: X people created, Y groups created, Z duplicates skipped

---

## Additional Considerations

### Things to Think About

1. **Message Templates**: Save commonly used message templates for reuse (e.g., event invitations, reminders). Consider a templates table.

2. **Duplicate People**: The CSV has potential duplicates (same name, different phone numbers). Need a strategy - are these truly different people or data entry errors? The app should surface these for manual review.

3. **Phone Number Validation**: Not all phone numbers may be valid iMessage recipients. Consider a "test send" feature before blasting a whole group.

4. **Undo/Rollback**: Once messages are sent, they can't be unsent. The confirmation dialog before sending is critical. Consider a "dry run" mode.

5. **Message Scheduling**: Future enhancement - schedule messages for a specific date/time rather than sending immediately.

6. **Export/Backup**: Ability to export people/groups back to CSV. Since SQLite is a single file, the DB itself is a backup, but CSV export is useful for sharing.

7. **Activity Log/Audit Trail**: Track all actions (imports, deletes, sends) for accountability.

8. **Group Nesting/Tags**: Currently flat groups. Future enhancement could support nested groups or a tag-based system.

9. **Search & Filtering**: Global search across people, groups, and message history.

10. **Keyboard Shortcuts**: For power users - quick compose, quick search, navigate between pages.

11. **macOS Permissions**: On first run, the app will need to request permissions for Messages and Contacts. Should include setup instructions or an onboarding flow.

12. **Data Migration**: If you ever want to move to a different system, having CSV export ensures portability.

13. **SMS vs iMessage Awareness**: iMessages have no character limit, but SMS is capped at 160 chars/segment. The compose UI adapts based on selected delivery method. Some recipients may only be reachable via SMS (non-Apple devices). Consider tracking preferred delivery method per person.

14. **Phone Number Changes**: People change phone numbers. The app should make it easy to update a person's number without losing their group memberships or message history.

15. **Opt-Out Tracking**: If someone asks to stop receiving messages, need a way to mark them beyond just "inactive" - consider a "do not contact" status.

---

## Implementation Phases

### Phase 0: Project Foundation
**Goal**: Set up the full dev stack

- [ ] Install additional dependencies:
  - Backend: `express`, `cors`, `better-sqlite3`, `drizzle-orm`, `papaparse`
  - Dev: `drizzle-kit`, `tsx`, `@types/express`, `@types/better-sqlite3`, `@types/papaparse`, `concurrently`
  - Frontend: `react-router-dom`, `@tanstack/react-query` (for data fetching)
- [ ] Set up Tailwind CSS (required for shadcn)
- [ ] Initialize shadcn (`pnpm dlx shadcn@latest init`)
- [ ] Add core shadcn components: button, input, dialog, table, card, badge, toast, dropdown-menu, select, checkbox, tabs, separator, sheet (sidebar)
- [ ] Configure Vite proxy for `/api` → `localhost:3001`
- [ ] Set up `concurrently` to run Vite + Express in dev
- [ ] Create Express server entry point
- [ ] Set up Drizzle + SQLite connection
- [ ] Define database schema + run initial migration
- [ ] Add dev scripts to package.json

### Phase 1: Database & CSV Import
**Goal**: Get data into the system

- [ ] Implement CSV parser service with phone normalization
- [ ] Build import API routes (preview + execute)
- [ ] Create import page UI with preview table
- [ ] Import the gloo-people.csv seed data
- [ ] Verify data integrity after import

### Phase 2: People Management
**Goal**: Full CRUD for people

- [ ] Backend: People API routes (list, get, create, update, delete, toggle status)
- [ ] Frontend: People page with data table
- [ ] Search and filter functionality
- [ ] Add/edit person dialog
- [ ] Delete confirmation

### Phase 3: Group Management
**Goal**: Full CRUD for groups + membership management

- [ ] Backend: Groups API routes
- [ ] Frontend: Groups page (list with member counts)
- [ ] Group detail page (view/manage members)
- [ ] Add/remove members from groups
- [ ] Create/edit/delete groups

### Phase 4: Messaging Core
**Goal**: Send messages via AppleScript

- [ ] AppleScript service: send single iMessage
- [ ] Template variable rendering ({{firstName}}, {{lastName}}, {{fullName}})
- [ ] Message compose page: recipient selection, template editor, preview
- [ ] Group send with exclusion/skip functionality
- [ ] Batch sending with configurable delay
- [ ] In-memory job tracking + status polling API
- [ ] Send progress UI with per-recipient status

### Phase 5: Message History
**Goal**: Track and review sent messages

- [ ] Message history page (list view)
- [ ] Message detail view (all recipients + statuses)
- [ ] Filter by date, group, status

### Phase 6: macOS Contacts Integration
**Goal**: Create contacts in macOS Contacts.app

- [ ] AppleScript service: create single contact
- [ ] "Create Contact" button on person detail
- [ ] Bulk contact creation

### Phase 7: Polish & Enhancements
**Goal**: Improve UX and handle edge cases

- [ ] Dark/light mode toggle
- [ ] Toast notifications for actions
- [ ] Error handling improvements
- [ ] Loading states and skeletons
- [ ] Keyboard shortcuts
- [ ] Data export to CSV
- [ ] Message templates (save/reuse)
- [ ] Responsive layout refinements

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript |
| Build Tool | Vite 6 |
| UI Components | shadcn/ui + Tailwind CSS |
| Routing | React Router DOM |
| Data Fetching | TanStack React Query |
| Backend | Express.js |
| Database | SQLite via better-sqlite3 |
| ORM | Drizzle ORM |
| CSV Parsing | PapaParse |
| macOS Integration | osascript (child_process) |
| Dev Runner | concurrently (Vite + Express) |
| Package Manager | pnpm |

---

## Verification & Testing

### Per-Phase Verification
- **Phase 0**: `pnpm dev` starts both Vite and Express, shadcn components render
- **Phase 1**: CSV imports successfully, all ~440 people and ~17 groups created, verify in SQLite
- **Phase 2**: Can add/edit/delete people, search works, status toggle works
- **Phase 3**: Can create groups, add/remove members, counts are accurate
- **Phase 4**: Can compose and send a test iMessage to yourself, batch delay works, skip works
- **Phase 5**: Sent messages appear in history with correct statuses
- **Phase 6**: Contact appears in macOS Contacts.app after creation
- **Phase 7**: Dark mode works, toasts fire, export produces valid CSV

### Manual Testing Checklist
- [ ] Import CSV → verify all people and groups created
- [ ] Create a new person → verify appears in list
- [ ] Edit a person → verify changes saved
- [ ] Delete a person → verify removed from all groups
- [ ] Create a group → verify appears in list
- [ ] Add people to group → verify member count updates
- [ ] Compose message with {{firstName}} → verify preview renders correctly
- [ ] Send to group with 2 people skipped → verify skipped people didn't receive
- [ ] Send batch of 5 with 3-second delay → verify timing
- [ ] Check message history → verify all recipients and statuses
- [ ] Create macOS contact → verify in Contacts.app
- [ ] Toggle dark/light mode → verify all pages render correctly
