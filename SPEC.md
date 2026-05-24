# CompaReview (ComRev) — Product Spec

> Spec-driven AI development. Each section is a unit of implementation.

---

## 0. Vision

CompaReview is an open-source comparison engine for software projects and products. Users can build structured comparison tables with hierarchical columns, let AI fill cells via web search, collaborate via real-time comments, and share results publicly.

---

## 1. Architecture Decision Records (ADRs)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Frontend (web) | Next.js 14 (App Router) | TanStack Table v8 = best-in-class for complex column trees |
| 2 | Frontend (mobile) | Expo (React Native) | Cross-platform iOS/Android/PWA |
| 3 | Shared types | GraphQL Codegen | Single source of truth from Python schema |
| 4 | Backend | Python + FastAPI + Strawberry | Code-first GraphQL, async, type-annotated |
| 5 | Database | Supabase (hosted Postgres) | Auth + Realtime built-in; JSONB for flexible cell values |
| 6 | GraphQL client | urql | Lighter than Apollo; good subscription support |
| 7 | CPU-heavy work | Rust via PyO3 | Ranking, scoring, bulk data processing |
| 8 | AI provider | Configurable (Claude / OpenAI / Gemini) | Users bring their own API key |
| 9 | Search tool | Tavily API (default) | Best-in-class for LLM-oriented web search |
| 10 | Styling (web) | Tailwind CSS + shadcn/ui | Fast, accessible, composable |
| 11 | Package manager | pnpm workspace | Already in project |
| 12 | Monorepo layout | `web/` + `fe/` + `backend/` + `packages/` | Clear separation, shared `packages/graphql` |

---

## 2. Monorepo Layout

```
ComRev/
├── backend/                  # Python + Strawberry GraphQL
│   ├── app/
│   │   ├── main.py           # FastAPI app, mounts GraphQL
│   │   ├── schema.py         # Strawberry root schema
│   │   ├── types/            # Strawberry types (comparison, column, cell, …)
│   │   ├── resolvers/        # Query / Mutation / Subscription resolvers
│   │   ├── services/
│   │   │   ├── ai_filler.py  # Abstracted LLM + search
│   │   │   └── github.py     # Stars delta integration
│   │   └── db.py             # Supabase client wrapper
│   ├── rust_ext/             # PyO3 Rust extension (ranking, scoring)
│   └── pyproject.toml
│
├── web/                      # Next.js 14 (App Router)
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx      # List of comparison sets
│   │   │   └── compare/
│   │   │       └── [slug]/
│   │   │           └── page.tsx  # Main comparison table
│   │   └── api/              # Next.js API routes (auth callbacks, etc.)
│   ├── components/
│   │   ├── tree-table/
│   │   │   ├── TreeTable.tsx
│   │   │   ├── TreeTableHeader.tsx     # Hierarchical column headers
│   │   │   ├── TreeTableCell.tsx       # Cell with inline edit + comment
│   │   │   ├── CellCommentPanel.tsx
│   │   │   ├── ColumnVisibilityPanel.tsx
│   │   │   └── AddColumnDialog.tsx
│   │   └── ui/               # shadcn/ui components
│   └── package.json
│
├── fe/                       # Expo (iOS / Android / PWA)
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx     # List of comparison sets
│   │   │   └── compare.tsx
│   │   └── compare/
│   │       └── [id].tsx      # Comparison table (scrollable)
│   ├── components/
│   │   └── compare-table/    # Custom ScrollView-based table for mobile
│   └── package.json
│
├── packages/
│   ├── graphql/              # Generated types (graphql-codegen)
│   │   └── types.ts
│   └── shared/               # Pure TS utils shared across web + fe
│
├── star_diff_rs/             # Existing Rust binary (GitHub stars delta)
├── tools/dman/               # Existing tool
├── CLAUDE.md
├── SPEC.md                   # This file
└── pnpm-workspace.yaml
```

---

## 3. Database Schema (Supabase / Postgres)

### 3.1 Tables

