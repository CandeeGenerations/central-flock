import {execFile, spawn} from 'child_process'
import {promisify} from 'util'

const execFileAsync = promisify(execFile)

function setClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('pbcopy')
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`pbcopy exited with code ${code}`))
    })
    proc.stdin.write(text)
    proc.stdin.end()
  })
}

export async function sendMessage(phoneNumber: string, message: string): Promise<void> {
  const escapedMessage = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const escapedPhone = phoneNumber.replace(/"/g, '')

  const script = `
tell application "Messages"
  set targetService to 1st account whose service type = SMS
  set targetBuddy to participant "${escapedPhone}" of targetService
  send "${escapedMessage}" to targetBuddy
end tell`

  try {
    await execFileAsync('osascript', ['-e', script])
  } catch (error) {
    throw new Error(
      `Failed to send message to ${phoneNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {cause: error},
    )
  }
}

export async function sendMessageViaUI(phoneNumber: string, message: string): Promise<void> {
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
delay 0.5`

  try {
    // Set clipboard via pbcopy stdin — avoids AppleScript string escaping issues
    await setClipboard(message)
    await execFileAsync('osascript', ['-e', script])
  } catch (error) {
    throw new Error(
      `Failed to send message via UI to ${phoneNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {cause: error},
    )
  }
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
    await execFileAsync('osascript', ['-e', script])
  } catch (error) {
    throw new Error(
      `Failed to create contact for ${firstName} ${lastName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      {cause: error},
    )
  }
}
