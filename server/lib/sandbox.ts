// A sandbox (CENTRAL_FLOCK_SANDBOX=1) is any copy of Central Flock that is not production: a PR
// test environment, staging, or the Railway rehearsal before cut-over. Nothing may leave it — no
// texts, images or contacts through the Mac, no Claude calls, no MCP connections, no webhooks.
// See ADR 0043 and docs/conventions (outbound calls).
//
// Each outbound client calls assertOutboundAllowed() itself, so a feature built on those clients
// is covered automatically. A new kind of outbound call must add its own check. The Mac bridge
// (lib/mac-bridge.ts) is the exception: it reports success for sends and returns empty reads, so
// send flows still work in a copy.

export type OutboundKind = 'mac-bridge' | 'anthropic' | 'mcp' | 'webhook'

export class SandboxBlockedError extends Error {
  readonly kind: OutboundKind
  constructor(kind: OutboundKind, what: string) {
    super(`Sandbox mode: ${what} is disabled in this copy of Central Flock`)
    this.name = 'SandboxBlockedError'
    this.kind = kind
  }
}

export function isSandbox(): boolean {
  return process.env.CENTRAL_FLOCK_SANDBOX === '1'
}

export function assertOutboundAllowed(kind: OutboundKind, what: string): void {
  if (isSandbox()) throw new SandboxBlockedError(kind, what)
}