```sql
-- Comparison sets (the top-level container)
CREATE TABLE comparison_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  is_public   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Rows = products / projects being compared
CREATE TABLE rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      uuid NOT NULL REFERENCES comparison_sets ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  url         text,
  github_url  text,
  position    integer NOT NULL DEFAULT 0,
  metadata    jsonb NOT NULL DEFAULT '{}',  -- stars, language, license, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Columns (self-referential for hierarchy)
CREATE TABLE columns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       uuid NOT NULL REFERENCES comparison_sets ON DELETE CASCADE,
  parent_id    uuid REFERENCES columns ON DELETE CASCADE,  -- NULL = root column
  name         text NOT NULL,
  display_name text,
  col_type     text NOT NULL CHECK (col_type IN ('boolean','text','number','url','mixed')),
  position     integer NOT NULL DEFAULT 0,
  description  text,
  is_archived  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Cells (sparse: only created when a value exists)
CREATE TABLE cells (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id         uuid NOT NULL REFERENCES rows ON DELETE CASCADE,
  column_id      uuid NOT NULL REFERENCES columns ON DELETE CASCADE,
  value          jsonb,          -- null | boolean | number | string
  filled_by_ai   boolean NOT NULL DEFAULT false,
  source_url     text,
  source_excerpt text,
  confidence     float CHECK (confidence BETWEEN 0 AND 1),
  updated_by     uuid REFERENCES auth.users,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, column_id)
);

-- Per-user column visibility (row = hidden)
CREATE TABLE column_visibility (
  user_id   uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES columns ON DELETE CASCADE,
  PRIMARY KEY (user_id, column_id)
);

-- Cell comments (real-time via Supabase Realtime)
CREATE TABLE cell_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id    uuid NOT NULL REFERENCES cells ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users,
  content    text NOT NULL,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AI fill jobs
CREATE TABLE ai_fill_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          uuid NOT NULL REFERENCES comparison_sets,
  cell_ids        uuid[] NOT NULL,
  llm_provider    text NOT NULL CHECK (llm_provider IN ('claude','openai','gemini')),
  llm_model       text,
  search_provider text NOT NULL DEFAULT 'tavily' CHECK (search_provider IN ('tavily','brave','none')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  results         jsonb,
  error           text,
  created_by      uuid REFERENCES auth.users,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
```

### 3.2 Indexes

```sql
CREATE INDEX ON rows (set_id, position);
CREATE INDEX ON columns (set_id, parent_id, position);
CREATE INDEX ON cells (column_id);
CREATE INDEX ON cells (row_id);
CREATE INDEX ON cell_comments (cell_id, created_at);
CREATE INDEX ON column_visibility (user_id);
```

### 3.3 Row-Level Security (RLS)

```sql
-- comparison_sets: public read; write = owner
ALTER TABLE comparison_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON comparison_sets FOR SELECT USING (is_public = true OR auth.uid() = created_by);
CREATE POLICY "owner_write" ON comparison_sets FOR ALL USING (auth.uid() = created_by);

-- column_visibility: users manage their own
ALTER TABLE column_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_visibility" ON column_visibility FOR ALL USING (auth.uid() = user_id);

-- cell_comments: public read (on public sets), authenticated write
ALTER TABLE cell_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_comments" ON cell_comments FOR SELECT USING (true);
CREATE POLICY "auth_insert" ON cell_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_update" ON cell_comments FOR UPDATE USING (auth.uid() = user_id);
```

---

## 4. GraphQL Schema (Strawberry — Python)

