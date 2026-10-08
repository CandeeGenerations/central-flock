# AI model tests: offline unit tests + live smoke test gated on model upgrades

Central Flock has 11 Claude call sites and no tests. A model upgrade (editing
`AI_MODELS` in `server/lib/ai-models.ts`) is currently verified only by `tsc`,
which catches none of the failures model upgrades actually cause: a request
parameter the new model rejects (400), adaptive thinking eating `max_tokens`
before any text is produced, a new `refusal` stop reason, or output drift that
breaks our regex/JSON parsers. And since a commit on `main` deploys straight to
prod, the first real test is currently a user hitting the feature.

This plan adds two layers:

1. **Unit tests** (Vitest, offline, free): model-key resolution, the Haiku 4.x
   special cases, and the pure response parsers.
2. **Live smoke test** (`pnpm test:ai`, real API, cents per run): call each
   _cheap_ AI feature once with a small fixture against the currently configured
   models, against a throwaway copy of the DB.

Both run automatically from the pre-commit hook **only when the commit touches
`server/lib/ai-models.ts` or the `@anthropic-ai/sdk` version**.

## Goals

- `pnpm test` — offline unit tests, < 5s, no network, no DB.
- `pnpm test:ai` — live smoke test of the cheap features + a minimal ping of
  every `AI_MODELS` entry; prints a pass/fail table with model, stop reason,
  tokens, and estimated cost.
- Pre-commit gate: model/SDK change staged → run both; block the commit on
  failure. `SKIP_AI_TESTS=1` bypasses.
- Live tests never touch `central-flock.db` — they run against a temp copy.

## Non-goals

- Grading output _quality_ (evals). The smoke test asserts "the request is
  accepted, finishes cleanly, and parses into the expected shape", not "the
  hashtags are good".
- Expensive / externally-dependent features in the default run (see the scope
  table). They're available behind `AI_TEST_ALL=1`.
- CI. There is no CI runner here; the gate is the local pre-commit hook.

## Scope: which features run by default

| #   | Feature                     | Entry point                                     | Default run   | Why                                                                      |
| --- | --------------------------- | ----------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| 1   | Bible verses from video     | inline in `routes/devotions.ts:2270`            | ✅            | after extraction (step 3), called with a fixture transcript — no YouTube |
| 2   | Quote AI tags (Haiku)       | inline in `routes/quotes.ts:245`                | ✅            | after extraction (step 3); only Haiku call site                          |
| 3   | Devotion passage generation | `generateDevotionPassage(1)`                    | ✅            | reads DB history only                                                    |
| 4   | Devotion OCR (vision)       | `parseDevotionImage(b64, mediaType)`            | ✅            | only image-input call; needs a fixture image                             |
| 5   | Gwendolyn hashtags          | `generateHashtags(text)`                        | ✅            | string in, string out                                                    |
| 9   | Scripture check note        | `explainNotFound(block)`                        | ✅            | fixture must trigger a `not_found` finding                               |
| 10  | Sermon social               | `generateSermonSocial(transcript)`              | ✅            | short fixture transcript                                                 |
| 11  | YouTube field extraction    | `extractFieldsViaClaude({title,…})` (export it) | ✅            | call the Claude step directly — no oEmbed/transcript fetch               |
| 6   | Hymn suggestion             | `runHymnSuggestion(input)`                      | `AI_TEST_ALL` | sends the whole hymn corpus (large cached prompt)                        |
| 8   | Quote research              | `computeQuoteResearch(topic)`                   | `AI_TEST_ALL` | sends a large quote-corpus prompt                                        |
| 7   | Music search                | `runMusicSearch(topic)`                         | `AI_TEST_ALL` | web search ($10/1k searches, up to 8 per call) + external sites          |

