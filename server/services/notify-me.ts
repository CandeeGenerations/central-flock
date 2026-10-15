import {getSetting} from '../routes/settings.js'

/** Resolves true only when the webhook accepted the message; never throws. */
export async function sendNotifyMeText(message: string): Promise<boolean> {
  const url = getSetting('webhookUrl')
  if (!url) {
    console.log('notify-me: webhookUrl not set, skipping')
    return false
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message}),
    })
    if (!res.ok) {
      console.error(`notify-me: webhook returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return false
    }
    return true
  } catch (err) {
    console.error('notify-me: webhook failed', err)
    return false
  }
}

const RETRY_DELAYS_MS = [60_000, 3 * 60_000, 6 * 60_000]

/**
 * For texts that must not be lost (the sermon pipeline's Outcome Text): retry the send-me-a-text
 * webhook for ~10 minutes, then post to the Mattermost `mattermostFallbackUrl` setting, which does
 * not depend on n8n or Vonage. Run it in the background — it can take minutes. Never throws.
 */
export async function sendNotifyMeTextWithFallback(message: string): Promise<boolean> {
  if (await sendNotifyMeText(message)) return true
  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((r) => setTimeout(r, delay))
    if (await sendNotifyMeText(message)) return true
  }

  const fallbackUrl = getSetting('mattermostFallbackUrl')
  if (!fallbackUrl) {
    console.error('notify-me: text webhook failed and mattermostFallbackUrl is not set; message lost:', message)
    return false
  }
  try {
    const res = await fetch(fallbackUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text: `${message}\n\n_(Central Flock: text webhook unreachable — sent here instead)_`}),
    })
    if (!res.ok) throw new Error(`Mattermost returned ${res.status}`)
    return true
  } catch (err) {
    console.error('notify-me: Mattermost fallback failed; message lost:', message, err)
    return false
  }
}
