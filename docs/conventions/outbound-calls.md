# Outbound calls and sandbox mode

Every copy of Central Flock that isn't production is a **sandbox**: PR environments, the future
`staging`, and a local run with `CENTRAL_FLOCK_SANDBOX=1`. Nothing may leave a sandbox: no texts or
images, no Contacts or Calendar reads from the Mac, no Claude calls, no MCP connections, no
webhooks. See [ADR 0043](../adr/0043-railway-hosting-with-mac-work-behind-cgen-api.md).

The check lives **once, in each outbound client**, not in each feature. A feature built on those
clients is covered without doing anything.

## Use

| To reach                                        | Use                                                                                   | In a sandbox                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| The Mac: texts, images, Contacts, Calendar      | `server/lib/mac-bridge.ts`                                                            | Sends report success; reads return `[]` |
| Claude                                          | `createMessage` in `server/lib/anthropic-client.ts`                                   | Throws `SandboxBlockedError`            |
| Canva, Metricool (MCP)                          | `server/lib/mcp-client/client.ts`, `oauth.ts`                                         | Throws `SandboxBlockedError`            |
| The send-me-a-text webhook, Mattermost fallback | `sendNotifyMeText` / `sendNotifyMeTextWithFallback` in `server/services/notify-me.ts` | Logs and returns `false`                |

`SandboxBlockedError` answers with a 409 that stays out of Sentry (the handler in `server/index.ts`).

Example — the Claude client checks before every call, so no AI feature has to:

```ts
// server/lib/anthropic-client.ts
export async function createMessage(label: string, params: Anthropic.MessageCreateParamsNonStreaming) {
  assertOutboundAllowed('anthropic', `AI (${label})`)
  const message = await getAnthropic().messages.create(params)
  ...
}
```

## A new kind of outbound call

1. Put it in one client module, and call `assertOutboundAllowed(kind, what)` from
   `server/lib/sandbox.ts` at the top of it (add a new `OutboundKind` if none fits). Use
   `isSandbox()` instead only when the flow should carry on with a fake success, as the Mac bridge
   does.
2. Add a unit test that the client refuses in sandbox mode.
3. Add the file to the `no-restricted-globals` allow-list in `.oxlintrc.json`, with the reason.
4. Add a row to the table above.

Public, read-only fetches (YouTube oEmbed in `services/youtube-extract.ts`, the Canva preview and
export downloads in `services/events-story/run.ts`) are allowed in a sandbox, since they only read.
Revisit if one ever writes.

## Don't

- **Call `fetch` directly in `server/`.** Lint fails outside the approved files:
  `mac-bridge.ts`, `notify-me.ts`, `routes/settings.ts` (the webhook test button, which checks
  `isSandbox()` itself), `youtube-extract.ts`, `events-story/run.ts`, and tests.
- Import `services/applescript.ts` or `services/calendar.ts` from a feature. They only work on the
  Mac; go through `mac-bridge.ts`.
- Check `isSandbox()` in a feature to skip an outbound call. Put the check in the client so the
  next feature gets it for free.
- Seed a saved connection, webhook URL or Mattermost URL (see [seed-data.md](./seed-data.md)).
