# AI Subtitle Translator for Chrome

A Chrome extension that translates subtitles on streaming platforms using AI services.

## Features

- **Multi-platform support**: YouTube, Netflix, Disney+, Prime Video
- **Multiple AI providers**:
  - Claude API (Anthropic)
  - OpenAI API (GPT-4)
  - Ollama (local, offline)
- **Smart caching**: L1 memory + L2 IndexedDB with LRU eviction
- **Real-time translation**: Stream translation progress
- **Bilingual subtitles**: Show original and translated text together
- **Customizable**: Font size, position, background style

## Installation

### From Source

1. Clone the repository:
   ```bash
   git clone https://github.com/user/ai_subtitle_translator_for_chrome.git
   cd ai_subtitle_translator_for_chrome
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Configuration

1. Click the extension icon in Chrome toolbar
2. Click "Settings" to open the options page
3. Choose your preferred translation provider:
   - **Claude API**: Enter your Anthropic API key
   - **OpenAI API**: Enter your OpenAI API key
   - **Ollama**: Ensure Ollama is running locally (`ollama serve`)

## Usage

1. Navigate to a supported streaming platform
2. Play a video with subtitles enabled
3. Click the translate button (🌐) in the video player
4. Wait for translation to complete
5. Translated subtitles will overlay the video

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Commands

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run typecheck
```

### Project Structure

```
src/
├── background/          # Service worker
│   ├── index.ts
│   ├── message-handler.ts
│   └── translation-service.ts
├── content/             # Content scripts
│   ├── index.ts         # Main content script (MAIN world)
│   ├── bridge.ts        # Message bridge (ISOLATED world)
│   ├── adapters/        # Platform-specific adapters
│   │   ├── youtube-adapter.ts
│   │   ├── netflix-adapter.ts
│   │   ├── disney-adapter.ts
│   │   └── prime-adapter.ts
│   └── ui/              # UI components
├── popup/               # Popup UI
├── options/             # Settings page
└── shared/              # Shared utilities
    ├── cache/           # L1 + L2 cache system
    ├── parsers/         # Subtitle parsers (WebVTT, TTML, JSON3)
    ├── providers/       # AI provider implementations
    ├── types/           # TypeScript definitions
    └── utils/           # Helper functions
```

## Supported Subtitle Formats

| Platform | Format | Parser |
|----------|--------|--------|
| YouTube | JSON3, WebVTT | json3-parser, webvtt-parser |
| Netflix | TTML | ttml-parser |
| Disney+ | WebVTT | webvtt-parser |
| Prime Video | WebVTT | webvtt-parser |

## Architecture

### Content Script Worlds

- **MAIN world**: XHR/fetch interception for subtitle capture
- **ISOLATED world**: `chrome.runtime` communication bridge

### Cache Strategy

- **L1 (Memory)**: Fast access, 50 entries max
- **L2 (IndexedDB)**: Persistent, 100MB max, LRU eviction

### Message Flow

```
Content Script (MAIN) 
    ↓ window.postMessage
Bridge Script (ISOLATED)
    ↓ chrome.runtime.sendMessage
Background Service Worker
    ↓ AI Provider API
Translation Result
```

## Testing

See [TESTING.md](TESTING.md) for manual testing guide.

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and lint
5. Submit a pull request
