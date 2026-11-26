import fs from 'node:fs'
import path from 'node:path'

// Railway PR environments copy production's plain (unsealed) variables, which include the Mac
// bridge key and the Claude key, and Railway's docs don't say whether the volume comes along too.
// So a Railway environment other than production must not depend on its variables to be safe:
// before anything reads the environment, it is switched to a sandbox with its own empty database
// and uploads folder under <volume>/preview, which the start-up seed fills with fake data.
//
// Imported for its side effect by sandbox.ts and uploads.ts (the first modules to read these
// variables) and by drizzle.config.ts, so the pre-deploy migrate and seed use the same paths.

export function previewEnvironmentName(env: NodeJS.ProcessEnv = process.env): string | null {
  const name = env.RAILWAY_ENVIRONMENT_NAME
  return name && name !== 'production' ? name : null
}

export function applyPreviewEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  const name = previewEnvironmentName(env)
  if (!name) return false
  const root = path.join(env.RAILWAY_VOLUME_MOUNT_PATH || path.join(process.cwd(), 'data'), 'preview')
  env.CENTRAL_FLOCK_SANDBOX = '1'
  env.CENTRAL_FLOCK_DB_PATH = path.join(root, 'central-flock.db')
  env.UPLOADS_DIR = path.join(root, 'uploads')
  // Nightly snapshots and production-copy imports belong to production only.
  delete env.SNAPSHOT_DIR
  env.INCOMING_DIR = path.join(root, 'incoming')
  env.SENTRY_ENVIRONMENT = name
  fs.mkdirSync(env.UPLOADS_DIR, {recursive: true})
  return true
}

applyPreviewEnvironment()
