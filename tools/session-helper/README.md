# Session Helper CLI

A helper tool to use your ChatGPT Plus subscription for SRT subtitle translation.

> **How it works**: This tool uses OAuth authentication (like OpenCode) to get access tokens from your existing subscription. The tokens can then be used to call the ChatGPT API for translation.

## Prerequisites

- Python 3.9 or later
- pip (Python package manager)
- Active ChatGPT Plus/Pro subscription

## Installation

1. Navigate to the `tools/session-helper` directory:

   ```bash
   cd tools/session-helper
   ```

2. Create a virtual environment (recommended):

   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

## Quick Start (TL;DR)

```bash
# 1. Get OAuth token (one-time setup per session)
python session_helper.py chatgpt

# 2. Translate your SRT file
python srt_translator.py translate --input movie.srt

# Output: movie_translated.srt
```

---

## Tools

This directory contains two CLI tools:

| Tool | Purpose |
|------|---------|
| `session_helper.py` | Get OAuth tokens from ChatGPT subscription |
| `srt_translator.py` | Translate SRT subtitle files using ChatGPT |

---

## Session Helper

Gets OAuth access tokens from your ChatGPT subscription account.

### ChatGPT Authentication

```bash
python session_helper.py chatgpt
```

This will:
1. Start a local callback server
2. Open OpenAI's OAuth page in your browser
3. Automatically receive the callback
4. Save to `chatgpt.session.json`

### Options

| Option | Description |
|--------|-------------|
| `-o, --output PATH` | Output file path |
| `-t, --timeout SECONDS` | Login timeout (default: 300) |
| `-y, --yes` | Skip ToS warning |

Example:

```bash
python session_helper.py chatgpt -o my-chatgpt.session.json -t 600
```

---

## SRT Translator

Translate SRT subtitle files using your ChatGPT Plus subscription.

### Features

- **Context-aware translation** - Uses surrounding subtitles for better quality
- **Batch processing** - Minimizes API calls by processing multiple cues at once
- **Progress display** - Shows progress with estimated time
- **Retry logic** - Automatic retry with exponential backoff
- **UTF-8 BOM output** - Windows-compatible output files

### How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   SRT File      │────▶│  SRT Translator  │────▶│  Translated     │
│   (English)     │     │  (Batch + Context)│     │  SRT File       │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼
                      ┌──────────────────┐
                      │  ChatGPT         │
                      │  (Codex API)     │
                      └──────────────────┘
```

### ChatGPT Codex API Details

- Uses the same OAuth flow as OpenCode CLI
- Supports GPT-5 series models: `gpt-5`, `gpt-5-codex`, `gpt-5-codex-mini`, etc.
- Requires `ChatGPT-Account-Id` header (automatically extracted from JWT)
- Uses SSE streaming format with `instructions` + `input` fields

### Commands

#### translate

Translate an SRT subtitle file:

```bash
python srt_translator.py translate [OPTIONS]
```

Options:
| Option | Description |
|--------|-------------|
| `-i, --input PATH` | Input SRT file path (required) |
| `-o, --output PATH` | Output file path (default: `input_translated.srt`) |
| `-l, --target-lang` | Target language code (default: `zh-TW`) |
| `-b, --batch-size` | Cues per batch (default: 10) |
| `-c, --context-size` | Context cues before/after batch (default: 2) |

Supported target languages:
- `zh-TW` - Traditional Chinese (default)
- `zh-CN` - Simplified Chinese
- `ja` - Japanese
- `ko` - Korean
- `en` - English
- `es` - Spanish
- `fr` - French
- `de` - German

#### validate

Check if a session token is valid:

```bash
python srt_translator.py validate
```

### Examples

**Basic translation:**

```bash
python srt_translator.py translate --input movie.srt
```

**Translate to Japanese with custom batch size:**

```bash
python srt_translator.py translate \
  --input movie.srt \
  --output movie_ja.srt \
  --target-lang ja \
  --batch-size 5
```

**Full workflow example:**

```bash
# Step 1: Activate virtual environment
source venv/bin/activate

# Step 2: Get ChatGPT OAuth token (opens browser)
python session_helper.py chatgpt

# Step 3: Verify token is valid
python srt_translator.py validate

# Step 4: Translate your subtitle file
python srt_translator.py translate \
  --input "My Movie.srt" \
  --output "My Movie_zh-TW.srt" \
  --target-lang zh-TW

# Output: My Movie_zh-TW.srt (translated subtitles)
```

---

## Output Format

### Session Files

```json
{
  "provider": "chatgpt-oauth",
  "timestamp": "2025-01-19T12:00:00+00:00",
  "credentials": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs..."
  },
  "expiresAt": "2025-01-26T12:00:00+00:00"
}
```

### Translated SRT

The output SRT file includes:
- UTF-8 encoding with BOM (for Windows compatibility)
- Windows-style line endings (CRLF)
- Preserved timing and cue structure

---

## Security Notes

- Session tokens are sensitive credentials
- The output JSON files are not encrypted
- Delete session files after use for security
- Never share your session tokens with others
- Session files are excluded from git via `.gitignore`

---

## Troubleshooting

### "Login timed out"

The default timeout is 5 minutes. If you need more time:

```bash
python session_helper.py chatgpt -t 600  # 10 minutes
```

### "Session token has expired"

Re-authenticate using session_helper:

```bash
python session_helper.py chatgpt
```

### "ChatGPT model not supported"

The Codex API uses GPT-5 series models, not GPT-4. If you see an error like "model is not supported", the translator will automatically use `gpt-5-codex-mini`.

Valid models for Codex API:
- `gpt-5` - Base GPT-5
- `gpt-5-codex` - Optimized for coding
- `gpt-5-codex-mini` - Faster, smaller model (default)
- `gpt-5.1`, `gpt-5.1-codex` - Newer versions

### "No valid cues found"

The input file might have encoding issues. Try:
1. Open in a text editor and save as UTF-8
2. Check for malformed timestamps

### Translation quality issues

- Increase `--context-size` for better context awareness
- Decrease `--batch-size` for more focused translations

### Rate limiting

If you hit rate limits:
1. Decrease `--batch-size` to make smaller requests
2. The tool will automatically retry with backoff

---

## Test Files

Sample SRT files for testing are available in `tests/fixtures/`:

- `sample_en.srt` - English subtitles (10 cues)
- `sample_ja.srt` - Japanese subtitles (10 cues)

---

## Disclaimer

Using this tool may violate the Terms of Service of ChatGPT (OpenAI). Use at your own risk. The authors are not responsible for any consequences of using this tool.
