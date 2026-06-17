# Sentellent Agent — Architecture & Design Decisions

## Overview

A multi-tenant "Chief of Staff" AI assistant with persistent memory. Users chat with a Gemini-powered agent that remembers preferences, facts, and communication style across sessions.

```
Browser → Next.js (Frontend) → FastAPI (Backend) → Gemini API
                                   ↕
                              PostgreSQL + pgvector
                                   ↕
                              Memory Layer (extract → embed → store → retrieve)
```

---

## Backend (FastAPI + LangGraph)

### Stack
- **FastAPI** — async Python framework, auto-docs at `/docs`
- **LangGraph-style agent** in `app/services/agent.py` — pure Python with direct Gemini HTTP calls (no `langgraph` SDK dependency)
- **SQLAlchemy 2.0** async with `asyncpg` — clean ORM, no manual SQL
- **Alembic** for migrations — `alembic upgrade head` runs automatically in the Docker entrypoint

### Why direct HTTP instead of `google-generativeai` or `langchain-google-genai`?
The environment uses Python 3.8 where those packages have compatibility issues. `httpx` works everywhere and gives us full control over request/response handling.

### Gemini integration
Two separate API calls per user message:
1. **Chat** — `generateContent` endpoint for the actual response
2. **Memory extraction** — same endpoint with a structured extraction prompt (temperature 0.1 for consistency)

This doubles API quota usage but keeps memory extraction reliable. Each call maps history roles: `"assistant"` in DB → `"model"` in Gemini API.

### Dynamic Memory System
```
User message
  → retrieve_relevant_memories()      # keyword ILIKE + vector cosine similarity
  → inject into prompt context         # prepended to user message text
  → call_gemini()                      # chat with context
  → extract_and_store_memories()       # Gemini extracts structured {key, value, category}
  → upsert into memory_items table
  → generate embedding (text-embedding-004 / gemini-embedding-1)
```

**Categories:** `preference`, `fact`, `style_preference`

**Retrieval fallback chain:**
1. Split query into keywords (skip stop words) → ILIKE match on key/value
2. Embed query → cosine distance on stored vectors (768d)
3. If both empty → return 5 most recent memories

### Why memory extraction runs after the response?
So the user gets an immediate answer without waiting for the extraction API call. Memory storage is fire-and-forget.

### Google OAuth
- **GIS (Google Identity Services)** popup — no redirect URIs needed for SPAs
- Token verified server-side via `google-auth` library
- JWT issued with `python-jose`, 24hr expiry
- `get_optional_user` dependency — auth is optional; unauthenticated users get chat without memory persistence

---

## Frontend (Next.js 16 + React 19 + Tailwind v4)

### Why `ssr: false` with `next/dynamic`?
Browser extensions (Qwant) inject attributes into the DOM before React hydrates, causing hydration mismatches. Disabling SSR for the chat UI eliminates this entirely. Since the app requires Google login, SEO is irrelevant.

```
page.tsx (dynamic, ssr: false)
  └── ChatContent.tsx (full UI, client-only)
```

### State & Auth
- JWT token stored in `localStorage` via `api.ts` helpers
- User object also cached in `localStorage` for instant UI display on refresh
- `apiFetch()` always attaches `Authorization: Bearer <token>` when available
- Login button rendered via GIS `renderButton()` into a ref div

### Dark theme
Pure black background (`bg-black`), zinc-950/900 surfaces, blue-600 accent, rounded bubbles with subtle border differentiation for user vs assistant.

---

## Database (PostgreSQL + pgvector)

### Schema (`memory_items`)
| Column | Type | Purpose |
|---|---|---|
| `key` | VARCHAR(255) | Machine-readable identifier (e.g. `favorite_color`) |
| `value` | TEXT | Human-readable content (e.g. `blue`) |
| `category` | VARCHAR(50) | `preference`, `fact`, `style_preference` |
| `embedding` | vector(768) | For semantic search via cosine distance |
| `user_id` | UUID FK → users | Per-user isolation (multi-tenant) |

Each user's memories are isolated by `user_id`. Lookups use `user_id + keyword search` as the primary path, with vector search as a fallback.

### Migrations
Migrations run automatically on container startup via `entrypoint.sh` (`alembic upgrade head`). The first migration creates pgcrypto and vector extensions, then all four tables.

---

## Infrastructure (Terraform + AWS ECS)

### Design decisions
- **Fargate** — no servers to manage, auto-scaling, pay-per-task
- **RDS PostgreSQL 16** with `pgvector` — managed DB with automated backups
- **ALB** with path-based routing — `/api/*` → backend, `/*` → frontend
- **Private subnets** for ECS + RDS, public subnets only for ALB and NAT
- **S3 backend** for Terraform state with versioning

### CI/CD (GitHub Actions)
1. `terraform apply` — provisions/changes infra
2. `docker build & push` to ECR with `:latest` and `:${sha}` tags
3. `ecs update-service --force-new-deployment` — zero-downtime rolling update
4. `ecs wait services-stable` — confirms deployment health

Database migrations run during container startup (no separate migration step needed).

---

## Credentials & Secrets

| Where | What |
|---|---|
| GitHub Actions secrets | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `JWT_SECRET_KEY` |
| Terraform vars | `gemini_api_key`, `google_client_id`, `jwt_secret_key` (passed via `TF_VAR_*` in CI) |
| Backend `.env` | Local dev: copy from `backend/.env.example` |
| Frontend `.env.local` | Local dev: copy from `frontend/.env.example` |

---

## Local Development

```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env    # edit with your API keys
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
cp .env.example .env.local    # edit with your Google Client ID
npm install
npm run dev
```

Or use Docker Compose:
```bash
GEMINI_API_KEY=xxx GOOGLE_CLIENT_ID=xxx docker compose up
```
