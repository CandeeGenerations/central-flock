import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'

import {applyPreviewEnvironment, previewEnvironmentName} from './preview-env.js'
import {isSandbox} from './sandbox.js'

const productionLike = (): NodeJS.ProcessEnv => ({
  RAILWAY_ENVIRONMENT_NAME: 'production',
  RAILWAY_VOLUME_MOUNT_PATH: '/data',
  CENTRAL_FLOCK_DB_PATH: '/data/central-flock.db',
  UPLOADS_DIR: '/data/uploads',
  SNAPSHOT_DIR: '/data/backups',
  SENTRY_ENVIRONMENT: 'production',
})

describe('applyPreviewEnvironment', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, {recursive: true, force: true})
    delete process.env.RAILWAY_ENVIRONMENT_NAME
  })

  it('leaves production and local runs alone', () => {
    const env = productionLike()
    expect(applyPreviewEnvironment(env)).toBe(false)
    expect(env).toEqual(productionLike())
    expect(previewEnvironmentName({})).toBeNull()
  })

  it('turns a PR environment into a sandbox on its own database, uploads and Sentry environment', () => {
    const volume = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-env-'))
    dirs.push(volume)
    const env: NodeJS.ProcessEnv = {
      ...productionLike(),
      RAILWAY_ENVIRONMENT_NAME: 'central-flock-pr-32',
      RAILWAY_VOLUME_MOUNT_PATH: volume,
    }

    expect(applyPreviewEnvironment(env)).toBe(true)
    expect(env.CENTRAL_FLOCK_SANDBOX).toBe('1')
    expect(env.CENTRAL_FLOCK_DB_PATH).toBe(path.join(volume, 'preview', 'central-flock.db'))
    expect(env.UPLOADS_DIR).toBe(path.join(volume, 'preview', 'uploads'))
    expect(env.INCOMING_DIR).toBe(path.join(volume, 'preview', 'incoming'))
    expect(env.SNAPSHOT_DIR).toBeUndefined()
    expect(env.SENTRY_ENVIRONMENT).toBe('central-flock-pr-32')
    expect(fs.existsSync(env.UPLOADS_DIR!)).toBe(true)
  })

  it('makes isSandbox true in a PR environment even without CENTRAL_FLOCK_SANDBOX', () => {
    delete process.env.CENTRAL_FLOCK_SANDBOX
    process.env.RAILWAY_ENVIRONMENT_NAME = 'central-flock-pr-32'
    expect(isSandbox()).toBe(true)
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    expect(isSandbox()).toBe(false)
  })
})
