# Quickstart: About This App Slideshow

This feature needs no new environment variables, database migration, or
external service — it's a pure addition to the existing app. Follow feature
001's [quickstart.md](../001-recipe-agent/quickstart.md) for initial project
setup if you haven't already.

## Run it

```bash
npm run dev
```

Open http://localhost:3000.

## Primary flow (manual verification)

1. From any view (a fresh entry form, the session list, or an active
   session), find and select **"About This App"** in the header.
2. Confirm the slideshow opens as a full-page overlay on **Slide 1 — Author
   Profile** — a short bio and a LinkedIn link (opens in a new tab).
3. Select **Next** through all 5 slides, confirming each one's required
   content (tech stack, database/persistence, repository structure,
   execution flow) is present and that **Previous** becomes available.
4. On Slide 5 (the last), confirm **Next** is disabled.
5. Select **Return to App** — confirm the overlay closes and you're back
   exactly where you were (including an in-progress session's state, if you
   had one open).
6. Reopen "About This App" — confirm it starts over from Slide 1.

## Keyboard pass (Story 2)

1. Open the slideshow, then navigate using only the keyboard: Right/Left
   arrows move between slides (clamped at the first/last), Tab/Shift+Tab
   cycle only within the overlay's own controls and links.
2. Confirm focus visibly lands inside the overlay on open, and returns to the
   "About This App" button on close.
3. With a screen reader running (e.g. VoiceOver, NVDA), confirm each slide
   change is announced.

## Responsive pass (Story 3)

1. Resize the browser (or use devtools' device toolbar) down to 320px width
   — the floor spec.md's SC-004 commits to.
2. Page through all 5 slides — confirm no slide clips content or causes the
   whole page to scroll sideways; confirm Slide 4's directory tree and
   Slide 5's flow diagram scroll horizontally only within their own bounded
   region, and Slide 3 scrolls vertically within itself rather than clipping.
3. Confirm Next/Previous/Return remain visible and meet the ~44×44 CSS px
   minimum tappable target (FR-019).
4. Repeat a quick pass at 1920px width — SC-004's stated ceiling — confirming
   the same absence of clipping/horizontal overflow.

## Automated checks

```bash
npx playwright test tests/e2e/about-slideshow.spec.ts
```

Runs the full flow above plus an axe-core accessibility scan on every slide
(zero critical/serious violations required — spec SC-005).
