# CLAUDE.md

This file provides guidance to Claude Code when working with the `web/` subdirectory of the DOO Multi-Agent System.

## Project Overview

The web frontend is a React + TypeScript + Vite application for the **幼儿叙事能力评估系统** (Preschool Children's Narrative Ability Assessment Platform). It provides a UI for teachers to:
- Assess children's narrative ability using the DOO model (Diction, Organization, Opinion)
- View child portraits with radar charts and historical assessments
- View class-level aggregate statistics
- Manage teacher accounts (admin only)

## Tech Stack

- **Frontend**: React 19 + TypeScript 6 + Vite 8
- **Backend**: Express.js (port 3001), imports `DOOMultiAgentSystem` from parent project at `../../src`
- **Auth**: Client-side, localStorage-based (no real backend auth)
- **Styling**: Inline `<style>` tags (CSS-in-JS without a library) + global CSS variables
- **Fonts**: ZCOOL KuaiLe (headings), Noto Sans SC (body) — loaded via Google Fonts in index.html

## Development Commands

```bash
# Frontend dev server (Vite HMR, default port 5173)
npm run dev

# Build frontend
npm run build

# Backend dev server (Express, port 3001, uses tsx for live reload)
npm run server:dev

# Backend production (requires prior build of parent project)
npm run server
```

The backend (`server/index.ts`) depends on the parent project's compiled output at `../../src`. Build the parent project first with `npm run build` in the parent directory.

## Architecture

### Routing

No router library. `App.tsx` uses `useState<Page>` with 6 values: `dashboard`, `assess`, `portraits`, `class-stats`, `profile`, `admin-users`.

### Pages (`src/pages/`)

| Page | Description |
|------|-------------|
| `LoginPage.tsx` | Login/register with test credentials shown (teacher1/123456, admin/admin) |
| `Dashboard.tsx` | Stats cards, quick actions, recent activity feed, DOO model info |
| `AssessPage.tsx` | Core: narrative input form + multi-agent assessment results display |
| `PortraitPage.tsx` | Child portrait browser with radar chart, history, PDF export |
| `ClassStatsPage.tsx` | Class-level stats with bar/pie charts, class comparison table |
| `ProfilePage.tsx` | User profile editing, password change |
| `AdminUsersPage.tsx` | Admin-only: CRUD teacher accounts |

### Components (`src/components/`)

- `Sidebar.tsx` — Fixed 260px left sidebar with nav, agent status indicators, logout
- `RadarChart.tsx` — Pure SVG 3-axis radar chart (Diction/Organization/Opinion)
- `ReportExport.tsx` — Generates standalone HTML report for print/PDF export
- `VoiceInput.tsx` — Web Speech API voice input (zh-CN)

### State Management

No Redux/Zustand. State is managed via:
- `AuthContext.tsx` — React Context for auth (login, register, admin CRUD)
- Custom hooks in `src/hooks/` — API data fetching
- Local component state in pages

### API Client (`src/services/api.ts`)

Base URL: `http://localhost:3001/api`. Key endpoints:
- `POST /assess` — Run narrative assessment (accepts `NarrativeInput`)
- `GET /portraits` — All child portraits
- `GET /portrait/:childId` — Single portrait
- `DELETE /portrait/:childId` — Delete portrait
- `GET /stats` — Aggregate statistics

### DOO Assessment Model

Three dimensions, 7 sub-dimensions, each scored 1-3:
- **Diction (词句)**: vocabulary, sentenceStructure
- **Organization (语言组织)**: narrativeStructure, themeRelevance, eventExpansion, expressiveness
- **Opinion (独白观点)**: narrativeViewpoint

Level calculation (`src/utils/levelCalculator.ts`): Level 1 (< 1.5 avg), Level 2 (1.5–2.4), Level 3 (≥ 2.5).

### Data Storage

Child portrait JSON files in `data/` directory (23 files currently). Each contains child info, assessment history, and radar averages. Managed by the backend server.

## Key Conventions

- All text is in Chinese (zh-CN). UI labels, error messages, and comments use Chinese.
- Components use inline `<style>` tags, not CSS modules or styled-components.
- CSS custom properties defined in `src/index.css` (primary: #FF8C42, secondary: #6B5B95, accent: #88D8B0).
- No TypeScript path aliases. Relative imports only.
- The `web/` directory is a standalone Vite project but the backend imports from the parent `../../src` multi-agent system.
