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

# AI Subtitle Translator - Development Guidelines

Chrome Extension (Manifest V3) for AI-powered subtitle translation on streaming platforms.
Built with TypeScript 5.x (strict mode), Webpack, and vanilla TypeScript (no UI framework).

## Build / Lint / Test Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development build with watch mode |
| `npm run build` | Production build |
| `npm test` | Run all tests with Vitest |
| `npm run test:unit` | Run unit tests only (`tests/unit/`) |
| `npm run test:integration` | Run integration tests only (`tests/integration/`) |
| `npm run test:e2e` | Run E2E tests with Playwright |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | ESLint check on `src/**/*.ts` |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run typecheck` | TypeScript type checking without emit |

### Running a Single Test

```bash
# Run a specific test file
npx vitest run tests/unit/parsers/webvtt-parser.test.ts

# Run tests matching a pattern
npx vitest run -t "parseWebVTT"

# Run a single test in watch mode
npx vitest tests/unit/parsers/webvtt-parser.test.ts
```

### Validation Before Commit

```bash
npm test && npm run lint
```

## Project Structure

```
src/
├── background/          # Service Worker (translation orchestration)
├── content/             # Content Scripts (MAIN + ISOLATED worlds)
│   ├── adapters/        # Platform adapters (YouTube, Netflix, Disney+, Prime)
│   └── ui/              # UI components (buttons, overlays)
├── popup/               # Extension popup page
├── options/             # Options/settings page
└── shared/              # Shared utilities
    ├── cache/           # Two-tier cache (L1 memory + L2 IndexedDB)
    ├── parsers/         # Subtitle parsers (WebVTT, TTML, JSON3)
    ├── providers/       # AI translation providers
    ├── types/           # TypeScript type definitions
    └── utils/           # Helper utilities
tests/
├── setup.ts             # Global test setup (Chrome API mocks)
├── unit/                # Unit tests
└── integration/         # Integration tests
```

## Path Aliases

Use these aliases in imports (configured in tsconfig.json and webpack):

- `@shared` → `src/shared`
- `@background` → `src/background`
- `@content` → `src/content`
- `@popup` → `src/popup`
- `@options` → `src/options`

## Code Style Guidelines

### TypeScript Configuration

- **Strict mode enabled** - all strict flags are on
- **Target**: ES2022
- **No implicit any** - all variables must have explicit types
- **Strict null checks** - handle null/undefined explicitly

### File Naming

- **kebab-case** for all files: `webvtt-parser.ts`, `cache-manager.ts`
- **index.ts** for barrel exports in directories

### Type/Interface Naming

- **PascalCase** for types, interfaces, classes, enums
- String union types for constrained values:

```typescript
export type Platform = 'youtube' | 'netflix' | 'disney' | 'prime';
export type ProviderType = 'claude-api' | 'openai-api' | 'ollama';
```

### Variable/Function Naming

- **camelCase** for functions and variables
- Verb prefixes for functions: `get*`, `is*`, `create*`, `parse*`, `format*`
- **SCREAMING_SNAKE_CASE** for constants: `TRANSLATION_CONFIG`, `DEFAULT_OPTIONS`

### Import Conventions

```typescript
// 1. Type-only imports use 'type' keyword
import type { Cue, Subtitle } from '../types/subtitle';

// 2. Use path aliases for cross-module imports
import { cacheManager } from '@shared/cache';

// 3. Prefer named exports over default exports
export { parseWebVTT, isValidWebVTT };
export class TranslationService { ... }

// 4. Group imports: external → aliases → relative
import { vi } from 'vitest';
import type { TranslationProvider } from '@shared/providers/types';
import { formatDuration } from '../utils/helpers';
```

### ESLint Rules (Enforced)

| Rule | Setting |
|------|---------|
| `@typescript-eslint/no-explicit-any` | error |
| `@typescript-eslint/explicit-function-return-type` | warn |
| `@typescript-eslint/no-unused-vars` | error (ignores `_` prefix) |
| `@typescript-eslint/no-floating-promises` | error |
| `@typescript-eslint/await-thenable` | error |
| `no-console` | warn (allows `console.warn`, `console.error`) |
| `prefer-const` | error |
| `eqeqeq` | always |
| `no-eval` | error |

### Error Handling

Use custom error classes with error codes:

```typescript
export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public provider: ProviderType,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
```

Response pattern with success/error:

```typescript
export interface Response<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

Console logging with prefix tags:

```typescript
console.warn('[CacheManager] Cache miss for key:', key);
console.error('[TranslationService] Job failed:', error);
```

### Code Organization

- **JSDoc comments** for public APIs
- **Section separators** for large files:
  ```typescript
  // ============================================================================
  // Public API
  // ============================================================================
  ```
- **Type guards** for runtime validation:
  ```typescript
  function isValidCue(cue: unknown): cue is Cue { ... }
  ```
- **Singleton pattern** for services:
  ```typescript
  export const cacheManager = new CacheManager();
  ```

## Testing Guidelines

- Test files: `*.test.ts` in `tests/` directory
- Use `vi.mock()` for module mocking
- Chrome APIs are mocked in `tests/setup.ts`
- Use `fake-indexeddb` for IndexedDB tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWebVTT } from '@shared/parsers/webvtt-parser';

describe('parseWebVTT', () => {
  it('should parse valid WebVTT content', () => {
    const result = parseWebVTT(validContent);
    expect(result.cues).toHaveLength(3);
  });
});
```

## Chrome Extension Specifics

- **Manifest V3** - service workers, not background pages
- **Content script worlds**: MAIN (subtitle interception) + ISOLATED (message bridge)
- **Message passing**: Use typed messages with `chrome.runtime.sendMessage`
- **Storage**: `chrome.storage.local` for settings, IndexedDB for cache

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
