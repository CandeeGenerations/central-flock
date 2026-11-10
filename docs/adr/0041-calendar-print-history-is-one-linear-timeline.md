# Calendar Print History is one linear timeline: undo the latest, or restore to a point

Calendar Print keeps a **History** of every **Change** (one explicit save is one Change, and a
whole **Year Copy** is one Change). There is a single History for all of Calendar Print,
covering every year plus the shared Normal Schedule lines, like one document's revision history.
It offers three operations: undo the latest Change, redo the last undo, and **Restore to here** on
any older Change, which rolls back everything after it. A Restore is itself a Change and can be
undone. There is deliberately no "revert just this one Change" in the middle of the timeline.

History exists mainly because the Year Copy is destructive: it deletes the target year's Events
and Day Overrides before writing the copy. The Year Copy was held back until History was built,
rather than giving it its own pre-copy snapshot, so that it is just another undoable Change.

## Why no single-Change revert

Reverting one Change from the middle is ambiguous when later Changes touched the same thing. If
Change 2 moved an Event and Change 3 edited its title, does reverting 2 keep the new title, refuse,
or ask? Undo-latest and Restore-to-here are never ambiguous. To fix an older mistake, you just make
a new Change.

## Why one timeline instead of one per year

Per-year Histories were considered. They would let you restore 2027 to before its Year Copy
without undoing a 2026 Repeat Rule fix made after it. They were rejected in favour of the
document model: one place to look, and one Undo button that does the obvious thing. The cost
is accepted: restoring to before a Year Copy also rolls back later edits to other years, and
those edits are re-done as new Changes.

## Consequences

- Every Calendar Print write path, including the one-time Repeat Rule backfill, must go through
  History. A write that skips it would be lost by the next undo or Restore, or wrongly kept by it.
- History is stored on the server and kept forever, so it's the same on Mac and iPad and needs no
  pruning. A year of Calendar Print is ~100 Events.
- History is Calendar Print–only for now. Other features may copy the pattern later; this ADR does
  not make it app-wide.