```python
# Abbreviated for clarity. Full schema in backend/app/schema.py

@strawberry.type
class Column:
    id: strawberry.ID
    set_id: strawberry.ID
    parent_id: Optional[strawberry.ID]
    name: str
    display_name: Optional[str]
    col_type: str
    position: int
    description: Optional[str]
    is_archived: bool
    children: List["Column"]  # recursive, resolved in resolver

@strawberry.type
class Cell:
    id: strawberry.ID
    row_id: strawberry.ID
    column_id: strawberry.ID
    value: Optional[JSON]   # bool | str | float | null
    filled_by_ai: bool
    source_url: Optional[str]
    source_excerpt: Optional[str]
    confidence: Optional[float]
    updated_at: datetime

@strawberry.type
class Row:
    id: strawberry.ID
    set_id: strawberry.ID
    name: str
    description: Optional[str]
    url: Optional[str]
    github_url: Optional[str]
    position: int
    metadata: JSON
    cells: List[Cell]  # all cells for this row

@strawberry.type
class ComparisonSet:
    id: strawberry.ID
    slug: str
    name: str
    description: Optional[str]
    is_public: bool
    columns: List[Column]   # roots only; children nested inside
    rows: List[Row]

@strawberry.type
class CellComment:
    id: strawberry.ID
    cell_id: strawberry.ID
    user_id: strawberry.ID
    content: str
    created_at: datetime

@strawberry.type
class AIFillJob:
    id: strawberry.ID
    status: str
    cell_ids: List[strawberry.ID]
    created_at: datetime
    completed_at: Optional[datetime]

# --- Queries ---
@strawberry.type
class Query:
    comparison_set: Optional[ComparisonSet]          # by id or slug
    comparison_sets: List[ComparisonSet]
    hidden_column_ids: List[strawberry.ID]           # for current user + set

# --- Mutations ---
@strawberry.type
class Mutation:
    create_comparison_set: ComparisonSet
    update_comparison_set: ComparisonSet
    delete_comparison_set: bool

    add_row: Row
    update_row: Row
    reorder_rows: List[Row]
    delete_row: bool

    add_column: Column              # parentId=None for root
    update_column: Column
    reorder_columns: List[Column]
    delete_column: bool

    upsert_cell: Cell
    delete_cell: bool

    hide_column: bool               # per current user
    show_column: bool

    add_cell_comment: CellComment
    update_cell_comment: CellComment
    delete_cell_comment: bool

    trigger_ai_fill: AIFillJob
    cancel_ai_fill: bool

# --- Subscriptions ---
@strawberry.type
class Subscription:
    cell_comment_added: CellComment    # subscribe by cell_id
    cell_updated: Cell                  # subscribe by set_id
    ai_job_progress: AIFillJob          # subscribe by job_id
```

---

## 5. Feature Specs

Each spec block = one implementation unit (can be a PR).

---

### FEAT-01 — Comparison Set CRUD

**Acceptance criteria:**
- [ ] User can create a new comparison set with name, slug, description
- [ ] Slug is auto-generated from name if not provided (URL-safe, unique)
- [ ] User can update name/description/visibility
- [ ] User can delete a set (cascades to rows, columns, cells)
- [ ] Public sets are readable without auth; private sets = owner only

---

### FEAT-02 — Row Management

**Acceptance criteria:**
- [ ] User can add a row with name, optional URL + GitHub URL
- [ ] Rows are ordered by `position`; user can drag-reorder (web) or use up/down (mobile)
- [ ] Deleting a row cascades to all its cells
- [ ] `metadata` JSONB holds GitHub stars, language, license (populated by FEAT-10)

---

### FEAT-03 — Hierarchical Column Management

**Acceptance criteria:**
- [ ] Root columns have `parent_id = NULL`
- [ ] Sub-columns and sub-sub-columns supported (no hard depth limit, UI shows ≤3 levels)
- [ ] Column types: `boolean`, `text`, `number`, `url`, `mixed`
- [ ] User can add a column at any level without page reload
- [ ] User can rename, reorder, archive (soft-delete) columns
- [ ] Archived columns are excluded from the table but recoverable
- [ ] Column header shows hierarchy visually (grouped, indented, or spanning)

---

### FEAT-04 — Tree Table (Web)

**Technology:** TanStack Table v8 with custom column group rendering.

**Acceptance criteria:**
- [ ] First column (row names) is frozen/sticky on horizontal scroll
- [ ] Column headers form a multi-level tree:
  - Level 1: root column headers (may span multiple sub-columns)
  - Level 2: sub-column headers
  - Level 3: sub-sub-column headers (leaf = data column)
- [ ] Only leaf columns contain cell data
- [ ] Table renders smoothly for 50 rows × 100 leaf columns
- [ ] Horizontal scroll works on touch and mouse
- [ ] In landscape mobile web, frozen column remains frozen

---

### FEAT-05 — Tree Table (Mobile / Expo)

**Technology:** Custom ScrollView with synchronized horizontal scroll; no TanStack Table dependency.

