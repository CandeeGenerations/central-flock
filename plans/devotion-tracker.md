# Devotion Tracker

A sub-app within Central Flock for tracking daily devotional video production. Replaces Google Sheets with a searchable, filterable database and production pipeline tracker.

## Architecture

Uses a **separate SQLite database** (`devotions.db`) from the main app (`central-flock.db`) to avoid any risk to existing functionality. Shares the same Express server, Vite frontend, and auth middleware.

### Key Files

```
server/
├── db-devotions/
│   ├── schema.ts          # Drizzle schema (devotions table)
│   └── index.ts           # DB connection (separate devotions.db)
├── routes/
│   └── devotions.ts       # All API endpoints (~500 lines)
├── services/
│   └── devotion-import.ts # XLSX parsing + Note field parser
├── lib/
│   └── bible-reference.ts # Scripture reference parser + normalizer

src/
├── lib/
│   └── devotion-api.ts    # Typed API client + song template generators
├── pages/devotions/
│   ├── devotion-list-page.tsx       # Main table with filters + inline toggling
│   ├── devotion-detail-page.tsx     # Create/edit form + publishing + song upload
│   ├── devotion-stats-page.tsx      # Dashboard with charts + audit/scripture links
│   ├── devotion-scriptures-page.tsx # Verse lookup + duplicate reference table
│   └── devotion-audit-page.tsx      # Data quality report

drizzle-devotions.config.ts  # Separate Drizzle config for devotions DB
```

### Database Schema

