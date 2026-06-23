# Store devotion-generation topic in `notes`, not a dedicated column

When adding optional topical steering to AI devotion-passage generation (e.g.
"freedom" for July 4th), we chose **not** to add a dedicated `topic` column.
Instead the typed topic is stored in labeled form (`Topic: <text>`) in a new
nullable `notes` column on `generated_passages`, and that note is appended into
`devotions.notes` when the passage is assigned to a dated devotion.

We picked this to keep the schema minimal and to let the topic ride along into the
devotion's existing notes field with no extra wiring. The trade-off: `notes` is
overloaded (topic text mixes with free-form production notes), so reversing to a
first-class `topic` concept later means a migration plus parsing the `Topic:`
prefix back out. The `Topic:` label exists precisely to keep that future parse —
and at-a-glance reading — unambiguous.