**Acceptance criteria:**
- [ ] Column headers scroll horizontally; first column is frozen
- [ ] Works in landscape orientation (iOS + Android)
- [ ] Tap cell to view value; long-press to edit
- [ ] Pinch-zoom or font-size controls for dense tables

---

### FEAT-06 — Inline Cell Editing

**Acceptance criteria:**
- [ ] Clicking a cell (web) opens inline editor appropriate to col_type:
  - `boolean`: toggle chip (true / false / null)
  - `text`: text input
  - `number`: numeric input
  - `url`: URL input with preview link
  - `mixed`: type selector + value input
- [ ] `Escape` cancels, `Enter` (or click away) saves
- [ ] Cell shows a small AI indicator if `filled_by_ai = true`
- [ ] Cell shows source icon (link) if `source_url` is set; clicking opens it

---

### FEAT-07 — Column Visibility (Per-User)

**Acceptance criteria:**
- [ ] Each user has independent hidden-column state (stored in `column_visibility` table)
- [ ] Unauthenticated users: hidden state stored in localStorage
- [ ] A button shows: **"3 columns · 7 sub-columns hidden"** (counts hidden by level)
  - Clicking opens a panel listing all hidden columns with a "Show" button each
- [ ] Individual column headers have a hide (×) button on hover
- [ ] Hiding a parent column also visually hides all its children
- [ ] Hidden columns do NOT appear in the column count shown in the table header

---

### FEAT-08 — Column Filters

**Acceptance criteria:**
- [ ] Each leaf column header has a filter toggle
- [ ] Filter options depend on col_type:
  - `boolean`: show All / True / False / Empty
  - `text`: text contains/equals
  - `number`: >, <, =, between
  - `url`: has URL / no URL
- [ ] Multiple column filters combine with AND
- [ ] Filter state is URL-query-string encoded (shareable filtered views)
- [ ] Filtered row count shown: **"Showing 12 of 34 projects"**

---

### FEAT-09 — AI Cell Filling

**Acceptance criteria:**
- [ ] User selects one or more cells (shift-click range or checkbox select)
- [ ] Opens **"Fill with AI"** dialog:
  - LLM provider: Claude / OpenAI / Gemini (dropdown)
  - Model: appropriate model list per provider
  - API key: user's own key (stored in localStorage, never sent to our backend)
  - Search provider: Tavily (default) / Brave / None
  - Context hint: optional free-text instructions
- [ ] Submits an `AIFillJob`; cells show a spinner state
- [ ] AI agent per cell:
  1. Constructs search query from row name + column name + context hint
  2. Calls search API, retrieves top-3 results
  3. Prompts LLM to extract the cell value from results
  4. Writes `value`, `filled_by_ai=true`, `source_url`, `source_excerpt`, `confidence`
- [ ] LLM system prompt enforces output as structured JSON with value + citation
- [ ] Progress streamed via `aiJobProgress` subscription
- [ ] User can cancel in-flight job

**LLM abstraction interface (`backend/app/services/ai_filler.py`):**

```python
class LLMClient(Protocol):
    async def complete(self, messages: list[Message], tools: list[Tool]) -> str: ...

def make_llm_client(provider: str, model: str, api_key: str) -> LLMClient:
    match provider:
        case "claude":  return ClaudeClient(model, api_key)
        case "openai":  return OpenAIClient(model, api_key)
        case "gemini":  return GeminiClient(model, api_key)
```

---

### FEAT-10 — GitHub Integration

**Accepts rows with GitHub URLs and enriches metadata.**

**Acceptance criteria:**
- [ ] When a row has a `github_url`, a "Fetch GitHub data" button appears
- [ ] Fetches: stars, forks, language, license, last pushed, description, topics
- [ ] Uses existing `star_diff_rs` binary output for stars-delta-over-N-days
- [ ] GitHub stats rendered as special metadata cells (read-only, not in the column tree)
- [ ] "Import from GitHub" bulk-add: user pastes a list of repo URLs; system creates rows

---

### FEAT-11 — Real-Time Cell Comments

**Technology:** Supabase Realtime (Postgres changes) + GraphQL subscription proxy.

