# Session Helper CLI

A helper tool to extract session tokens for use with the AI Subtitle Translator Chrome extension.

## Prerequisites

- Python 3.9 or later
- pip (Python package manager)

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

4. Install Playwright browsers:

   ```bash
   playwright install chromium
   ```

## Usage

### Claude Authentication

Claude has migrated to OAuth 2.0 authentication. Use the extension's built-in OAuth flow:

```bash
python session_helper.py claude
```

This will display instructions for authenticating via the extension's options page.

### Extract ChatGPT Session Token

```bash
python session_helper.py chatgpt
```

Options:
- `-o, --output PATH` - Output file path (default: `chatgpt.session.json`)
- `-t, --timeout SECONDS` - Login timeout in seconds (default: 300)
- `-y, --yes` - Skip ToS warning confirmation

Example:

```bash
python session_helper.py chatgpt -o my-chatgpt.session.json -t 600
```

## How It Works (ChatGPT)

1. The tool launches a browser window
2. You log in to ChatGPT manually
3. Once logged in, the tool extracts the session token
4. The token is saved to a JSON file

## Output Format

### ChatGPT Session

```json
{
  "provider": "chatgpt-subscription",
  "timestamp": "2025-01-19T12:00:00+00:00",
  "credentials": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs..."
  },
  "expiresAt": "2025-01-26T12:00:00+00:00"
}
```

## Using the Token in the Extension

### For ChatGPT:

1. Open the AI Subtitle Translator extension options page
2. Select **ChatGPT Subscription** as the provider
3. Copy the `accessToken` value from the JSON file
4. Paste the token into the extension's settings
5. **Important**: Delete the session file after use for security

### For Claude:

Claude uses OAuth 2.0 authentication. Follow these steps in the extension:

1. Open the AI Subtitle Translator extension options page
2. Select **Claude Pro (OAuth)** as the provider
3. Click "Login with Claude"
4. Complete the authentication in the popup window

The extension handles the OAuth flow automatically.

## Security Notes

- Session tokens are sensitive credentials
- The output JSON files are not encrypted
- Delete session files after copying the token to the extension
- Never share your session tokens with others
- Session files are excluded from git via `.gitignore`

## Troubleshooting

### "Login timed out"

The default timeout is 5 minutes. If you need more time:

```bash
python session_helper.py chatgpt -t 600  # 10 minutes
```

### "Could not find accessToken"

This usually means:
- Login was not completed successfully
- The service's login flow has changed
- You're using a region-restricted account

Try:
1. Clear browser cookies and try again
2. Ensure you can log in manually in a regular browser
3. Check if there are any captcha or verification steps

### Browser doesn't open

Make sure Playwright browsers are installed:

```bash
playwright install chromium
```

## Disclaimer

Using this tool may violate the Terms of Service of ChatGPT (OpenAI). Use at your own risk. The authors are not responsible for any consequences of using this tool.
