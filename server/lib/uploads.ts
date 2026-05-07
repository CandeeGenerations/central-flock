import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = path.join(__here, '..', '..', 'data')

export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? DEFAULT_DIR
export const UPLOADS_URL_PREFIX = '/uploads'

export const uploadPath = (...parts: string[]): string => path.join(UPLOADS_DIR, ...parts)
export const uploadUrl = (...parts: string[]): string => [UPLOADS_URL_PREFIX, ...parts].join('/')

export const urlToDiskPath = (url: string): string => {
  const stripped = url.startsWith(UPLOADS_URL_PREFIX + '/') ? url.slice(UPLOADS_URL_PREFIX.length + 1) : url
  return path.join(UPLOADS_DIR, stripped)
}
