<!--
SYNC IMPACT REPORT
==================
Version change: (placeholder template) → 1.0.0
Modified principles: (initial fill — all new)
Added sections:
  - Core Principles (5 principles)
  - Technology Stack & Architecture Decisions
  - Development Workflow
  - Governance
Removed sections: n/a (first fill)
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ reviewed — Constitution Check gates align
  - .specify/templates/spec-template.md ✅ reviewed — no updates required
  - .specify/templates/tasks-template.md ✅ reviewed — no updates required
  - .specify/templates/commands/ ✅ reviewed — no command files exist yet
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Verify exact original ratification date with project owner;
    defaulting to 2026-05-27 (first constitution fill date).
-->

# ComRev (CompaReview) Constitution

## Core Principles

### I. Offline-First

All user operations MUST be written to IndexedDB before any server sync attempt.
The application MUST remain fully usable on unreliable or absent network connections.
Sync logic MUST handle reconnection and conflict resolution gracefully — data loss
on disconnect is never acceptable. IndexedDB is the source of truth for in-flight
work; the server is the durable long-term store.

### II. Crash-First Recovery

Recovery and error-handling code MUST be written before or alongside feature code —
deferring error paths is a P0 violation. The app MUST degrade gracefully on any
server error without losing user data. Every user-facing operation MUST offer a
visible recovery path (retry, undo, or safe fallback state). "Happy path only"
implementations MUST NOT be merged.

### III. Library-First (Open-Source Preference)

Established, popular open-source libraries MUST be used for common functionality
(toasts, date formatting, drag-and-drop, etc.) rather than custom implementations.
Custom code is justified only when: (a) no suitable library exists, (b) the library
is abandoned or has critical unpatched vulnerabilities, or (c) domain-specific
performance constraints have been measured and documented. Rationale for custom
implementations MUST be recorded in the relevant plan.md.

### IV. Supabase as the Backend Platform

Supabase tooling, workflow, best practices, and philosophy MUST be followed for
all database, authentication, and realtime features. Supabase Postgres is the
canonical durable data store. Row-Level Security (RLS) policies MUST be defined
and reviewed for all user-facing tables before any data is written from production
code. Supabase client libraries and SSR integrations MUST be used as documented
by Supabase — no custom auth wrappers that bypass session handling.

### V. Layered Architecture (UI is Stateless)

Store, sync, and storage logic MUST live in the store/service layer — never
inside UI components. UI components MUST be stateless with respect to remote
data: they read from the local store and dispatch actions to service layer
functions. Direct API calls from React render functions or component event
handlers MUST NOT bypass the service layer. This boundary enables offline-first
operation and keeps UI components testable in isolation.

## Technology Stack & Architecture Decisions

The following ADR table is authoritative. Changes require a constitution amendment.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Web frontend | Next.js 14 (App Router) | TanStack Table v8 for complex column trees |
| 2 | Mobile frontend | Expo (React Native) | Cross-platform iOS / Android / PWA |
| 3 | Shared types | GraphQL Codegen | Single source of truth from Python schema |
| 4 | Backend | Python + FastAPI + Strawberry | Code-first GraphQL, async, type-annotated |
| 5 | Database | Supabase (hosted Postgres) | Auth + Realtime built-in; JSONB for flexible cells |
| 6 | GraphQL client | urql | Lighter than Apollo; good subscription support |
| 7 | CPU-heavy work | Rust via PyO3 | Ranking, scoring, bulk data processing |
| 8 | AI provider | Configurable (Claude / OpenAI / Gemini) | Users bring their own API key |
| 9 | Search tool | Tavily API (default) | Best-in-class for LLM-oriented web search |
| 10 | Styling (web) | Tailwind CSS + shadcn/ui | Fast, accessible, composable |
| 11 | Package manager | pnpm workspace | Monorepo tooling already in place |
| 12 | Monorepo layout | `web/` + `fe/` + `backend/` + `packages/` | Clear separation, shared packages |

Client-side persistence: IndexedDB (Principle I). All tables with user data require
RLS (Principle IV). Shared reusable UI components MUST be developed in the
`structable/` sub-package before being consumed by `web/` or `fe/`.

## Development Workflow

- **Grep / file search**: MUST exclude `node_modules` directories in all searches.
- **Feature branches**: Named `###-feature-name` per the Spec Kit convention.
- **Tasks**: Organized by user story to enable incremental, independently-testable
  delivery.
- **Commits**: Atomic per logical unit; message MUST reference the relevant user
  story or task ID.
- **AI-fill operations**: MUST go through the `ai_filler.py` service abstraction —
  direct LLM API calls from resolvers are prohibited.
- **Complexity budget**: Any design that adds a fourth project, a new cross-cutting
  layer, or a custom protocol MUST be justified in the plan's Complexity Tracking
  table before implementation.
- **Testing gates**: Contract tests for any new GraphQL endpoint or Supabase RPC
  MUST be written and confirmed failing before the implementation begins.

## Governance

This constitution supersedes all conflicting instructions in individual feature
plans, README files, or ad-hoc notes. When a conflict is found, the constitution
wins and the other document MUST be updated.

**Amendment procedure**:
1. Open a PR with changes to this file.
2. Bump `CONSTITUTION_VERSION` according to the versioning policy below.
3. Update all affected templates and runtime guidance files.
4. Record the change in the Sync Impact Report comment at the top of this file.
5. PR requires at least one explicit approval before merge.

**Versioning policy**:
- **MAJOR**: Backward-incompatible governance change — principle removal, redefinition,
  or ADR reversal.
- **MINOR**: New principle, new ADR row, or materially expanded guidance.
- **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements.

**Compliance review**: All PRs MUST include a constitution compliance check in the
plan's "Constitution Check" section. Any deliberate deviation MUST be documented
in the plan's Complexity Tracking table with justification.

**Version**: 1.0.0 | **Ratified**: 2026-05-27 | **Last Amended**: 2026-05-27
