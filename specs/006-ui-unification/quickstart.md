# Quickstart: UI Unification

No new environment variable, dependency, or migration. Follow
[specs/001-recipe-agent/quickstart.md](../001-recipe-agent/quickstart.md) for
initial project setup if you haven't already.

## Run it

```bash
npm run dev
```

## Primary flow (manual verification, mapped to the screenshots)

1. Open the session list, the entry form, an active run, and the About page
   in turn — compare each against its matching file in `design/v003/
   screenshots/` (`session-list.png`, `entry-form.png`, `running-session.png`,
   `about-page.png`). Confirm the header looks and sits identically across
   all of them (US1), and that all four share the same content width and
   heading/button/list styling (US4).
2. Tab (keyboard) to the "Pause between stages" control — confirm it announces
   as a switch and toggles with Space/Enter (US1 AS3).
3. Start a session and step it forward — confirm the graph's two rows render
   at a comfortably readable size, and resize the window down to a small
   phone width and back up — confirm no node ever becomes hard to read and
   neither a horizontal nor vertical scrollbar appears on the graph itself
   (US2).
4. As each stage completes, confirm its tab appears; click a tab and confirm
   its corresponding graph node highlights, then click a different graph
   node and confirm the matching tab becomes active (US3 AS1/AS2).
5. With several tabs visible, confirm the action row (Step/Play/Edit, or the
   running indicator + Cancel, or Retry, or "Start a new session") stays
   visible without scrolling regardless of which tab is open (US3 AS3).
6. On an editable tab (ingredients, directions, selection, draft), confirm
   "Edit this stage" is present and starts the real edit-and-fork flow;
   confirm critique and the final recipe show no such control (US3 AS4).
7. Trigger the ingredient-error path — confirm the graph and the run finish
   exactly as before, with no extra tabs appearing.
8. Open the About page — confirm its scrollbar is slim, that scrolling it
   with the mouse never shows a focus outline, and that its own agent-graph
   illustration uses the new two-row visual language (US5).

## Dark mode

Toggle your OS/browser to dark mode and repeat step 1 — confirm every screen
this feature touches re-themes correctly with no unstyled-looking element.

## Token discipline check

```bash
grep -rnE "#[0-9a-fA-F]{3,6}|: ?[0-9]+px" components/ui components/AppHeader.tsx components/AgentGraphProgress.tsx components/about/AboutPage.tsx components/StatePanel.tsx components/ActionToolbar.tsx components/EntryForm.tsx components/SessionList.tsx
```

Expect zero hits outside of SVG geometry (the graph's own `viewBox`/coordinate
numbers, which are diagram geometry, not a "visual value" in the token
sense — same distinction feature 005 already drew for its node radii).

## Automated checks

```bash
npx vitest run
npx playwright test
```
