# Export delivery: anchor download, with a two-step Web Share path for iOS standalone

## Context

Every export in the app ends the same way: build a `data:` URL or a jsPDF document, then
`a.download = name; a.click()` (or `pdf.save(name)`, which does the same thing internally).
Seven call sites do this — `use-schedule-export.ts` (JPG, single-page PDF, multi-page PDF),
`fair-booth-exports.ts` (JPG, two-page PDF), `calendar-pdf.ts` (JPG), and the two CSV
exporters in `lib/api.ts`.

The app is reached over a Cloudflare tunnel and is routinely added to the iOS home screen.
Modern iOS launches a home-screen web app in standalone mode, and in standalone mode Safari
**silently drops** a `download`-attribute navigation to a `data:`/`blob:` URL. No download,
no error, no console message — the button simply does nothing. Every export in the app is
dead on the phone.

The obvious replacement is the Web Share API: `navigator.share({files: [file]})` opens the
iOS share sheet with Save to Files, Save Image, AirDrop and Messages. The complication is
that Safari requires `share()` to be called under **transient user activation**, and every
one of our exports `await`s a 200-500 ms `html-to-image` render before it has a file to
share. By the time the file exists, the activation from the original tap is gone and Safari
throws `NotAllowedError`.

## Decision

**One helper, `saveExportedFile(blob, filename)`, replaces the anchor at all seven sites.**
jsPDF callers switch from `pdf.save(name)` to `pdf.output('blob')`; image callers convert
their data URL to a `Blob` first.

**The helper branches on `standalone && canShare`.** It takes the share path only when
`window.matchMedia('(display-mode: standalone)').matches || navigator.standalone` **and**
`navigator.canShare({files: [probe]})` is true. Everything else — desktop macOS, iOS Safari
in a normal tab, Android Chrome — keeps the existing anchor download unchanged.

**On the share path, saving is two-step by design.** The render completes, then the helper
surfaces a persistent toast (`"<filename> ready — [Save]"`). The user's tap on _Save_ is a
fresh activation, and `navigator.share()` is called synchronously inside that handler with
the already-built `File`. The extra tap is not a UX compromise we accepted reluctantly; it
is the only reliable way to satisfy Safari's activation rule given an async render.

**A minimal web manifest is added** (`public/manifest.webmanifest`, `display: "standalone"`,
name, icons, theme color) and linked from `index.html`, so the `display-mode: standalone`
media query is a declared fact rather than an iOS default we're inferring. The legacy
`navigator.standalone` check is kept alongside it.

## Why

- **Hard to reverse.** Seven call sites change shape, jsPDF's `.save()` convenience is
  abandoned repo-wide, and a manifest is introduced that changes how an already-installed
  home-screen app launches.

- **Surprising without context.** A reader finds a standalone-mode branch and a two-step
  "Save" toast in what should be a one-line download, and has no way to know that Safari's
  transient-activation rule is what forced it. The natural instinct — "simplify this to
  just call `share()` after the render" — reintroduces the bug intermittently, which is
  the worst possible failure mode.

- **Real trade-off — alternatives rejected.**
  - **Call `share()` inline after the render, fall back on throw.** One tap when it works.
    Rejected because the fallback fires unpredictably depending on render duration, which
    varies with schedule size and device. "Sometimes nothing happens" is the exact symptom
    being fixed; trading a deterministic extra tap for a nondeterministic one is a bad deal.
  - **Feature-detect `canShare` alone, without the standalone guard.** Simplest predicate
    and future-proof. Rejected because macOS Safari and Android Chrome also report
    `canShare({files})`, so the primary Mac workflow — where the fair booth schedule is
    actually built and printed — would regress from a real download into a share sheet.
  - **Server round-trip.** POST the blob to a new endpoint, serve it back with
    `Content-Disposition: attachment`, navigate to it. Uniform on every platform with no
    share-sheet quirks. Rejected for the infrastructure it drags in: a new authenticated
    endpoint, temp storage under the uploads dir (ADR 0001), a cleanup job, and every
    export — including multi-megabyte multi-page PDFs — round-tripping through the tunnel
    twice for something the client already holds in memory.
  - **Manifest with `display: "browser"`.** Opting the home-screen icon out of standalone
    sends it to real Safari, where `download` already works — arguably the smallest true
    fix. Rejected because it trades away the full-screen app experience the user
    specifically wants, and wouldn't take effect for an already-installed icon until it's
    removed and re-added.
  - **Open the blob in a new tab and let the user long-press to save.** Near-zero code.
    Rejected as a manual extra step on every export with no affordance explaining it, and
    PDFs render poorly inside a standalone web view.

## Consequences

- **`display: "standalone"` in the manifest is now load-bearing for behaviour**, not just
  presentation. Changing it to `"browser"` or `"minimal-ui"` silently reroutes every export
  back to the anchor path — which is correct in that case, but the coupling is non-obvious.
- **`pdf.save()` must not be reintroduced.** It bypasses the helper and resurrects the bug
  for iOS only, where it won't be noticed on a Mac.
- **The share sheet has no "Downloads" destination.** On iOS the user picks Save to Files
  (choosing a location) or Save Image (Photos). This satisfies "ask me where to save it"
  but is not literally a downloads folder.
- **Web Share with files requires a secure context.** Fine over the Cloudflare tunnel;
  a plain-HTTP LAN address would fall back to the anchor path and keep failing silently.
- **CSV exports go through the same helper** even though the reported symptom was images
  and PDFs — they have the identical defect.
- **No test coverage.** The repo has no test framework, so the standalone branch is
  verified by hand on a real device; neither the detection nor the activation timing can
  be caught by CI.