Single `devotions` table in `devotions.db`:

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | Auto-increment |
| date | text | YYYY-MM-DD |
| number | integer unique | Sequential devotion number (#1 through #2226+) |
| devotionType | text | `original`, `favorite`, `guest`, or `revisit` |
| subcode | text? | "E-14" for originals, "001 - R-G" for guests |
| guestSpeaker | text? | "Tyler", "Gabe", or "Ed" |
| guestNumber | integer? | Speaker's sequential number |
| referencedDevotions | text? | JSON array of devotion numbers, e.g. `[1801, 1439]` |
| bibleReference | text? | "John 3:16", "Romans 8:28-30" |
| songName | text? | Optional song title |
| title | text? | Publishing title (from guide import) |
| youtubeDescription | text? | YouTube-specific description |
| facebookDescription | text? | Facebook/Instagram description |
| podcastDescription | text? | Podcast description |
| produced | boolean | Pipeline: content produced |
| rendered | boolean | Pipeline: video rendered |
| youtube | boolean | Pipeline: uploaded to YouTube |
| facebookInstagram | boolean | Pipeline: uploaded to FB/IG |
| podcast | boolean | Pipeline: uploaded to podcast |
| notes | text? | Free-text notes |
| createdAt/updatedAt | text | Timestamps |

### Database Commands

```bash
pnpm db:devotions:migrate   # Push schema changes to devotions.db
pnpm db:devotions:generate  # Generate migration files
pnpm db:devotions:studio    # Open Drizzle Studio for devotions DB
```

## API Endpoints

All under `/api/devotions`, protected by `requireAuth` middleware.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List with pagination, filtering, sorting, search (including by #number) |
| GET | `/:id` | Single devotion |
| POST | `/` | Create devotion |
| PUT | `/:id` | Update devotion |
| DELETE | `/:id` | Delete devotion |
| PATCH | `/:id/toggle/:field` | Quick-toggle a pipeline boolean |
| GET | `/stats` | Dashboard statistics (type breakdown, completion rates, etc.) |
| GET | `/stats/scriptures` | Most used scriptures (parsed + normalized, excludes revisits) |
| GET | `/stats/speakers` | Per-speaker breakdown with yearly counts |
| GET | `/audit` | Data quality report (missing numbers, gaps, missing refs, etc.) |
| GET | `/scriptures/duplicates` | All duplicate scripture references with verse overlap detection |
| GET | `/scriptures/lookup?search=` | Search for verse usage with parsed matching |
| GET | `/months` | Distinct months with data (for filter dropdown) |
| GET | `/next-number` | Next sequential devotion number |
| POST | `/import` | Import from xlsx (base64 in JSON body) |
| POST | `/import-guide` | Import publishing guide JSON (matches by number) |

### List Filters

`search` (text + number), `dateFrom`, `dateTo`, `devotionType`, `guestSpeaker`, `status` (complete/incomplete), `page`, `limit`, `sort`, `sortDir`

## Frontend Pages

### Devotion List (`/devotions`)
- Table: Date, #, Type (color-coded badges), Reference, Song, 5 pipeline checkboxes, action menu
- **Inline toggling**: Click pipeline checkboxes to toggle directly from the table (PATCH)
- **Filters**: Search, type, speaker, status, month (data-driven dropdown)
- **Action menu** (⋮): Find on YouTube, copy publishing fields (title, descriptions, song title/description)
- Sortable by date and number, paginated with page numbers

### Devotion Detail (`/devotions/:id` or `/devotions/new`)
- Create/edit form with conditional fields based on type
- **Type layouts**: Original shows subcode, Guest shows speaker + number, Revisit shows referenced devotions
- **Pipeline checkboxes** in a row
- **Publishing section** (collapsible): Title + 3 platform descriptions with copy-to-clipboard
- **Song Upload section** (auto-generated, shown when song + original/favorite): YouTube title and description with copy buttons
- **Bible reference** links to BibleGateway (AKJV)
- **YouTube link** in header to search for the devotion on the channel

### Stats Dashboard (`/devotions/stats`)
- Stat cards: Total, Latest #, Completion Rate, Audit Issues (links to audit), Duplicate Verses (links to scriptures)
- Donut chart: Type breakdown (Tyler separate, Gabe+Ed as "Other Guests"), sorted by size
- Pipeline completion rates: 5 progress bars (green at 100%, yellow 50-99%, red <50%)
- Recent incomplete devotions table

### Scripture Lookup (`/devotions/scriptures`)
- **Verse search**: Type a reference to check if it's been used. Shows "hasn't been used yet" if clean.
- **Duplicate references table**: Every verse used more than once, click to open modal
- **Modal**: Shows each devotion using that verse with YouTube search link
- Smart parsing: `John 14:2-4` matches `John 14:3`, handles book name normalization, multi-reference strings

### Audit Report (`/devotions/audit`)
- Collapsible sections, auto-expanded when issues found, disabled when clean
- **Missing devotion numbers** (known gaps #644-645 excluded)
- **Date gaps** and **duplicate dates**
- **Missing bible references** (by type)
- **Guests missing number** or **missing speaker**
- **Guest number sequence gaps** per speaker

## Key Patterns

### Devotion Types
| Type | Description | Badge Color |
|------|-------------|-------------|
| original | Original devotion | Red |
| favorite | Classic/favorite hymn | Purple |
| guest | Guest speaker (Tyler, Gabe, Ed) | Blue |
| revisit | Re-air of older devotion | Green |

### Note Field Parsing (`parseNoteField`)
Parses the spreadsheet "Note" column into structured fields:
- `"Original (E-14)"` → type=original, subcode="E-14"
- `"Tyler #310 (35)"` → type=guest, speaker=Tyler, guestNumber=310, subcode="35"
- `"Favorite"` → type=favorite
- `"Revisit #248"` / `"Renumber #1833 as #2200"` / `"Script #1114"` → type=revisit
- `"#1801 / #1439"` → type=revisit, referencedDevotions=[1801, 1439]

### Bible Reference Parsing (`server/lib/bible-reference.ts`)
Handles: `John 14:2` | `John 14:2b` | `John 14:2-3` | `John 14:2; 15:1` | `John 14:2; 2 Timothy 1:1`
- Normalizes book names via alias map
- Expands ranges into individual verses for overlap detection
- Carries forward book name across semicolon-separated segments

### Song Upload Templates (`devotion-api.ts`)
Auto-generated YouTube title and description for song videos:
- **Original** → Series: "Songs I Love to Sing" (`#songsilovetosing`)
- **Favorite** → Series: "My Take on Your Favorite Songs" (`#mytakeonyourfavoritesongs`)
- Attribution always: "Dr. Brad Weniger, Sr. | Pastor"
- Church: "CBC - Central Baptist Church (Woodbridge, VA)"
- Double-spaced description for YouTube paste formatting

### XLSX Import Header Detection
The import service handles column header evolution across 6 years of spreadsheets:
- Maps variants: "Facebook" / "FB / IG" / "FB/IG" → `facebookInstagram`
- Maps: "Rendered" / "R / V" / "R/V" / "Validated" → `rendered`
- Handles August 2023 bug: duplicate "Number" column (second one treated as Note)
- Skips already-mapped fields to prevent collisions

## Navigation & Keyboard Shortcuts

Sidebar section "Devotions" with separator, below main nav:
- ⌘6 → Stats
- ⌘7 → Devotions (list)
- ⌘8 → Scriptures
- ⌘9 → Audit

All shortcuts registered in `use-keyboard-shortcuts.ts` and listed in the shortcuts modal.

## Not Yet Built

- **Claude Vision OCR**: Scan handwritten monthly sheets → parse via Claude API → review → import. Requires `ANTHROPIC_API_KEY` in launchd plist.
- **YouTube API integration**: Auto-fetch video IDs to link directly to YouTube Studio. Requires YouTube Data API key.
- **Import page UI** (`devotion-import-page.tsx`): Browser-based xlsx file upload (currently imported via script)
- **Scan page UI** (`devotion-scan-page.tsx`): Photo upload for handwritten sheet OCR
