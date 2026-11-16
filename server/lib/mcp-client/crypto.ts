import {createCipheriv, createDecipheriv, randomBytes} from 'node:crypto'

// AES-256-GCM with the 32-byte base64 key in CONNECTIONS_KEY. Layout: iv(12) | tag(16) | ciphertext.
// A copied DB backup is useless without the key, which lives only in the launchd plist.

const IV_BYTES = 12
const TAG_BYTES = 16

export function hasConnectionsKey(): boolean {
  return Boolean(process.env.CONNECTIONS_KEY)
}

function key(): Buffer {
  const raw = process.env.CONNECTIONS_KEY
  if (!raw) throw new Error('CONNECTIONS_KEY environment variable is not set')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('CONNECTIONS_KEY must be 32 bytes, base64-encoded')
  return buf
}

export function encryptJson(value: unknown): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

export function decryptJson<T>(blob: Buffer): T {
  const iv = blob.subarray(0, IV_BYTES)
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(blob.subarray(IV_BYTES + TAG_BYTES)), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}
