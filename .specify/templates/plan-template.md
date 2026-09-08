# Implementation Plan: [FEATURE NAME]

**Feature Directory**: `[specs/###-short-name]`
**Created**: [DATE]
**Status**: Draft
**Spec**: [link to spec.md]
**Input**: [one-line summary of the planning request]

## Summary

[2–4 sentences: what is being built and the shape of the approach.]

## Technical Context

**Language / Runtime**: [e.g. TypeScript, Node.js 20]
**Framework**: [e.g. Next.js App Router]
**Primary Dependencies**: [libraries the plan commits to]
**Storage**: [datastore]
**External Services**: [APIs]
**Testing**: [frameworks]
**Target Platform**: [deploy target]
**Performance Goals**: [from spec SCs]
**Constraints**: [hard limits]
**Scale/Scope**: [expected size]

Unresolved items are marked **NEEDS CLARIFICATION** and resolved in Phase 0.

## Constitution Check

*Gate: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| [I. …] | [PASS / DEVIATION] | [how the plan complies, or the justified deviation] |

**Result**: [PASS / PASS WITH DOCUMENTED DEVIATIONS / FAIL]

## Project Structure

```
[proposed directory tree]
```

## Phase 0: Research

See [research.md](research.md). All NEEDS CLARIFICATION resolved there as
Decision / Rationale / Alternatives.

## Phase 1: Design & Contracts

- [data-model.md](data-model.md) — entities, fields, transitions
- [contracts/](contracts/) — API contracts
- [quickstart.md](quickstart.md) — local setup and the primary flow

## Constitution Check (post-design)

[Re-evaluation after Phase 1. Same table shape. ERROR if a gate now fails without
justification.]

## Complexity Tracking

[Any deviation from the constitution or from simplest-thing, with justification
and the simpler alternative that was rejected. Empty if none.]

## Progress Tracking

- [ ] Technical Context filled
- [ ] Constitution Check (pre-design) passed
- [ ] Phase 0 research complete
- [ ] Phase 1 data-model complete
- [ ] Phase 1 contracts complete
- [ ] Phase 1 quickstart complete
- [ ] Constitution Check (post-design) passed
- [ ] Agent context file updated
