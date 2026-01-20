#!/usr/bin/env python3
"""
SRT Translator CLI Tool

A command-line tool to translate SRT subtitle files using ChatGPT
OAuth tokens obtained from session_helper.py.

Features:
- Context-aware translation (uses surrounding subtitles for better quality)
- Batch processing to minimize API calls
- Progress display with estimated time
- Retry logic with exponential backoff

Usage:
    # First, get OAuth token using session_helper
    python session_helper.py chatgpt

    # Then translate SRT file
    python srt_translator.py translate --input video.srt
"""

import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import click


# ============================================================================
# Constants
# ============================================================================

DEFAULT_TARGET_LANG = "zh-TW"
DEFAULT_BATCH_SIZE = 30  # Larger batch for faster processing
DEFAULT_CONTEXT_SIZE = 2
MAX_RETRIES = 3
RETRY_BACKOFF = [1, 2, 4]  # seconds
RATE_LIMIT_DELAY = 0  # No delay between batches

# API Endpoints
# Codex API - OpenCode's secret endpoint for subscription users
# See: auth_guide/OpenCode-Codex-API-Discovery.md
CODEX_API_URL = "https://chatgpt.com/backend-api/codex/responses"

# Default models
# For Codex API, use GPT-5 series models
# Available models (tested):
#   - gpt-5.1-codex-mini (fastest, default)
#   - gpt-5.1-codex
#   - gpt-5 / gpt-5.1 (full version)
# Note: o3-mini, o4-mini are NOT supported with ChatGPT account
CHATGPT_MODEL = "gpt-5.1-codex-mini"  # Fastest model for translation


# ============================================================================
# Data Classes
# ============================================================================


@dataclass
class Cue:
    """Represents a single subtitle cue."""

    index: int
    start_time: int  # milliseconds
    end_time: int  # milliseconds
    text: str
    translated_text: Optional[str] = None


@dataclass
class TranslationBatch:
    """A batch of cues to translate with context."""

    cues: list[Cue]
    prev_context: list[Cue]
    next_context: list[Cue]
    start_index: int
    end_index: int


# ============================================================================
# Helper Functions
# ============================================================================


def print_info(message: str) -> None:
    """Print an info message."""
    click.echo(click.style(f"[INFO] {message}", fg="blue"))


def print_success(message: str) -> None:
    """Print a success message."""
    click.echo(click.style(f"[SUCCESS] {message}", fg="green"))


def print_error(message: str) -> None:
    """Print an error message."""
    click.echo(click.style(f"[ERROR] {message}", fg="red"), err=True)


def print_warning(message: str) -> None:
    """Print a warning message."""
    click.echo(click.style(f"[WARNING] {message}", fg="yellow"))


def get_script_dir() -> Path:
    """Get the directory where this script is located."""
    return Path(__file__).parent.resolve()


# ============================================================================
# SRT Parser
# ============================================================================


def parse_timestamp(timestamp: str) -> int:
    """
    Parse SRT timestamp to milliseconds.
    Format: HH:MM:SS,mmm or HH:MM:SS.mmm
    """
    # Replace period with comma for consistency
    timestamp = timestamp.replace(".", ",")

    # Parse components
    match = re.match(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})", timestamp.strip())
    if not match:
        raise ValueError(f"Invalid timestamp format: {timestamp}")

    hours, minutes, seconds, millis = map(int, match.groups())
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + millis


def format_timestamp(ms: int) -> str:
    """Format milliseconds to SRT timestamp."""
    total_seconds = ms // 1000
    millis = ms % 1000

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def parse_srt(content: str) -> list[Cue]:
    """
    Parse SRT content into a list of Cue objects.

    Args:
        content: Raw SRT file content

    Returns:
        List of Cue objects
    """
    cues = []

    # Normalize line endings
    content = content.replace("\r\n", "\n").replace("\r", "\n")

    # Remove BOM if present
    if content.startswith("\ufeff"):
        content = content[1:]

    # Split into blocks (separated by blank lines)
    blocks = re.split(r"\n\s*\n", content.strip())

    for block in blocks:
        if not block.strip():
            continue

        lines = block.strip().split("\n")
        if len(lines) < 3:
            continue

        try:
            # First line: index
            index = int(lines[0].strip())

            # Second line: timestamps
            timestamp_match = re.match(r"(.+?)\s*-->\s*(.+?)(?:\s|$)", lines[1].strip())
            if not timestamp_match:
                print_warning(f"Skipping invalid cue at index {index}: bad timestamp")
                continue

            start_time = parse_timestamp(timestamp_match.group(1))
            end_time = parse_timestamp(timestamp_match.group(2))

            # Remaining lines: text
            text = "\n".join(lines[2:]).strip()

            cues.append(
                Cue(
                    index=index,
                    start_time=start_time,
                    end_time=end_time,
                    text=text,
                )
            )

        except (ValueError, IndexError) as e:
            print_warning(f"Skipping malformed cue block: {e}")
            continue

    return cues


