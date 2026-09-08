# Tasks: [FEATURE NAME]

**Input**: plan.md, spec.md (+ data-model.md, contracts/, research.md, quickstart.md where present)
**Feature Directory**: `[specs/###-short-name]`

Format: `- [ ] [TaskID] [P?] [Story?] Description with exact file path`
`[P]` = parallelizable (different file, no dependency on an incomplete task).
`[US#]` = the user story phase a task belongs to; omitted in Setup, Foundational,
and Polish phases.

## Phase 1: Setup

[project init tasks]

## Phase 2: Foundational

[blocking prerequisites shared by every user story]

## Phase 3+: User Story N (Priority PN)

**Goal**: [from spec.md]
**Independent Test**: [from spec.md]

[tasks]

## Final Phase: Polish & Cross-Cutting Concerns

[tasks]

## Dependencies

[story completion order, what blocks what]

## Parallel Execution Examples

[per-story groups of [P] tasks that can run together]

## Implementation Strategy

[MVP scope, incremental delivery order]