Plus a **model ping** for every entry in `AI_MODELS` (sonnet, opus, haiku): one
tiny request using `effortConfig(model, 'low')` and a small `max_tokens`. This
matters because most features use whichever model the `defaultAiModel` setting
selects, so without the ping an upgrade to a model nobody has selected (e.g.
opus) would go untested.

## Background: things the implementation has to work around

- **`server/db/index.ts` opens and _writes to_ the prod DB on import** (WAL
  pragma, `quotes_fts` + triggers, `service_times` seed, `INSERT OR IGNORE` into
  settings/nursery config, possible `ALTER TABLE`). The path is hard-coded with
  no override. Every service except `devotion-ocr` imports it, so a test that
  merely imports a service touches prod. → Step 1.
- **No shared Anthropic client.** Eight services do `new Anthropic({apiKey})`
  per call; three files have a module-level `new Anthropic()`. Services return
  parsed results, so a test can't see `stop_reason` or `usage`. → Step 2.
- **Two call sites are inline in route handlers** and one Claude step is a
  private helper. → Step 3.
- **Services choose their model via `resolveModel(settings.defaultAiModel)`**,
  each with its own private `getConfiguredModel()`.
- **`ANTHROPIC_API_KEY` lives only in the launchd plist** (no dotenv), so a
  shell running `git commit` usually doesn't have it. → Step 7.

## Steps

### 1. DB path override

In `server/db/index.ts`, read `process.env.CENTRAL_FLOCK_DB_PATH` and fall back
to the current hard-coded path. Nothing in prod sets it, so behavior is
unchanged. Leave `drizzle.config.ts` alone.

### 2. Shared Anthropic client with a response hook

New `server/lib/anthropic-client.ts`:

- `getAnthropic(): Anthropic`. A lazily-created singleton that throws a clear
  error if `ANTHROPIC_API_KEY` is unset (matching current service behavior).
- `onAiResponse(listener: (info: {model, stopReason, usage, label?}) => void)`
  and an internal `recordAiResponse(message, label)`. Implement this as a thin
  `createMessage(params, label)` wrapper around `client.messages.create` that
  records and returns the `Anthropic.Message` unchanged. A no-op in prod (no
  listeners).

Migrate all 11 call sites to `createMessage(...)`, passing a short label (e.g.
`'quote-ai-tags'`). The label is what the smoke test keys its table on. This is
mechanical, but touches every AI file, so do it as its own commit and click
through two or three features in the app afterwards.

### 3. Make every default-run feature callable without HTTP or YouTube

- `routes/quotes.ts` `/ai-tags`: move the prompt + call + parse into
  `server/services/quote-tags.ts` → `generateQuoteTags(quoteText): Promise<{summary, tags}>`.
  The route becomes a thin wrapper.
- `routes/devotions.ts` `/bible-verses`: split the transcript fetch from the
  Claude step, giving
  `findBibleVerses(timestampedTranscript: string): Promise<string>` in a service
  file. The route keeps the `YoutubeTranscript.fetchTranscript` call.
- `services/youtube-extract.ts`: export `extractFieldsViaClaude`.
- Export the private parsers so unit tests can reach them:
  - `parseResponse` in devotion-generation
  - `parseAiResponse` in hymn-suggestion, music-search and quote-research

  `parseGeneration` in sermon-social is already exported.

### 4. Vitest setup

- `pnpm add -D vitest`.
- `vitest.config.ts`: `include: ['server/**/*.test.ts']`,
  `exclude: ['**/*.ai.test.ts']`, `environment: 'node'`.
- `vitest.ai.config.ts`:
  - `include: ['server/**/*.ai.test.ts']`
  - `testTimeout: 180_000`
  - `fileParallelism: false`
  - `globalSetup: 'server/test/ai-global-setup.ts'`
- Scripts:
  - `"test": "vitest run"`
  - `"test:ai": "vitest run -c vitest.ai.config.ts"`
- Make sure `tsconfig.server.json` type-checks the test files (or excludes them
  and gets its own small tsconfig). `pnpm lint` has to stay green either way.

