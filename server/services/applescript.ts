import {spawn} from 'child_process'

function spawnStdin(command: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (data) => (stdout += data))
    proc.stderr.on('data', (data) => (stderr += data))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`))
    })
    proc.stdin.write(input)
    proc.stdin.end()
  })
}

// Mutex to prevent concurrent sends from corrupting clipboard / UI state
let sendLock: Promise<void> = Promise.resolve()

function acquireSendLock(): Promise<() => void> {
  let release: () => void
  const prev = sendLock
  sendLock = new Promise((resolve) => (release = resolve))
  return prev.then(() => release!)
}

function setClipboard(text: string): Promise<string> {
  return spawnStdin('pbcopy', [], text)
}

function runAppleScript(script: string): Promise<string> {
  return spawnStdin('osascript', [], script)
}

function runJXA(script: string): Promise<string> {
  return spawnStdin('osascript', ['-l', 'JavaScript'], script)
}

// Replace curly/smart quotes with straight equivalents to avoid encoding issues with osascript
function straightenQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2014]/g, '--')
    .replace(/[\u2013]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
}

export async function sendMessage(phoneNumber: string, message: string): Promise<void> {
  const release = await acquireSendLock()
  try {
    const escapedMessage = straightenQuotes(message).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const escapedPhone = phoneNumber.replace(/"/g, '')

    const script = `
tell application "Messages"
  set targetService to 1st account whose service type = SMS
  set targetBuddy to participant "${escapedPhone}" of targetService
  send "${escapedMessage}" to targetBuddy
end tell`

    await runAppleScript(script)
  } catch (error) {
    throw new Error(
      `Failed to send message to ${phoneNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {cause: error},
    )
  } finally {
    release()
  }
}

export async function sendMessageViaUI(phoneNumber: string, message: string): Promise<void> {
  const release = await acquireSendLock()
  try {
    const escapedPhone = phoneNumber.replace(/"/g, '')

    const script = `
open location "imessage://${escapedPhone}"
delay 1.5

tell application "System Events"
  tell process "Messages"
    set frontmost to true
    delay 0.3
    keystroke "v" using command down
    delay 0.3
    key code 36
  end tell
end tell
delay 1.5`

    // Set clipboard via pbcopy stdin — avoids AppleScript string escaping issues
    await setClipboard(straightenQuotes(message))
    await runAppleScript(script)
  } catch (error) {
    throw new Error(
      `Failed to send message via UI to ${phoneNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {cause: error},
    )
  } finally {
    release()
  }
}

export interface MacContact {
  id: string
  firstName: string
  lastName: string
  phones: {label: string; value: string}[]
}

function parseVCard(vcard: string): {
  firstName: string
  lastName: string
  phones: {label: string; value: string}[]
  id: string
} {
  const lines = vcard.split(/\r?\n/)
  let firstName = ''
  let lastName = ''
  let id = ''
  const phones: {label: string; value: string}[] = []

  for (const line of lines) {
    if (line.startsWith('N:') || line.startsWith('N;')) {
      const value = line.slice(line.indexOf(':') + 1)
      const parts = value.split(';')
      lastName = parts[0] || ''
      firstName = parts[1] || ''
    } else if (line.startsWith('TEL')) {
      const colonIdx = line.indexOf(':')
      const value = line.slice(colonIdx + 1).trim()
      const params = line.slice(0, colonIdx)
      const typeMatch = params.match(/type=([^;,:]+)/i)
      const label = typeMatch ? typeMatch[1].replace(/^_\$!</, '').replace(/>!\$_$/, '') : ''
      phones.push({label, value})
    } else if (line.startsWith('X-ABUID:')) {
      id = line.slice(8).trim()
    }
  }

  return {firstName, lastName, phones, id}
}

export async function fetchContacts(): Promise<MacContact[]> {
  // Bulk-fetches vCards via JXA (single Apple Event for all 900+ contacts in ~4s).
  // Parses vCard text in Node.js to extract names, phones, and contact IDs.
  const script = `
const app = Application('Contacts');
const vcards = app.people.vcard();
vcards.join('\\n---SPLIT---\\n');`

  const raw = await runJXA(script)
  if (!raw.trim()) return []

  return raw
    .split('\n---SPLIT---\n')
    .map(parseVCard)
    .filter((c) => c.id)
}

export async function createContact(firstName: string, lastName: string, phoneNumber: string): Promise<void> {
  const escapedFirst = firstName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedLast = lastName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedPhone = phoneNumber.replace(/"/g, '')

  const script = `
tell application "Contacts"
  set newPerson to make new person with properties {first name:"${escapedFirst}", last name:"${escapedLast}"}
  make new phone at end of phones of newPerson with properties {label:"mobile", value:"${escapedPhone}"}
  save
end tell`

  try {
    await runAppleScript(script)
  } catch (error) {
    throw new Error(
      `Failed to create contact for ${firstName} ${lastName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {cause: error},
    )
  }
}
