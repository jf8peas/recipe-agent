# UI Contract: `AboutPage`

No API route changes in this feature — same reasoning as spec 002's own UI
contract. This documents `AboutPage`'s prop contract and behavioral
guarantees in place of an API contract.

## Component props

```ts
interface AboutPageProps {
  open: boolean;
  onClose: () => void;
}
```

Identical shape to spec 002's `AboutSlideshow` (research R7) — `AppHeader.tsx`
only needs its import path and the component name changed, not its own
state or JSX props.

## Behavioral guarantees

| Guarantee | Spec ref |
|---|---|
| Opening always renders every section, from the top, in the same fixed order — there is no remembered scroll position across visits. | FR-006 |
| No "next"/"previous" control exists anywhere on the page. | FR-004 |
| Exactly one control closes the page and returns focus to the element that opened it; the underlying app view is untouched (still mounted, not unmounted/reset). | FR-005 |
| The topic navigation stays reachable regardless of scroll position (`position: sticky`). | FR-010 |
| Activating a topic-nav link moves the browser's scroll position *and* keyboard focus to that section's heading, and updates the page's `aria-live="polite"` region with that section's name. | FR-010, FR-025, US2 AS2 |
| Every diagram is one `<svg viewBox>` containing all of its own shapes, connectors, and text — no separately positioned HTML label can drift from the shape it describes. | FR-021 |
| The agent-graph diagram (the widest) renders at a legible minimum size and scrolls horizontally within its own bounded, independently-keyboard-reachable region at narrow viewports, rather than shrinking indefinitely; the outer page never scrolls horizontally. | FR-021a |
| Every color, spacing, radius, and font value resolves through `app/tokens.css` — none hardcoded locally. | FR-022 |
| The page matches the app's light/dark mode automatically, via the same `prefers-color-scheme` cascade every other screen uses. | FR-023 |
| Zero critical/serious axe-core violations, on at least the top of the page and the densest section (the agent graph). | FR-024 |
| Every interactive element (topic-nav links, the close control) is keyboard-reachable with visible focus. | FR-025 |
| No whole-page horizontal scroll at any viewport width from 320px through 1920px. | FR-026 |

## DOM/ARIA structure (informative — exact markup may vary as long as the contract above holds)

```
<div role="dialog" aria-modal="true" aria-label="About This App">
  <div aria-live="polite" class="visually-hidden">Jumped to: Agent graph</div>
  <header> <!-- sticky -->
    <strong>Recipe Agent — how it works</strong>
    <nav aria-label="Page sections">
      <a href="#pitch">Overview</a> <a href="#journey">Using it</a>
      <a href="#architecture">Architecture</a> ... <a href="#principles">Principles</a>
      <!-- the exact 10-entry list design/v002/about.html's own <nav> exposes;
           the cover, author, time-travel, under-the-hood, and closing
           sections are scroll-through only -- see spec.md Assumptions -->
    </nav>
    <button>Return to App</button>
  </header>
  <main> <!-- the single scrollable region -->
    <section id="cover" tabIndex={-1}>...</section>
    <section id="author" tabIndex={-1}>...</section>
    ... every section, in order ...
    <section id="closing" tabIndex={-1}>...</section>
  </main>
</div>
```

## Test surface

`tests/e2e/about-page.spec.ts` (research R9) — no dedicated unit test file,
matching spec 002's own convention for this kind of presentational-only
component.
