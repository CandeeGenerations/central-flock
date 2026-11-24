---
status: accepted
---

# Signed-in AI assistants connect to Central Flock directly; only public callers go through cgen-api

Central Flock gets one general MCP server at `flock.cgen.cc/mcp`, which AI assistants such as the
Grok devotion bot (a grok.com project) connect to **directly**, not through cgen-api. Each assistant
signs in through OAuth, using Central Flock's own login, and is limited to the areas approved on the
consent screen (for example "Devotions: read and add passages" or "Nursery: read schedule"). This
narrows the cloud plan's decision 8 to: **public, unauthenticated callers go through cgen-api; a
signed-in assistant may connect to Central Flock directly.** ADR 0014 still holds. It rejected
public, unauthenticated routes into Central Flock, and none are added here.

grok.com's custom connectors need a public MCP server and reliably support only OAuth sign-in in a
popup. Central Flock already has a login and session. cgen-api has neither, and runs on the Mac mini,
which the Railway move (ADR 0043) no longer requires for the app itself.

## Considered options

- **The MCP server in cgen-api**, keeping decision 8 as originally written. Rejected: cgen-api would
  need its own OAuth server and login page, duplicating Central Flock's auth, and every assistant
  would stop working whenever the Mac mini was off.
- **A static API key per bot**, like cgen-api's scoped keys (e.g. `NURSERY_API_KEY` for Roo). Kept
  for Roo's existing REST route, but not usable for grok.com, whose connector UI doesn't clearly
  support static headers.

## Consequences

- **Central Flock owns an OAuth server** (metadata, dynamic client registration, authorize, token,
  revoke, from `@modelcontextprotocol/sdk`), and a Settings list of connected assistants where any one
  can be switched off. The grants are per assistant and per area, never full access. No MCP tool sends
  texts or messages.
- **`/mcp` and the OAuth routes are internet-facing,** like `/webhooks/*` after ADR 0043, so they get
  rate limits and the same care with secrets.
- **Grants and tokens are environment-local.** The sandbox-only import into staging clears them, so
  a production token never works against a copy.
- **Roo's REST route through cgen-api stays.** Nursery tools on the MCP server match it, so Roo can
  move over when its platform supports MCP. Either way, cgen-api remains the front door for the
  public apps (RSVP, attendance, sermons, quotes).
- **A new assistant, or a new area for an existing one,** is added as tools on this server with its
  own scope, not as a new cgen-api route. A new public, unauthenticated caller still goes through
  cgen-api.
