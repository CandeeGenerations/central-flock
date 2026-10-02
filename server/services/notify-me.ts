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
