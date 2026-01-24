# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Build in development mode with watch
npm run build        # Production build
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
```

## Testing Commands

```bash
npm test             # Run all tests (Vitest)
npm run test:unit    # Unit tests only (tests/unit/)
npm run test:integration  # Integration tests (tests/integration/)
npm run test:e2e     # End-to-end tests (Playwright)
npm run test:watch   # Watch mode for tests
```

Run a single test file:
```bash
npx vitest run tests/unit/parsers/webvtt-parser.test.ts
```

## Project Architecture

This is a Chrome Extension (Manifest V3) for AI-powered subtitle translation on streaming platforms (YouTube, Netflix, Disney+, Prime Video).

### Extension Entry Points (webpack.config.js)

- **background** (`src/background/index.ts`) - Service worker handling translation jobs, caching, and auth
- **content** (`src/content/index.ts`) - Injected into streaming platforms (MAIN world) for subtitle interception
- **bridge** (`src/content/bridge.ts`) - Content script bridge for Chrome API access (separate isolated world)
- **popup** (`src/popup/index.ts`) - Browser action popup
- **options** (`src/options/index.ts`) - Extension settings page

### Key Architectural Patterns

**Platform Adapters** (`src/content/adapters/`):
Each streaming platform has an adapter implementing `PlatformAdapter` interface (`types.ts`). Adapters handle platform-specific subtitle interception, video element detection, and subtitle injection.

**Translation Providers** (`src/shared/providers/`):
Implements `TranslationProvider` interface (`types.ts`) for different AI services. Use `factory.ts` for provider instantiation.

**Message Passing** (`src/shared/types/messages.ts`):
Type-safe messaging between content scripts and background service worker. Messages use discriminated unions with `type` field.

**Caching** (`src/shared/cache/`):
Two-tier cache: L1 in-memory (`l1-memory-cache.ts`) and L2 IndexedDB (`l2-indexeddb-cache.ts`), managed by `cache-manager.ts`.

**Subtitle Parsers** (`src/shared/parsers/`):
`webvtt-parser.ts` (YouTube), `ttml-parser.ts` (Netflix), `json3-parser.ts` (YouTube alternative).

### Webpack Path Aliases

```typescript
@shared    → src/shared
@background → src/background
@content   → src/content
@popup     → src/popup
@options   → src/options
```

### Content Script Worlds

The extension uses two content scripts that run in different worlds:
- `content.js` runs in `MAIN` world (access to page's JS context for subtitle interception)
- `bridge.js` runs in isolated world (access to Chrome APIs, communicates with background)

### Testing Setup

Tests use Vitest with `fake-indexeddb` for IndexedDB mocking and custom Chrome API mocks defined in `tests/setup.ts`.

### ASR Subtitle Optimization

The extension includes specialized handling for YouTube's auto-generated (ASR) subtitles:

**ASR Consolidator** (`src/shared/utils/asr-consolidator.ts`):
- Consolidates fragmented word-by-word segments into logical sentences
- Uses `timingStrategy: 'first'` to show translations when speech begins
- Optimized parameters: `maxGapMs: 1200`, `maxDurationMs: 6000`

**Progressive Reveal** (`src/content/realtime-translator.ts`):
- Gradually reveals translation text to match YouTube's word-by-word display
- Fast start (40% text at 5% time) reduces perceived delay
- Ensures full text is shown by 80% of cue duration

**Gap Handling** (both `subtitle-renderer.ts` and `realtime-translator.ts`):
- Very short gaps (≤500ms): 400ms grace period
- Short gaps (500-1000ms): 350ms grace period
- Medium gaps (1000-1500ms): 250ms grace period
- Prevents subtitle flickering during natural speech pauses

### Default Language

The default target language is **Traditional Chinese (zh-TW)**. This can be changed in the extension settings.

<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->