### 5. Unit tests (`pnpm test`)

`server/lib/ai-models.test.ts`:

- every `AI_MODEL_KEYS` entry has an `AI_MODELS` ID matching `/^claude-[a-z]+-\d/`
  and no date suffix
- `resolveModel`:
  - each key → its ID
  - each `LEGACY_MODEL_TO_KEY` entry → the _current_ ID for its key
  - `null`, `''` and garbage → `AI_MODELS[DEFAULT_AI_MODEL_KEY]`
- `effortConfig`: `{}` for `claude-haiku-4-5`, `{output_config:{effort}}` for
  every current `AI_MODELS` value
- `webSearchTool`: `web_search_20250305` for `claude-haiku-4-5`,
  `web_search_20260209` for every current `AI_MODELS` value
- **Guard test:** the current model IDs must not appear in
  `LEGACY_MODEL_TO_KEY`. This catches a half-finished upgrade.

Parser tests, one file per service (`*.test.ts` next to the service). Each one
feeds a recorded good response and asserts the parsed shape. Add a case for
the failure each parser is meant to handle: hymn-suggestion `flow` ≠ 6 steps,
a fenced JSON response for OCR, and a sermon quote whose text isn't in the
transcript.

Save the fixture responses under `server/test/fixtures/responses/`. Get them
from a first `pnpm test:ai` run: the hook from step 2 can dump raw text when
`AI_TEST_RECORD=1` is set.

### 6. Live smoke test (`pnpm test:ai`)

`server/test/ai-global-setup.ts`:

- if `ANTHROPIC_API_KEY` is unset, fail fast with a message saying how to set it
- copy the prod DB to a temp file with better-sqlite3's online `db.backup(tmpPath)`,
  which is safe while the service has the DB open in WAL mode
- set `process.env.CENTRAL_FLOCK_DB_PATH` to the copy
- teardown deletes the copy

Writes such as the `quote_searches` row from `runQuoteResearch` therefore go to
the copy and are thrown away.

Optional `AI_TEST_MODEL=sonnet|opus|haiku` writes `defaultAiModel` into the
copy so the features run against that model. Default: leave the prod setting
as-is, so the test exercises what users actually get.

`server/test/ai-smoke.ai.test.ts`:

- `beforeAll`: subscribe with `onAiResponse` and collect every response.
- **Model pings:** for each `AI_MODELS` entry, one `createMessage` with
  `max_tokens: 1024`, `effortConfig(model, 'low')` and the prompt `"Reply with
the word OK."`. Assert that `stop_reason === 'end_turn'` and that there is a
  text block.
- **One `it` per default-run feature**, each with a fixture from
  `server/test/fixtures/` (a ~10-line transcript, a short quote, a ~300-word
  sermon excerpt, one real devotion-sheet image ≤ 200 KB, and so on). Each test
  asserts:
  - no thrown `Anthropic.APIError` (a 400 here is the usual sign that a
    request parameter was removed)
  - for every response recorded during the test, `stop_reason` is `end_turn`.
    Catch `max_tokens` and `refusal` explicitly, with messages like "thinking
    used up max_tokens — raise it or lower effort".
  - **Shape**, per feature. Assert structure, not wording:
    - **#2 quote tags:** `tags.length ≥ 1`, `summary` is non-empty
    - **#3 devotion generation:** one passage with `title`, `bibleReference`
      and `talkingPoints`
    - **#4 OCR:** `devotions.length ≥ 1` and month/year present
    - **#5 hashtags:** contains `#`
    - **#9 scripture check:** the returned `BlockCheck` has a note
    - **#10 sermon social:** `bigIdea` is non-empty and `scriptures` or
      `reflections` is non-empty
    - **#11 YouTube fields:** an object is returned and
      `songTitle || performers` is set for a fixture title like
      `"Amazing Grace – Smith Family – 2026-05-03"`
    - **#1 bible verses:** non-empty text containing a reference-like pattern
