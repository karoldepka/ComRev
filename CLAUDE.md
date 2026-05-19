# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ComRev** is a GitHub repository analysis tool that:
- Fetches repositories from GitHub API based on configurable topics
- Filters for recently active repos (pushed within last ~2 months)
- Stores results as YAML in a separate data repository
- Provides a React Native/Expo mobile frontend with 3D text rendering capabilities

## Architecture

### Backend (Python)
- **main.py**: Orchestration script that clones/updates the data repo, fetches GitHub data, saves YAML, commits and pushes changes
- **fetcher.py**: GitHub API client with rate limiting, retry logic, and pagination
- **github_topics.py**: Massive list of topics to search (frontend, mobile, AI, smart home, etc.)
- **models.py**: Dataclass definition for `Repo` structure
- **storage.py / storage_yaml.py**: Persistence layer for YAML serialization
- **services/api/**: FastAPI service with minimal health endpoint (mounted under `/api`)

### Frontend (React Native + Expo)
- **fe/app/(tabs)/**: Tab-based navigation with:
  - `index.tsx`: Home tab
  - `explore.tsx`: Exploration tab
  - `three-d.tsx`: 3D text renderer demo with text equalization controls
- **fe/components/three-d-text.tsx**: Three.js-based 3D text component
- **fe/utils/three-text-geometry.ts**: Custom text geometry utilities for Three.js

### Data Flow
1. Python fetcher queries GitHub API for repos matching topics from `github_topics.py`
2. Filters repos by recency (pushed within ~2 months)
3. Deduplicates by repo ID, sorts by stars descending
4. Saves to YAML in separate ComRev_Data repo
5. Commits and pushes changes automatically

## Development Commands

### Python Backend

```bash
# Install dependencies (using uv)
uv sync

# Run the main fetcher pipeline
python main.py

# Run the FastAPI server
cd services/api
PYTHONPATH=. uv run uvicorn app.main:app --reload
```

**Environment Variables** (`.env` required):
- `GH_PAT`: GitHub Personal Access Token for pushing to ComRev_Data repo
- `GITHUB_TOKEN`: GitHub API token for fetching (optional but recommended for higher rate limits)

### Frontend (React Native + Expo)

```bash
# Install dependencies
cd fe
npm install
# or from root:
pnpm install

# Start Expo dev server
cd fe
npm start
# or
npx expo start --port 8082

# Platform-specific
npm run android
npm run ios
npm run web
```

### Full Stack Dev Mode

```bash
# From repo root - starts backend + frontend together
pnpm dev
# or
./scripts/dev.sh
```

This script:
1. Starts FastAPI backend with hot reload
2. Waits for `/openapi.json` to be available
3. Generates TypeScript API types
4. Starts Expo frontend on port 8082

### API Type Generation

```bash
# Generate TypeScript types from FastAPI OpenAPI schema
pnpm gen:api
# or
./scripts/gen-api.sh
```

Types are written to `packages/api/types.ts`.

## Key Implementation Details

### GitHub Fetcher (`fetcher.py`)
- Uses `httpx.AsyncClient` for async requests
- Implements exponential backoff retry (tenacity)
- Monitors `X-RateLimit-*` headers and sleeps until reset if exhausted
- Fetches 2 pages per topic (100 repos/page)
- Stops pagination early if no recent repos found on a page

### 3D Text Rendering (`fe/components/three-d-text.tsx`)
- Built with `expo-gl` + `expo-three` + `three`
- Supports multi-line text with line width equalization
- Two equalization methods: spacing or font size adjustment
- Real-time text editing and rendering

### Git Automation (`main.py`)
- Clones `karoldepkap/ComRev_Data` if not present
- Updates remote URL with PAT authentication on each run
- Pulls with rebase before pushing to avoid conflicts
- Only commits if changes detected

## Project Structure Notes

- **Monorepo**: Uses `pnpm` workspace with `packages/` and `fe/` apps
- **Python**: Uses `uv` for dependency management (pyproject.toml)
- **Frontend**: Expo Router for file-based routing
- **Backend**: Minimal FastAPI app, designed for Vercel deployment (uses Mangum adapter)

## Topic Management

Topics are defined in `github_topics.py`. The list is deduplicated on load and warns about duplicates. Categories include:
- Frontend/backend frameworks
- Mobile (React Native, Flutter, Ionic, Capacitor)
- AI/ML/LLM tools and agents
- Smart home/IoT
- DevOps, cloud, infrastructure
- Programming languages
- Content management, note-taking
- Low-code/no-code platforms

To add topics, edit `TOPICS_RAW` in `github_topics.py`.

## API Routes

FastAPI service at `services/api/app/main.py`:
- `GET /api/` - API root message
- `GET /api/health` - Health check

## Dependencies

### Python
- `httpx`: Async HTTP client
- `tenacity`: Retry/backoff logic
- `gitpython`: Git operations
- `python-dotenv`: Environment variables
- `pyyaml`: YAML serialization

### Frontend
- `expo`: React Native framework
- `expo-three`: Three.js integration for Expo
- `three`: 3D rendering library
- `react-native-worklets`: Performance optimizations

## Coding/arch
Prefer declarative version (dict/list) over `match` or switch-case.