def generate_srt(cues: list[Cue], use_translated: bool = True) -> str:
    """
    Generate SRT content from Cue objects.

    Args:
        cues: List of Cue objects
        use_translated: If True, use translated_text; otherwise use original text

    Returns:
        SRT formatted string with UTF-8 BOM
    """
    lines = []

    for i, cue in enumerate(cues, 1):
        # Index
        lines.append(str(i))

        # Timestamps
        lines.append(
            f"{format_timestamp(cue.start_time)} --> {format_timestamp(cue.end_time)}"
        )

        # Text
        text = (
            cue.translated_text if use_translated and cue.translated_text else cue.text
        )
        lines.append(text)

        # Blank line between cues
        lines.append("")

    # Join with Windows line endings and add UTF-8 BOM
    content = "\r\n".join(lines)
    return "\ufeff" + content


# ============================================================================
# Session Token Management
# ============================================================================


def load_session() -> Optional[dict]:
    """
    Load ChatGPT session credentials from file.

    Returns:
        Session data dict or None if not found
    """
    script_dir = get_script_dir()
    session_file = script_dir / "chatgpt.session.json"

    if not session_file.exists():
        print_error(
            f"Session file not found: {session_file}\n"
            f"Please run: python session_helper.py chatgpt"
        )
        return None

    try:
        with open(session_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print_error(f"Invalid session file format: {e}")
        return None


def validate_session(session: dict) -> bool:
    """
    Check if session token is still valid.

    Based on auth_guide recommendations:
    - Check token expiration before making API calls
    - Warn users about upcoming expiration
    - Prompt for re-authentication when expired

    Args:
        session: Session data dict

    Returns:
        True if valid, False otherwise
    """
    expires_at = session.get("expiresAt")
    if not expires_at:
        # No expiration, assume valid
        return True

    try:
        # Parse ISO 8601 timestamp
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)

        if expiry <= now:
            print_error(
                f"Session token has expired at {expires_at}\n"
                f"Please re-authenticate: python session_helper.py chatgpt"
            )
            return False

        # Warn if expiring soon (within 1 hour)
        time_left = expiry - now
        if time_left.total_seconds() < 3600:
            print_warning(
                f"Session token will expire in {int(time_left.total_seconds() / 60)} minutes"
            )

        # Info about remaining time
        hours_left = time_left.total_seconds() / 3600
        if hours_left > 1:
            print_info(f"Token valid for {hours_left:.1f} hours")

        return True

    except ValueError as e:
        print_warning(f"Could not parse expiration timestamp: {e}")
        return True  # Assume valid if can't parse


def get_access_token(session: dict) -> Optional[str]:
    """Extract access token from session data."""
    credentials = session.get("credentials", {})
    return credentials.get("accessToken")


def get_account_id(session: dict) -> Optional[str]:
    """
    Extract ChatGPT account ID from session data (for Codex API).

    The account_id can be in two places:
    1. credentials.accountId (if extracted during OAuth)
    2. Inside the access_token JWT claims (https://api.openai.com/auth.chatgpt_account_id)
    """
    import base64

    credentials = session.get("credentials", {})

    # First try the direct field
    account_id = credentials.get("accountId")
    if account_id:
        return account_id

    # Try to extract from access_token JWT
    access_token = credentials.get("accessToken")
    if access_token and access_token.count(".") == 2:
        try:
            payload_b64 = access_token.split(".")[1]
            # Add padding if needed
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding
            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            claims = json.loads(payload_bytes.decode("utf-8"))

            # Account ID is in https://api.openai.com/auth.chatgpt_account_id
            auth_claims = claims.get("https://api.openai.com/auth", {})
            account_id = auth_claims.get("chatgpt_account_id")
            if account_id:
                return account_id
        except Exception:
            pass

    return None


# ============================================================================
# Context-Aware Batching
# ============================================================================


