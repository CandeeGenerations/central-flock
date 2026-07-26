# Devotion swap uses the box model (number+date are the slot)

Swapping two devotions exchanges their **content** while each keeps its **slot** — `number`
(unique, publicly cited) and `date`. Every column swaps except `id`/`number`/`date`/`createdAt`
(`updatedAt` is bumped), including production/publish flags, which describe the video and travel
with it.

The subtle part is the split identity of `number`. **Linked passages follow the content**: a swap
also exchanges `generatedPassages.devotionId` so each passage stays with the script it generated.
But **other devotions' chain references** (`referencedDevotions`/`chainIgnores`, stored as numbers)
are **left pointing at the number/box** — consistent with box-model, where `number` is the durable
public identity people cite. If either number is referenced elsewhere, the confirm modal warns so
the operator can review the verse-based chain audit; the swap itself never rewrites third-party rows.

Considered and rejected: (a) position model — swap only dates — doesn't match "all the data inside
switches"; (b) rewriting third-party chain refs so lineages follow content — correct chains but a
"swap these two" action would silently mutate N other rows. The asymmetry (passages follow content,
chain refs follow number) is deliberate: passages are 1:1 content artifacts, chain refs are
number/box citations.
