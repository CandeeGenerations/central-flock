import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterAll} from 'vitest'

import {AI_MODELS, isAiModelKey} from '../lib/ai-models.js'

// Live AI tests run against a throwaway copy of the production DB, so the services read real
// settings/hymns/quotes but anything they write is discarded. Runs before the test file imports
// any service (and therefore before db/index.ts opens a DB).

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    'ANTHROPIC_API_KEY is not set. Run with it exported, e.g.\n' +
      "  ANTHROPIC_API_KEY=$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:ANTHROPIC_API_KEY' " +
      '~/Library/LaunchAgents/cc.cgen.central-flock.plist) pnpm test:ai',
  )
}

const prodDbPath = path.resolve(import.meta.dirname, '..', '..', 'central-flock.db')
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'central-flock-ai-test-'))
const copyPath = path.join(tmpDir, 'central-flock.db')

// Online backup: consistent even while the launchd service has the DB open in WAL mode.
const source = new Database(prodDbPath, {readonly: true, fileMustExist: true})
await source.backup(copyPath)
source.close()

// AI_TEST_MODEL=sonnet|opus|haiku runs the settings-driven features on that model instead of the
// configured defaultAiModel.
const override = process.env.AI_TEST_MODEL
if (override) {
  if (!isAiModelKey(override)) {
    throw new Error(`AI_TEST_MODEL must be one of ${Object.keys(AI_MODELS).join(', ')}; got "${override}"`)
  }
  const copy = new Database(copyPath)
  copy
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('defaultAiModel', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(override)
  copy.close()
}

process.env.CENTRAL_FLOCK_DB_PATH = copyPath

afterAll(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true})
})
