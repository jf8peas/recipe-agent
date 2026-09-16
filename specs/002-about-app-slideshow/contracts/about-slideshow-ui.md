# UI Contract: `AboutSlideshow`

This feature has no API route (no new server endpoint, no request/response
schema) — its only "interface" is the component's own props and the
behavioral guarantees it makes to its caller (`AppHeader.tsx`) and to the
user. Documented here in place of `contracts/api.md` because there's nothing
HTTP to contract.

## Component props

```ts
interface AboutSlideshowProps {
  open: boolean;
  onClose: () => void;
}
```

- `open` — `AppHeader.tsx` owns this boolean; `AboutSlideshow` renders nothing
  (or is visually/interactively absent) when `false`.
- `onClose` — called exactly once per close (via "Return to App", or any
  keyboard-equivalent close action defined below). `AboutSlideshow` never
  calls it on mount, and never calls it more than once per user-initiated
  close.

No other props. Slide content is imported directly from
`lib/about-content.ts` — not passed in, since spec Assumptions fix it as
static, non-configurable copy (no caller ever needs to override it).

## Behavioral guarantees

| Guarantee | Spec ref |
|---|---|
| Opening (`open` becomes `true`) always shows Slide 1 first, regardless of which slide was shown the last time it was open. | FR-005 |
| Closing never mutates, re-fetches, or discards anything owned by the tree `AboutSlideshow` is layered over — the underlying view is a sibling, not a descendant that gets unmounted. | FR-004 |
| `Escape`... **not** a required close trigger — the spec only requires "Return to App" (and Story 2's keyboard-equivalent close action) as the closing mechanism. `Escape` MAY be wired as a convenience but its absence is not a defect. | FR-004, US2 AS4 |
| Right/Left arrow keys move exactly one slide, clamped to `[0, 4]` — never wrap from the last slide back to the first or vice versa. | FR-013, AS4–5 |
| Tab/Shift+Tab cycle only through elements inside the overlay (the slide's own focusable content — e.g. Slide 1's LinkedIn link — plus Next/Previous/Return) while `open` is `true`. Focus never lands on anything in the covered view underneath. | FR-014 |
| On the transition to `open`, focus moves to a focusable element inside the overlay (not left on the trigger button). | FR-014, US2 AS3 |
| On the transition to `!open`, focus returns to whatever element had focus immediately before `open` became `true` (in practice, the "About This App" trigger button, since that's what the user just activated). | FR-014, US2 AS4 |
| Every slide transition updates an `aria-live="polite"` region with the new slide's position and title, so a screen reader announces it without the user needing to navigate to find it. | FR-015, US2 AS5 |
| "Next" is `disabled` (not merely styled to look disabled) at `slideIndex === 4`; "Previous" is `disabled` at `slideIndex === 0`. | FR-003, AS4–5 |
| Zero critical/serious axe-core violations on every one of the 5 slides. | FR-016, SC-005 |

## DOM/ARIA structure (informative — implementation is free to adjust exact markup as long as the contract above holds)

```
<div role="dialog" aria-modal="true" aria-label="About This App">
  <div aria-live="polite" class="visually-hidden">Slide 2 of 5: High-Level Architecture & Tech Stack</div>
  <section aria-roledescription="slide" aria-label="Slide 2 of 5: ...">
    ...slide content...
  </section>
  <nav aria-label="Slideshow controls">
    <button disabled?>Previous</button>
    <button disabled?>Next</button>
    <button>Return to App</button>
  </nav>
</div>
```

## Test surface

Verified by `tests/e2e/about-slideshow.spec.ts` (Playwright), not a unit test
— see research.md R6 for why. The e2e spec is the authoritative check against
every row in the Behavioral guarantees table above.