def create_batches(
    cues: list[Cue],
    batch_size: int = DEFAULT_BATCH_SIZE,
    context_size: int = DEFAULT_CONTEXT_SIZE,
) -> list[TranslationBatch]:
    """
    Create translation batches with context.

    Args:
        cues: All cues to translate
        batch_size: Number of cues per batch
        context_size: Number of context cues before/after batch

    Returns:
        List of TranslationBatch objects
    """
    batches = []

    for i in range(0, len(cues), batch_size):
        batch_cues = cues[i : i + batch_size]

        # Get context cues
        prev_start = max(0, i - context_size)
        prev_context = cues[prev_start:i]

        next_end = min(len(cues), i + batch_size + context_size)
        next_context = cues[i + batch_size : next_end]

        batches.append(
            TranslationBatch(
                cues=batch_cues,
                prev_context=prev_context,
                next_context=next_context,
                start_index=i,
                end_index=i + len(batch_cues) - 1,
            )
        )

    return batches


def build_translation_prompt(
    batch: TranslationBatch,
    target_lang: str = DEFAULT_TARGET_LANG,
) -> str:
    """
    Build translation prompt with context.

    Args:
        batch: TranslationBatch object
        target_lang: Target language code

    Returns:
        Prompt string for AI
    """
    lang_names = {
        "zh-TW": "繁體中文",
        "zh-CN": "简体中文",
        "ja": "日本語",
        "ko": "한국어",
        "en": "English",
        "es": "Español",
        "fr": "Français",
        "de": "Deutsch",
    }
    target_lang_name = lang_names.get(target_lang, target_lang)

    prompt_parts = [
        f"你是專業的字幕翻譯員。請將以下字幕翻譯成{target_lang_name}。",
        "保持原意，語句通順自然，適合字幕閱讀。",
        "",
    ]

    # Add previous context
    if batch.prev_context:
        prompt_parts.append("【前文參考（不需翻譯）】")
        for cue in batch.prev_context:
            prompt_parts.append(f"- {cue.text}")
        prompt_parts.append("")

    # Add cues to translate
    prompt_parts.append("【需要翻譯的內容】")
    for i, cue in enumerate(batch.cues, 1):
        prompt_parts.append(f"{i}. {cue.text}")
    prompt_parts.append("")

    # Add following context
    if batch.next_context:
        prompt_parts.append("【後文參考（不需翻譯）】")
        for cue in batch.next_context:
            prompt_parts.append(f"- {cue.text}")
        prompt_parts.append("")

    # Add output format instructions
    prompt_parts.append("【輸出格式】")
    prompt_parts.append("請只輸出翻譯結果，每行一句，格式如下：")
    prompt_parts.append("1. [翻譯結果1]")
    prompt_parts.append("2. [翻譯結果2]")
    prompt_parts.append("...")

    return "\n".join(prompt_parts)


def parse_translation_response(
    response: str,
    expected_count: int,
) -> list[str]:
    """
    Parse AI response to extract translations.

    Args:
        response: AI response text
        expected_count: Expected number of translations

    Returns:
        List of translated strings
    """
    translations = []

    # Try to match numbered lines: "1. translation" or "1: translation"
    pattern = r"^\s*(\d+)\s*[.:\)]\s*(.+)$"

    for line in response.strip().split("\n"):
        match = re.match(pattern, line.strip())
        if match:
            num = int(match.group(1))
            text = match.group(2).strip()

            # Remove surrounding quotes if present
            if (text.startswith('"') and text.endswith('"')) or (
                text.startswith("'") and text.endswith("'")
            ):
                text = text[1:-1]

            # Ensure we add translations in order
            while len(translations) < num - 1:
                translations.append("")  # Placeholder for missing

            if len(translations) < num:
                translations.append(text)
            else:
                translations[num - 1] = text

    # Warn if count mismatch
    if len(translations) != expected_count:
        print_warning(
            f"Translation count mismatch: expected {expected_count}, got {len(translations)}"
        )

    # Pad with empty strings if needed
    while len(translations) < expected_count:
        translations.append("")

    return translations[:expected_count]


# ============================================================================
# Translation Provider
# ============================================================================