- Wrap the `AI_TEST_ALL` features in `describe.runIf(process.env.AI_TEST_ALL)`.
- `afterAll`: print a table with columns label, model, stop_reason, input
  tokens, output tokens and est. $. Price from a small per-model rate map in
  the test file; it's only an estimate.

**Fixture to collect manually:** one representative devotion-sheet photo for
OCR. Strip anything sensitive; it's committed to the repo.

**Target cost of a default run:** under $0.25. If it's higher, shrink the
fixtures.

### 7. Pre-commit gate

Add this to `.husky/pre-commit` after `npx lint-staged`:

```bash
# Model/SDK upgrades: run the offline + live AI tests before the commit (which deploys).
if [[ -z "${SKIP_AI_TESTS:-}" ]] && {
  git diff --cached --name-only | grep -qx 'server/lib/ai-models.ts' ||
  git diff --cached -U0 package.json | grep -q '^[+-].*"@anthropic-ai/sdk"'
}; then
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    ANTHROPIC_API_KEY=$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:ANTHROPIC_API_KEY' \
      "$HOME/Library/LaunchAgents/cc.cgen.central-flock.plist" 2>/dev/null) && export ANTHROPIC_API_KEY
  fi
  echo "pre-commit: AI model/SDK change detected → pnpm test && pnpm test:ai (SKIP_AI_TESTS=1 to bypass)"
  pnpm test && pnpm test:ai || exit 1
fi
```

Notes:

- The key is read from the plist so the hook works from a plain shell and from
  GUI git clients, the same reason post-commit sources `.env.deploy`. Confirm
  the plist key path with `PlistBuddy -c Print` first.
- The `package.json` check matches an `@anthropic-ai/sdk` line on either side
  of the staged diff. A plain dependency bump stages exactly that kind of
  change.
- Optionally also run `pnpm test` (offline only) on _every_ commit that touches
  `server/`. It's cheap, but it's a separate decision.

### 8. Docs

- **CLAUDE.md → Commands:** add `pnpm test` and `pnpm test:ai`.
- **CLAUDE.md → Key Patterns:** add one line: "Claude models are configured
  only in `server/lib/ai-models.ts`. Changing it (or the SDK version) triggers
  `pnpm test:ai` in pre-commit. New AI features should call through
  `createMessage` and add a smoke test."
- **RUNBOOK.md:** add a short "Upgrading Claude models" section. It should
  cover:
  - the edit
  - adding the old IDs to `LEGACY_MODEL_TO_KEY`
  - checking each new model's breaking changes: `temperature`/`top_p`,
    prefill, forced `tool_choice`, disabling thinking, the default effort, and
    whether `max_tokens` leaves room for thinking
  - running `AI_TEST_ALL=1 pnpm test:ai` once by hand before committing

## Commit sequence

Each of these is a separate commit on `main`, and each one deploys:

1. `feat(db): allow overriding the SQLite path via CENTRAL_FLOCK_DB_PATH` (step 1)
2. `refactor(ai): route all Claude calls through a shared client` (step 2).
   Click-test a couple of features after the deploy.
3. `refactor(ai): extract quote tags and bible-verse steps into services` (step 3)
4. `test: add vitest with ai-models and parser unit tests` (steps 4–5)
5. `test(ai): add live smoke test against a DB copy` (step 6)
6. `chore: gate model/SDK changes on AI tests in pre-commit` + docs (steps 7–8)

## Open questions

- **Commit-time model:** should the smoke test run the features against the
  `defaultAiModel` setting (what users get, the current plan) or loop over
  every model key? Looping triples the cost; the model pings already cover
  "does the new ID accept our standard request shape".
- **SDK:** bump `@anthropic-ai/sdk` 0.131 → 0.132.1 while here (it adds the
  `claude-haiku-5-5` literal)? Doing it in commit 6 exercises the new gate.
