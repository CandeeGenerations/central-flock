# Canva edits are direct MCP calls from our own code, not an AI workflow

The weekly upcoming-events Story graphic is edited by Central Flock acting as an MCP client of
Canva's remote MCP server (`https://api.canva.com/connect/v1/mcp`). The server code calls the tools
itself: `read-design` with an open transaction, then `edit-design` with `replace_text` on the
design's fixed slot locators, then commit and export once Tyler approves. Claude is not in that loop.

The first handoff described it as an AI workflow: Claude, given the Canva server through
Anthropic's MCP connector, would make the edits and check the thumbnail. That was rejected.
The design has five fixed slots with known element IDs, and every week's edit is the same
mechanical text replacement. An agent loop would be:

- **Non-deterministic.** An agent can misplace an edit where code can't.
- **Slower and paid per run.** It needs about 20 tool round trips, with thumbnail images, on the
  Anthropic key.
- **Hard to test offline.** A stubbed MCP client can unit-test the direct calls.

The AI step that might have remained, splitting a title over two lines, was replaced with
a code-proposed split that Tyler can edit in the picker. Tyler is the layout check, because he sees
the Canva preview before anything is saved.

## Consequences

- The Canva client (OAuth, token refresh, MCP session, typed tool wrappers) is a general-purpose
  module, not owned by this feature, so later Canva features can reuse it. Design-specific
  knowledge (design ID, slot locators, divider fix) lives with the feature.
- This is not an AI feature, so the `createMessage` and `ai-smoke` rules in CLAUDE.md don't
  apply to it.
- If the template is redesigned, someone has to update the slot locators in code. An agent might
  have adapted on its own, and that flexibility was knowingly given up.