def translate_with_chatgpt(
    prompt: str,
    access_token: str,
    model: str = CHATGPT_MODEL,
    account_id: Optional[str] = None,
) -> Optional[str]:
    """
    Translate using OpenAI Codex API (subscription-based).

    This uses the Codex API endpoint discovered from OpenCode/codex-proxy:
    - Endpoint: chatgpt.com/backend-api/codex/responses
    - Uses OAuth token from session_helper.py
    - Requires ChatGPT-Account-Id header
    - Uses GPT-5 series models (gpt-5, gpt-5-codex, gpt-5-codex-mini, etc.)
    - Requires streaming=True and uses SSE format
    - Uses "instructions" + "input" format instead of "messages"

    See: auth_guide/OpenCode-Codex-API-Discovery.md
    Reference: https://github.com/dvcrn/codex-proxy

    Args:
        prompt: Translation prompt
        access_token: OAuth access token from session_helper.py
        model: Model ID (default: gpt-5-codex-mini)
        account_id: ChatGPT account ID (from id_token claims)

    Returns:
        Translated text or None on failure
    """
    # Codex API requires special format:
    # - "instructions" field (system prompt)
    # - "input" array with message objects
    # - "stream": True is REQUIRED
    payload = {
        "model": model,
        "instructions": "You are a professional subtitle translator. Translate accurately and naturally.",
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": prompt}],
            }
        ],
        "stream": True,
        "store": False,
    }

    # Build headers
    headers = [
        "-H",
        "Content-Type: application/json",
        "-H",
        f"Authorization: Bearer {access_token}",
        "-H",
        "Accept: text/event-stream",
    ]

    # Add account ID if available (required for Codex API)
    if account_id:
        headers.extend(["-H", f"ChatGPT-Account-Id: {account_id}"])

    try:
        result = subprocess.run(
            [
                "curl",
                "-s",
                "-N",  # Disable buffering for streaming
                "-X",
                "POST",
                CODEX_API_URL,
                *headers,
                "-d",
                json.dumps(payload),
            ],
            capture_output=True,
            text=True,
            timeout=120,  # Longer timeout for streaming
        )

        if result.returncode != 0:
            print_error(f"curl failed: {result.stderr}")
            return None

        # Parse SSE response and extract text content
        full_text = ""
        for line in result.stdout.split("\n"):
            if line.startswith("data: "):
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                    event_type = event.get("type", "")

                    # Handle different event types
                    if event_type == "response.output_text.delta":
                        # Main text content delta
                        full_text += event.get("delta", "")
                    elif event_type == "error":
                        # Error event
                        error_msg = event.get("message", str(event))
                        print_error(f"Codex API error: {error_msg}")
                        return None
                    # Ignore other event types (response.created, response.completed, etc.)

                except json.JSONDecodeError:
                    # Ignore malformed JSON lines
                    pass

        if full_text:
            return full_text.strip()

        # Check if the raw response contains an error
        if "detail" in result.stdout:
            try:
                # Try to parse as single JSON error response
                error_response = json.loads(result.stdout)
                detail = error_response.get("detail", "Unknown error")
                if "Instructions are required" in str(detail):
                    print_error(
                        "Codex API requires 'instructions' field. This is a bug."
                    )
                elif "Stream must be set to true" in str(detail):
                    print_error("Codex API requires streaming. This is a bug.")
                elif "not supported" in str(detail).lower():
                    print_error(
                        f"Model '{model}' not supported. Try: gpt-5, gpt-5-codex, gpt-5-codex-mini"
                    )
                else:
                    print_error(f"Codex API error: {detail}")
                return None
            except json.JSONDecodeError:
                pass

        print_error("Codex API returned empty response")
        return None

    except subprocess.TimeoutExpired:
        print_error("Codex API request timed out (120s limit)")
        return None
    except Exception as e:
        print_error(f"Codex API request failed: {e}")
        return None


def translate_batch_with_retry(
    batch: TranslationBatch,
    access_token: str,
    target_lang: str,
    account_id: Optional[str] = None,
) -> list[str]:
    """
    Translate a batch with retry logic using ChatGPT Codex API.

    Args:
        batch: TranslationBatch to translate
        access_token: OAuth access token
        target_lang: Target language code
        account_id: ChatGPT account ID (for Codex API)

    Returns:
        List of translations (may contain empty strings on failure)
    """
    prompt = build_translation_prompt(batch, target_lang)
    expected_count = len(batch.cues)

    for attempt in range(MAX_RETRIES):
        if attempt > 0:
            wait_time = RETRY_BACKOFF[min(attempt - 1, len(RETRY_BACKOFF) - 1)]
            print_warning(
                f"Retrying in {wait_time}s... (attempt {attempt + 1}/{MAX_RETRIES})"
            )
            time.sleep(wait_time)

        response = translate_with_chatgpt(prompt, access_token, account_id=account_id)

        if response:
            return parse_translation_response(response, expected_count)

    # All retries failed
    print_error(f"Failed to translate batch after {MAX_RETRIES} attempts")
    return [""] * expected_count


# ============================================================================
# CLI Commands
# ============================================================================


@click.group()
@click.version_option(version="1.0.0")
def cli() -> None:
    """
    SRT Translator CLI - Translate subtitle files using ChatGPT.

    Uses OAuth tokens from session_helper.py to authenticate with
    ChatGPT for high-quality, context-aware translation.

    Example workflow:
        1. python session_helper.py chatgpt  # Get OAuth token
        2. python srt_translator.py translate --input video.srt
    """
    pass


