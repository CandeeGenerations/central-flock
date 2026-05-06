import {Router} from 'express'

import {requireInternalSecret} from '../middleware/require-internal-secret.js'
import {quotesWebhookRouter} from './quotes-webhook.js'
import {rsvpWebhookRouter} from './rsvp-webhook.js'

export const webhooksRouter = Router()

// All /webhooks/* routes require the shared internal secret
webhooksRouter.use(requireInternalSecret)

// Tool sub-routers
webhooksRouter.use('/quotes', quotesWebhookRouter)
webhooksRouter.use('/rsvp', rsvpWebhookRouter)
