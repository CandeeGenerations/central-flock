import {and, eq, sql} from 'drizzle-orm'

import {db, schema} from '../db/index.js'
import {getSetting} from '../routes/settings.js'
import {sendMessage, sendMessageViaUI} from './applescript.js'

let timeoutId: ReturnType<typeof setTimeout> | null = null

async function sendWebhook(
  webhookUrl: string,
  payload: {type: string; personName: string; message: string; daysUntil?: number},
) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}: ${await res.text()}`)
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function daysUntilBirthday(birthMonth: number, birthDay: number, todayMonth: number, todayDay: number): number {
  const thisYear = new Date().getFullYear()
  let birthday = new Date(thisYear, birthMonth - 1, birthDay)
  const today = new Date(thisYear, todayMonth - 1, todayDay)

  if (birthday < today) {
    birthday = new Date(thisYear + 1, birthMonth - 1, birthDay)
  }

  const diff = birthday.getTime() - today.getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

function wasSent(personId: number, type: string, year: number): boolean {
  const row = db
    .select()
    .from(schema.birthdayMessagesSent)
    .where(
      and(
        eq(schema.birthdayMessagesSent.personId, personId),
        eq(schema.birthdayMessagesSent.type, type as 'birthday' | 'pre_3' | 'pre_7' | 'pre_10'),
        eq(schema.birthdayMessagesSent.year, year),
      ),
    )
    .get()
  return !!row
}

function recordSent(personId: number, type: string, year: number) {
  db.insert(schema.birthdayMessagesSent)
    .values({
      personId,
      type: type as 'birthday' | 'pre_3' | 'pre_7' | 'pre_10',
      year,
    })
    .run()
}

function formatPersonName(person: {firstName: string | null; lastName: string | null}): string {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Someone'
}

function recordMessageInHistory(personId: number, content: string) {
  const message = db
    .insert(schema.messages)
    .values({
      content,
      renderedPreview: content,
      totalRecipients: 1,
      sentCount: 1,
      status: 'completed',
      completedAt: sql`(datetime('now'))`,
    })
    .returning()
    .get()

  db.insert(schema.messageRecipients)
    .values({
      messageId: message.id,
      personId,
      renderedContent: content,
      status: 'sent',
      sentAt: sql`(datetime('now'))`,
    })
    .run()
}

export async function checkBirthdays() {
  const webhookUrl = getSetting('webhookUrl')
  const sendTo = getSetting('birthdaySendTo') || 'self'
  const preNotifyDays = getSetting('birthdayPreNotifyDays')
  const preNotifySet = new Set(preNotifyDays ? preNotifyDays.split(',').map((d) => Number(d.trim())) : [])

  const sendMethod = getSetting('sendMethod')
  const send = sendMethod === 'ui' ? sendMessageViaUI : sendMessage

  const now = new Date()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()
  const currentYear = now.getFullYear()

  const allPeople = db.select().from(schema.people).all()
  const birthdayPeople = allPeople.filter((p) => p.birthMonth != null && p.birthDay != null)

  for (const person of birthdayPeople) {
    const bMonth = person.birthMonth!
    const bDay = person.birthDay!
    const days = daysUntilBirthday(bMonth, bDay, todayMonth, todayDay)
    const name = formatPersonName(person)

    // Check pre-notifications (always via webhook)
    for (const n of [3, 7, 10]) {
      if (!preNotifySet.has(n)) continue
      if (days !== n) continue

      const type = `pre_${n}` as const
      if (wasSent(person.id, type, currentYear)) continue

      if (!webhookUrl) {
        console.log(`Birthday scheduler: webhookUrl not set, skipping ${type} reminder for ${name}`)
        continue
      }

      const message = `Reminder - ${n} days till ${name}'s birthday!`

      try {
        await sendWebhook(webhookUrl, {type: 'pre_notification', personName: name, message, daysUntil: n})
        recordSent(person.id, type, currentYear)
        recordMessageInHistory(person.id, message)
        console.log(`Birthday scheduler: sent ${type} reminder for ${name} via webhook`)
      } catch (error) {
        console.error(`Birthday scheduler: failed to send ${type} for ${name}:`, error)
      }
    }

    // Check birthday itself (days === 0 means today)
    if (days === 0 || (bMonth === todayMonth && bDay === todayDay)) {
      if (wasSent(person.id, 'birthday', currentYear)) continue

      let ageStr = ''
      if (person.birthYear) {
        const age = currentYear - person.birthYear
        if (age > 0) ageStr = ` ${ordinal(age)}`
      }

      if (sendTo === 'person' && person.phoneNumber) {
        // Send directly to the person via AppleScript
        const message = `Happy${ageStr} birthday to you!`
        try {
          await send(person.phoneNumber, message)
          recordSent(person.id, 'birthday', currentYear)
          recordMessageInHistory(person.id, message)
          console.log(`Birthday scheduler: sent birthday message to ${name}`)
        } catch (error) {
          console.error(`Birthday scheduler: failed to send birthday message to ${name}:`, error)
        }
      } else {
        // Send to self via webhook
        if (!webhookUrl) {
          console.log(`Birthday scheduler: webhookUrl not set, skipping self-send for ${name}`)
          continue
        }
        const message = `Happy${ageStr} birthday to ${name}`
        try {
          await sendWebhook(webhookUrl, {type: 'birthday', personName: name, message})
          recordSent(person.id, 'birthday', currentYear)
          recordMessageInHistory(person.id, message)
          console.log(`Birthday scheduler: sent birthday message for ${name} via webhook`)
        } catch (error) {
          console.error(`Birthday scheduler: failed to send birthday webhook for ${name}:`, error)
        }
      }
    }
  }
}