**Acceptance criteria:**
- [ ] Clicking a cell opens a side panel with its comment thread
- [ ] Comments appear in real-time for all viewers of the same set
- [ ] Authenticated users can post, edit (own), and soft-delete (own) comments
- [ ] Comment count badge shown on cells that have comments
- [ ] Mobile: comment panel slides up as a bottom sheet

---

### FEAT-12 — Authentication

**Technology:** Supabase Auth (email/password + GitHub OAuth).

**Acceptance criteria:**
- [ ] Sign in with GitHub OAuth (primary) or email/password
- [ ] Unauthenticated users can view public sets and filter; cannot edit or comment
- [ ] Auth state reflected in nav bar (avatar + sign out)
- [ ] Protected routes redirect to sign-in

---

### FEAT-13 — Rust Extension (PyO3)

**Use cases:**
- Ranking rows by a weighted score across multiple columns
- Bulk similarity scoring for deduplication
- Fast CSV/YAML export of large sets

**Acceptance criteria:**
- [ ] `backend/rust_ext/` compiles to a Python extension via `maturin`
- [ ] `rank_rows(cells: list[dict], weights: dict) -> list[RankedRow]` callable from Python
- [ ] `export_csv(set_data: dict) -> bytes` for fast large-set export
- [ ] Integrated into FastAPI route `GET /export/{set_id}.csv`

---

## 6. API Routes (FastAPI)

```
POST /graphql          — GraphQL endpoint (Strawberry)
GET  /graphql          — GraphQL playground (dev only)
GET  /ws/graphql       — WebSocket subscriptions
GET  /export/{set_id}.csv  — Fast CSV export (Rust)
GET  /health           — health check
```

---

## 7. Implementation Phases

| Phase | Contents | Target |
|-------|----------|--------|
| **P0** | Repo structure, Supabase tables, RLS, Python backend scaffold | Week 1 |
| **P1** | FEAT-01 + FEAT-02 + FEAT-03 (CRUD via GraphQL) | Week 1-2 |
| **P2** | FEAT-04 (Tree Table web) + FEAT-06 (cell edit) | Week 2-3 |
| **P3** | FEAT-07 (column visibility) + FEAT-08 (filters) | Week 3 |
| **P4** | FEAT-12 (auth) + FEAT-11 (comments) | Week 3-4 |
| **P5** | FEAT-09 (AI fill) | Week 4-5 |
| **P6** | FEAT-05 (mobile table) + FEAT-10 (GitHub) | Week 5-6 |
| **P7** | FEAT-13 (Rust ext) + export | Week 6 |

---

## 8. Environment Variables

```env
# Backend
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
GITHUB_TOKEN=...              # for GitHub data enrichment
TAVILY_API_KEY=...            # default search provider

# Web (Next.js public)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:8000/graphql

# AI keys — stored CLIENT-SIDE in localStorage, never sent to backend
# (user provides at fill-time)
```

---

## 9. Key Design Decisions and Constraints

| Concern | Decision |
|---------|----------|
| Cell value schema | JSONB `value` field. Nullable = no data. Boolean stored as JSON bool, not string. |
| Hierarchy depth | No hard DB limit; UI enforces ≤3 visible levels to avoid unusable headers |
| Column type `mixed` | Allows heterogeneous values in a column (e.g., some boolean rows, some text) |
| AI keys in backend | Never. User's LLM API key goes into `ai_fill_jobs.llm_api_key` encrypted, OR is passed per-request and used immediately without storage |
| Supabase Realtime | Used for comments only. Cell updates go through GraphQL mutations + optimistic UI |
| Pagination | Comparison sets with >200 rows use cursor-based pagination in GraphQL |
| Export | CSV via Rust for speed; JSON via Python for simplicity |
| Slug uniqueness | Enforced at DB level. Conflict = append `-2`, `-3`, etc. |

---

## 10. Open Questions

- [ ] Should AI keys be stored encrypted server-side per user (better UX) or always client-side (better privacy)?
- [ ] Support for importing comparison data from CSV upload?
- [ ] Versioning / change history for cells?
- [ ] Should Expo mobile app use the same GraphQL endpoint or Supabase JS SDK directly?
