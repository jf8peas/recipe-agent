# Quickstart: About Page Redesign

No new environment variable, dependency, or migration. Follow
[specs/001-recipe-agent/quickstart.md](../001-recipe-agent/quickstart.md) for
initial project setup if you haven't already.

## Run it

```bash
npm run dev
```

## Primary flow (manual verification)

1. From any view, click "About This App" in the header — confirm the page
   opens as a full-page overlay, scrolled to the very top.
2. Scroll from top to bottom — confirm every required topic (FR-007–FR-020)
   appears, in order, with no "next"/"previous" control anywhere.
3. Scroll back up partway, then use the sticky topic navigation to jump to
   a section further down (e.g. "Agent graph") — confirm the page jumps
   straight there without needing to scroll past the sections in between,
   and that the topic nav itself was still visible before you clicked it.
4. Select "Return to App" — confirm the overlay closes and the underlying
   view (including an in-progress session, if you had one open) is
   unchanged.
5. Reopen the page — confirm it starts at the top again, not where you left
   off.

## Keyboard + screen reader pass

1. Open the page, then navigate using only the keyboard: Tab through the
   topic nav's links and the "Return to App" control.
2. Activate a topic-nav link with the keyboard — confirm focus visibly
   lands on that section, and (with a screen reader running) confirm the
   jump is announced.
3. Confirm closing the page returns focus to the "About This App" button.

## Diagram + responsive pass

1. Resize down to ~320px width. Scroll through all three diagrams
   (time-travel/branching, agent graph, state/persistence) — confirm each
   stays legible.
2. On the agent graph specifically, confirm it renders at a readable
   minimum size and scrolls horizontally *within its own region* — the
   page itself must not scroll sideways.
3. Repeat at a wide desktop width — confirm nothing looks stretched or
   broken.
4. Toggle your OS/browser between light and dark mode — confirm the whole
   page re-themes correctly with no unstyled or hardcoded-looking element.

## Automated checks

```bash
npx vitest run
npx playwright test tests/e2e/about-page.spec.ts
```