export async function checkAnniversaries() {
  const webhookUrl = getSetting('webhookUrl')
  const sendTo = getSetting('anniversarySendTo') || 'self'
  const preNotifyDays = getSetting('anniversaryPreNotifyDays')
  const preNotifySet = new Set(preNotifyDays ? preNotifyDays.split(',').map((d) => Number(d.trim())) : [])

  const sendMethod = getSetting('sendMethod')
  const send = sendMethod === 'ui' ? sendMessageViaUI : sendMessage

  const now = new Date()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()
  const currentYear = now.getFullYear()

  const allPeople = db.select().from(schema.people).all()
  const anniversaryPeople = allPeople.filter((p) => p.anniversaryMonth != null && p.anniversaryDay != null)

  for (const person of anniversaryPeople) {
    const aMonth = person.anniversaryMonth!
    const aDay = person.anniversaryDay!
    const days = daysUntilBirthday(aMonth, aDay, todayMonth, todayDay)
    const name = formatPersonName(person)

    // Check pre-notifications (always via webhook)
    for (const n of [3, 7, 10]) {
      if (!preNotifySet.has(n)) continue
      if (days !== n) continue

      const type = `anniversary_pre_${n}`
      if (wasSent(person.id, type, currentYear)) continue

      if (!webhookUrl) {
        console.log(`Anniversary scheduler: webhookUrl not set, skipping ${type} reminder for ${name}`)
        continue
      }

      const message = `Reminder - ${n} days till ${name}'s anniversary!`

      try {
        await sendWebhook(webhookUrl, {type: 'pre_notification', personName: name, message, daysUntil: n})
        recordSent(person.id, type, currentYear)
        recordMessageInHistory(person.id, message)
        console.log(`Anniversary scheduler: sent ${type} reminder for ${name} via webhook`)
      } catch (error) {
        console.error(`Anniversary scheduler: failed to send ${type} for ${name}:`, error)
      }
    }

    // Check anniversary itself
    if (days === 0 || (aMonth === todayMonth && aDay === todayDay)) {
      if (wasSent(person.id, 'anniversary', currentYear)) continue

      let yearStr = ''
      if (person.anniversaryYear) {
        const years = currentYear - person.anniversaryYear
        if (years > 0) yearStr = ` ${ordinal(years)}`
      }

      if (sendTo === 'person' && person.phoneNumber) {
        // Send directly to the person via AppleScript
        const message = `Happy${yearStr} anniversary!`
        try {
          await send(person.phoneNumber, message)
          recordSent(person.id, 'anniversary', currentYear)
          recordMessageInHistory(person.id, message)
          console.log(`Anniversary scheduler: sent anniversary message to ${name}`)
        } catch (error) {
          console.error(`Anniversary scheduler: failed to send anniversary message to ${name}:`, error)
        }
      } else {
        // Send to self via webhook
        if (!webhookUrl) {
          console.log(`Anniversary scheduler: webhookUrl not set, skipping self-send for ${name}`)
          continue
        }
        const message = `Happy${yearStr} anniversary to ${name}`
        try {
          await sendWebhook(webhookUrl, {type: 'anniversary', personName: name, message})
          recordSent(person.id, 'anniversary', currentYear)
          recordMessageInHistory(person.id, message)
          console.log(`Anniversary scheduler: sent anniversary message for ${name} via webhook`)
        } catch (error) {
          console.error(`Anniversary scheduler: failed to send anniversary webhook for ${name}:`, error)
        }
      }
    }
  }
}

function scheduleNext() {
  const sendTime = getSetting('birthdaySendTime') || '07:00'
  const [hours, minutes] = sendTime.split(':').map(Number)

  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)

  // If the time has already passed today, schedule for tomorrow
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1)
  }

  const delay = next.getTime() - now.getTime()

  if (timeoutId) clearTimeout(timeoutId)

  timeoutId = setTimeout(async () => {
    try {
      await checkBirthdays()
    } catch (error) {
      console.error('Birthday scheduler: error during check:', error)
    }
    try {
      await checkAnniversaries()
    } catch (error) {
      console.error('Anniversary scheduler: error during check:', error)
    }
    scheduleNext()
  }, delay)

  console.log(`Birthday scheduler: next check at ${next.toLocaleString()} (in ${Math.round(delay / 60000)}m)`)
}

export function startBirthdayScheduler() {
  scheduleNext()
}

export function stopBirthdayScheduler() {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
    console.log('Birthday scheduler stopped')
  }
}