@cli.command()
@click.option(
    "-i",
    "--input",
    "input_file",
    type=click.Path(exists=True),
    required=True,
    help="Input SRT file path",
)
@click.option(
    "-o",
    "--output",
    "output_file",
    type=click.Path(),
    default=None,
    help="Output SRT file path (default: input_translated.srt)",
)
@click.option(
    "-l",
    "--target-lang",
    default=DEFAULT_TARGET_LANG,
    help=f"Target language code (default: {DEFAULT_TARGET_LANG})",
)
@click.option(
    "-b",
    "--batch-size",
    type=int,
    default=DEFAULT_BATCH_SIZE,
    help=f"Cues per batch (default: {DEFAULT_BATCH_SIZE})",
)
@click.option(
    "-c",
    "--context-size",
    type=int,
    default=DEFAULT_CONTEXT_SIZE,
    help=f"Context cues before/after batch (default: {DEFAULT_CONTEXT_SIZE})",
)
def translate(
    input_file: str,
    output_file: Optional[str],
    target_lang: str,
    batch_size: int,
    context_size: int,
) -> None:
    """Translate an SRT subtitle file using ChatGPT."""
    input_path = Path(input_file)

    # Generate output path if not specified
    if output_file is None:
        output_path = input_path.with_stem(f"{input_path.stem}_translated")
    else:
        output_path = Path(output_file)

    print_info(f"Input: {input_path}")
    print_info(f"Output: {output_path}")
    print_info(f"Target language: {target_lang}")
    print_info("")

    # Load ChatGPT session
    session = load_session()
    if not session:
        sys.exit(1)

    if not validate_session(session):
        sys.exit(1)

    access_token = get_access_token(session)
    if not access_token:
        print_error("No access token found in session file")
        sys.exit(1)

    # Get account_id for ChatGPT (required for Codex API)
    account_id = get_account_id(session)
    if account_id:
        print_info(f"Using Codex API with account: {account_id[:8]}...")
    else:
        print_warning(
            "No account_id found. Codex API may fail.\n"
            "Try re-authenticating: python session_helper.py chatgpt"
        )

    print_info("")

    # Parse input file
    print_info("Parsing SRT file...")
    try:
        content = input_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        # Try with latin-1 as fallback
        content = input_path.read_text(encoding="latin-1")

    cues = parse_srt(content)
    if not cues:
        print_error("No valid cues found in input file")
        sys.exit(1)

    print_info(f"Found {len(cues)} cues to translate")

    # Create batches
    batches = create_batches(cues, batch_size, context_size)
    total_batches = len(batches)
    print_info(f"Created {total_batches} batches")
    print_info("")

    # Translate batches with progress
    start_time = time.time()
    failed_batches = 0

    with click.progressbar(
        batches,
        label="Translating",
        show_pos=True,
        show_percent=True,
        show_eta=True,
    ) as progress_batches:
        for batch in progress_batches:
            translations = translate_batch_with_retry(
                batch, access_token, target_lang, account_id=account_id
            )

            # Apply translations to cues
            for i, translation in enumerate(translations):
                if translation:
                    batch.cues[i].translated_text = translation
                else:
                    batch.cues[i].translated_text = batch.cues[i].text
                    failed_batches += 1

            # Small delay to avoid rate limiting
            time.sleep(RATE_LIMIT_DELAY)

    elapsed = time.time() - start_time
    print_info("")

    # Generate output
    print_info("Generating output file...")
    output_content = generate_srt(cues, use_translated=True)
    output_path.write_text(output_content, encoding="utf-8")

    # Summary
    translated_count = sum(
        1 for c in cues if c.translated_text and c.translated_text != c.text
    )
    print_info("")
    print_success(f"Translation complete!")
    print_info(f"  Total cues: {len(cues)}")
    print_info(f"  Translated: {translated_count}")
    print_info(f"  Time: {elapsed:.1f}s")
    print_info(f"  Output: {output_path}")

    if failed_batches > 0:
        print_warning(f"  {failed_batches} cues failed and kept original text")


@cli.command()
def validate() -> None:
    """Validate ChatGPT session token."""
    print_info("Validating ChatGPT session...")

    session = load_session()
    if not session:
        sys.exit(1)

    if validate_session(session):
        expires_at = session.get("expiresAt", "Unknown")
        print_success("ChatGPT session is valid!")
        print_info(f"  Provider: {session.get('provider', 'Unknown')}")
        print_info(f"  Expires: {expires_at}")
        token = get_access_token(session)
        if token:
            print_info(f"  Token: {token[:20]}...")
    else:
        sys.exit(1)


if __name__ == "__main__":
    cli()
