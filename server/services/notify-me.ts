import {getSetting} from '../routes/settings.js'

export async function sendNotifyMeText(message: string): Promise<void> {
  const url = getSetting('webhookUrl')
  if (!url) {
    console.log('notify-me: webhookUrl not set, skipping')
    return
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message}),
    })
    if (!res.ok) {
      console.error(`notify-me: webhook returned ${res.status}: ${await res.text()}`)
    }
  } catch (err) {
    console.error('notify-me: webhook failed', err)
  }
}
