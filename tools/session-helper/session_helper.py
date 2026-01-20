#!/usr/bin/env python3
"""
Session Helper CLI Tool

A helper tool to extract session tokens from Claude and ChatGPT for use
with the AI Subtitle Translator Chrome extension.

Based on the opencode OAuth flow implementation.

WARNING: This tool accesses third-party services. Using this tool may violate
the Terms of Service of Claude (Anthropic) or ChatGPT (OpenAI). Use at your
own risk.
"""

import base64
import hashlib
import http.server
import json
import secrets
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Thread
from typing import Optional

import click


# ============================================================================
# Constants
# ============================================================================

# Claude OAuth Configuration (from opencode-anthropic-auth)
# Uses Anthropic's official callback URL which displays the code for manual copy
#
# Key scopes:
# - org:create_api_key: Create API keys (for future use)
# - user:profile: Access user profile info
# - user:inference: Required for calling Claude API with OAuth token
#
# The OAuth token can be used with api.anthropic.com/v1/messages
# using Authorization: Bearer {access_token}
CLAUDE_OAUTH_CONFIG = {
    "clientId": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    "authorizationUrl": "https://claude.ai/oauth/authorize",
    "tokenUrl": "https://console.anthropic.com/v1/oauth/token",
    "scopes": ["org:create_api_key", "user:profile", "user:inference"],
    "redirectUri": "https://console.anthropic.com/oauth/code/callback",
}

# ChatGPT OAuth Configuration (from opencode-openai-codex-auth)
# Uses OpenAI Codex CLI's official OAuth flow with PKCE
CHATGPT_OAUTH_CONFIG = {
    "clientId": "app_EMoamEEZ73f0CkXaXp7hrann",
    # IMPORTANT: Must use /oauth/authorize (not just /authorize)
    "authorizationUrl": "https://auth.openai.com/oauth/authorize",
    "tokenUrl": "https://auth.openai.com/oauth/token",
    # Standard OpenID scopes - Codex CLI uses these, not api.model.read
    "scopes": "openid profile email offline_access",
    "redirectPort": 1455,
}

TOS_WARNING = """
================================================================================
                              IMPORTANT NOTICE
================================================================================

This tool extracts authentication tokens from Claude and ChatGPT web sessions.

By using this tool, you acknowledge that:

1. Using automated tools to access these services may violate their Terms of
   Service (ToS).

2. Your account may be suspended or terminated if detected.

3. The extracted tokens are sensitive credentials. Keep them secure and do not
   share them.

4. This tool is provided "AS IS" without warranty of any kind.

5. You are solely responsible for any consequences of using this tool.

================================================================================
"""

SUCCESS_HTML = """<!DOCTYPE html>
<html>
<head>
    <title>Authentication Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 3rem;
            border-radius: 1rem;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 400px;
        }
        h1 { color: #22c55e; margin-bottom: 1rem; }
        p { color: #666; line-height: 1.6; }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✓</div>
        <h1>Authentication Successful!</h1>
        <p>You can close this window and return to the terminal.</p>
        <p>The session token has been saved.</p>
    </div>
</body>
</html>
"""


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


def save_session_data(
    provider: str,
    credentials: dict,
    output_path: Path,
    expires_in_days: int = 7,
) -> None:
    """Save session data to a JSON file."""
    now = datetime.now(timezone.utc)

    # Use expiresAt from credentials if available
    if "expiresAt" in credentials:
        expires_at = credentials["expiresAt"]
    else:
        expires_at = (now + timedelta(days=expires_in_days)).isoformat()

    session_data = {
        "provider": provider,
        "timestamp": now.isoformat(),
        "credentials": credentials,
        "expiresAt": expires_at,
    }

    # If output_path is relative, make it relative to script directory
    if not output_path.is_absolute():
        output_path = get_script_dir() / output_path

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(session_data, f, indent=2, ensure_ascii=False)

    print_success(f"Session data saved to: {output_path}")
    print_info(f"Token expires at: {expires_at}")


def open_browser(url: str) -> bool:
    """Open URL in the default system browser."""
    try:
        # Try using webbrowser module first
        if webbrowser.open(url):
            return True
    except Exception:
        pass

    # Fallback to platform-specific commands
    try:
        if sys.platform == "darwin":
            subprocess.Popen(
                ["open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        elif sys.platform == "win32":
            subprocess.Popen(
                ["start", url],
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            subprocess.Popen(
                ["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        return True
    except Exception:
        return False


def is_port_available(port: int) -> bool:
    """Check if a port is available."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", port))
            return True
    except OSError:
        return False


# ============================================================================
# PKCE Implementation
# ============================================================================

ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"


def generate_random_string(length: int) -> str:
    """Generate a cryptographically random string."""
    return "".join(secrets.choice(ALLOWED_CHARS) for _ in range(length))


def sha256_base64url(input_str: str) -> str:
    """Compute SHA-256 hash and encode as base64url."""
    digest = hashlib.sha256(input_str.encode()).digest()
    base64_encoded = base64.b64encode(digest).decode()
    return base64_encoded.replace("+", "-").replace("/", "_").rstrip("=")


def generate_pkce_challenge() -> tuple[str, str]:
    """Generate PKCE code verifier and challenge."""
    code_verifier = generate_random_string(64)
    code_challenge = sha256_base64url(code_verifier)
    return code_verifier, code_challenge


# ============================================================================
# OAuth Callback Server
# ============================================================================


class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    """HTTP handler for OAuth callback."""

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass

    def do_GET(self):
        """Handle GET request (OAuth callback)."""
        parsed = urllib.parse.urlparse(self.path)

        # Only handle callback path
        if parsed.path != "/auth/callback" and parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return

        query_params = urllib.parse.parse_qs(parsed.query)

        # Store the callback data on the server instance
        self.server.callback_code = query_params.get("code", [None])[0]
        self.server.callback_state = query_params.get("state", [None])[0]
        self.server.callback_error = query_params.get("error", [None])[0]

        # Send response
        if self.server.callback_error:
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            html = f"""
            <html><body>
            <h1>Authentication Failed</h1>
            <p>Error: {self.server.callback_error}</p>
            <p>You can close this window.</p>
            </body></html>
            """
            self.wfile.write(html.encode())
        else:
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(SUCCESS_HTML.encode())

        self.server.callback_received = True


def create_oauth_server(port: int) -> http.server.HTTPServer:
    """Create an OAuth callback server."""
    server = http.server.HTTPServer(("127.0.0.1", port), OAuthCallbackHandler)
    server.callback_code = None
    server.callback_state = None
    server.callback_error = None
    server.callback_received = False
    return server


# ============================================================================
# Claude OAuth Flow (Manual Code Entry)
# ============================================================================


def claude_oauth_flow(timeout_seconds: int) -> Optional[dict]:
    """
    Perform Claude OAuth flow using system browser.
    Uses Anthropic's official callback URL which displays the code for manual copy.
    Based on opencode-anthropic-auth implementation.
    """
    config = CLAUDE_OAUTH_CONFIG
    redirect_uri = config["redirectUri"]

    # Generate PKCE challenge
    # Note: opencode uses verifier as state for simplicity
    code_verifier, code_challenge = generate_pkce_challenge()

    # Build authorization URL (matching opencode-anthropic-auth)
    params = {
        "code": "true",  # This tells the callback to display the code
        "client_id": config["clientId"],
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": " ".join(config["scopes"]),
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": code_verifier,  # opencode uses verifier as state
    }
    auth_url = f"{config['authorizationUrl']}?{urllib.parse.urlencode(params)}"

    print_info("Opening browser for Claude authentication...")
    print_info("")
    print_info("If browser doesn't open, please visit this URL manually:")
    click.echo(click.style(auth_url, fg="cyan"))
    print_info("")

    # Open browser
    if not open_browser(auth_url):
        print_warning(
            "Could not open browser automatically. Please open the URL above manually."
        )

    print_info("After authorizing, you will see a code on the page.")
    print_info("Please copy and paste the ENTIRE code here (format: CODE#STATE):")
    print_info("")

    # Get authorization code from user
    try:
        auth_input = click.prompt("Authorization code", type=str)
    except click.Abort:
        print_info("Operation cancelled.")
        return None

    if not auth_input:
        print_error("No authorization code provided.")
        return None

    # Parse the code (format: CODE#STATE or just CODE)
    if "#" in auth_input:
        code, state = auth_input.split("#", 1)
    else:
        code = auth_input
        state = None

    print_info("Exchanging authorization code for tokens...")

    # Exchange code for tokens using curl (to bypass Cloudflare blocking Python urllib)
    try:
        token_payload = {
            "code": code,
            "state": state,
            "grant_type": "authorization_code",
            "client_id": config["clientId"],
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        }

        # Use curl to bypass Cloudflare's Python blocking
        curl_result = subprocess.run(
            [
                "curl",
                "-s",
                "-X",
                "POST",
                config["tokenUrl"],
                "-H",
                "Content-Type: application/json",
                "-H",
                "Accept: application/json",
                "-d",
                json.dumps(token_payload),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if curl_result.returncode != 0:
            print_error(f"curl failed: {curl_result.stderr}")
            return None

        token_response = json.loads(curl_result.stdout)

        # Check for error response
        if "error" in token_response:
            error_msg = token_response.get("error", {})
            if isinstance(error_msg, dict):
                print_error(
                    f"Token exchange failed: {error_msg.get('message', error_msg)}"
                )
            else:
                print_error(f"Token exchange failed: {error_msg}")
            return None

        access_token = token_response.get("access_token")
        refresh_token = token_response.get("refresh_token")
        expires_in = token_response.get("expires_in")

        if not access_token:
            print_error("No access token in response.")
            return None

        result = {"accessToken": access_token}
        if refresh_token:
            result["refreshToken"] = refresh_token
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            result["expiresAt"] = expires_at.isoformat()

        return result

    except json.JSONDecodeError as e:
        print_error(f"Failed to parse token response: {e}")
        return None
    except subprocess.TimeoutExpired:
        print_error("Token exchange timed out.")
        return None
    except Exception as e:
        print_error(f"Token exchange failed: {e}")
        return None


# ============================================================================
# ChatGPT OAuth Flow
# ============================================================================


def chatgpt_oauth_flow(timeout_seconds: int) -> Optional[dict]:
    """
    Perform ChatGPT OAuth flow using system browser.
    Based on opencode-openai-codex-auth implementation.
    """
    config = CHATGPT_OAUTH_CONFIG
    port = config["redirectPort"]
    redirect_uri = f"http://localhost:{port}/auth/callback"

    # Check port availability
    if not is_port_available(port):
        print_error(
            f"Port {port} is already in use. Please close the application using it."
        )
        return None

    # Generate PKCE challenge
    code_verifier, code_challenge = generate_pkce_challenge()
    state = secrets.token_hex(16)

    # Build authorization URL (matching OpenAI Codex CLI)
    # These special parameters are required for the Codex CLI authentication flow
    params = {
        "response_type": "code",
        "client_id": config["clientId"],
        "redirect_uri": redirect_uri,
        "scope": config["scopes"],
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        # Codex CLI specific parameters - required for this client_id
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
        "originator": "codex_cli_rs",
    }
    auth_url = f"{config['authorizationUrl']}?{urllib.parse.urlencode(params)}"

    # Start callback server
    server = create_oauth_server(port)
    server.timeout = 1  # Set socket timeout for handle_request()

    print_info(f"Starting OAuth flow on port {port}...")
    print_info("Opening browser for authentication...")
    print_info("")
    print_info("If browser doesn't open, please visit this URL manually:")
    click.echo(click.style(auth_url, fg="cyan"))
    print_info("")

    # Open browser
    if not open_browser(auth_url):
        print_warning(
            "Could not open browser automatically. Please open the URL above manually."
        )

    # Wait for callback
    print_info(f"Waiting for authentication (timeout: {timeout_seconds}s)...")

    start_time = time.time()
    while not server.callback_received:
        if time.time() - start_time > timeout_seconds:
            server.server_close()
            print_error("Authentication timed out.")
            return None
        server.handle_request()  # This will timeout after 1 second

    server.server_close()

    if server.callback_error:
        print_error(f"Authentication failed: {server.callback_error}")
        return None

    if not server.callback_code:
        print_error("No authorization code received.")
        return None

    if server.callback_state != state:
        print_error("State mismatch - possible security issue.")
        return None

    print_info("Authorization code received. Exchanging for tokens...")

    # Exchange code for tokens using curl (to bypass potential Cloudflare blocking)
    try:
        token_data = urllib.parse.urlencode(
            {
                "grant_type": "authorization_code",
                "client_id": config["clientId"],
                "code": server.callback_code,
                "code_verifier": code_verifier,
                "redirect_uri": redirect_uri,
            }
        )

        # Use curl to make the request
        curl_result = subprocess.run(
            [
                "curl",
                "-s",
                "-X",
                "POST",
                config["tokenUrl"],
                "-H",
                "Content-Type: application/x-www-form-urlencoded",
                "-H",
                "Accept: application/json",
                "-d",
                token_data,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if curl_result.returncode != 0:
            print_error(f"curl failed: {curl_result.stderr}")
            return None

        token_response = json.loads(curl_result.stdout)

        # Check for error response
        if "error" in token_response:
            error_msg = token_response.get(
                "error_description", token_response.get("error")
            )
            print_error(f"Token exchange failed: {error_msg}")
            return None

        access_token = token_response.get("access_token")
        refresh_token = token_response.get("refresh_token")
        expires_in = token_response.get("expires_in")
        id_token = token_response.get("id_token")

        if not access_token:
            print_error("No access token in response.")
            return None

        result = {"accessToken": access_token}
        if refresh_token:
            result["refreshToken"] = refresh_token
        if expires_in:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            result["expiresAt"] = expires_at.isoformat()

        # Extract account_id from id_token (required for Codex API)
        # See: auth_guide/OpenCode-Codex-API-Discovery.md
        if id_token:
            try:
                # Decode JWT payload (without verification, just decode)
                payload_b64 = id_token.split(".")[1]
                # Add padding if needed
                padding = 4 - len(payload_b64) % 4
                if padding != 4:
                    payload_b64 += "=" * padding
                payload_bytes = base64.urlsafe_b64decode(payload_b64)
                claims = json.loads(payload_bytes.decode("utf-8"))

                # Extract chatgpt_account_id from claims
                account_id = claims.get("chatgpt_account_id")
                if account_id:
                    result["accountId"] = account_id
                    print_info(f"Extracted account ID: {account_id[:8]}...")
                else:
                    print_warning("No chatgpt_account_id found in id_token")
            except Exception as e:
                print_warning(f"Failed to parse id_token: {e}")

        return result

    except json.JSONDecodeError as e:
        print_error(f"Failed to parse token response: {e}")
        return None
    except subprocess.TimeoutExpired:
        print_error("Token exchange timed out.")
        return None
    except Exception as e:
        print_error(f"Token exchange failed: {e}")
        return None


# ============================================================================
# CLI Commands
# ============================================================================


@click.group()
@click.version_option(version="1.0.0")
def cli() -> None:
    """
    Session Helper CLI - Extract session tokens for AI services.

    Use this tool to authenticate with Claude or ChatGPT and extract
    session tokens for use with the AI Subtitle Translator extension.
    """
    pass


@cli.command()
@click.option(
    "-o",
    "--output",
    type=click.Path(),
    default="claude.session.json",
    help="Output file path (default: claude.session.json)",
)
@click.option(
    "-t",
    "--timeout",
    type=int,
    default=300,
    help="Login timeout in seconds (default: 300)",
)
@click.option(
    "-y",
    "--yes",
    is_flag=True,
    help="Skip ToS warning confirmation",
)
def claude(output: str, timeout: int, yes: bool) -> None:
    """Extract Claude OAuth access token using PKCE flow."""
    if not yes:
        click.echo(TOS_WARNING)
        if not click.confirm("Do you accept these terms and wish to continue?"):
            print_info("Operation cancelled.")
            sys.exit(0)

    output_path = Path(output)

    credentials = claude_oauth_flow(timeout)

    if credentials:
        save_session_data("claude-oauth", credentials, output_path)
        print_success("Claude OAuth token extracted successfully!")
        print_info(
            "\nNext steps:\n"
            "1. Open the AI Subtitle Translator extension options page\n"
            "2. Select 'Claude Pro (OAuth)' as the provider\n"
            f"3. Copy the accessToken from {output_path} and paste it\n"
            "4. Delete the session file after use for security"
        )
    else:
        print_error("Failed to extract Claude OAuth token.")
        sys.exit(1)


@cli.command()
@click.option(
    "-o",
    "--output",
    type=click.Path(),
    default="chatgpt.session.json",
    help="Output file path (default: chatgpt.session.json)",
)
@click.option(
    "-t",
    "--timeout",
    type=int,
    default=300,
    help="Login timeout in seconds (default: 300)",
)
@click.option(
    "-y",
    "--yes",
    is_flag=True,
    help="Skip ToS warning confirmation",
)
def chatgpt(output: str, timeout: int, yes: bool) -> None:
    """Extract ChatGPT OAuth access token using PKCE flow."""
    if not yes:
        click.echo(TOS_WARNING)
        if not click.confirm("Do you accept these terms and wish to continue?"):
            print_info("Operation cancelled.")
            sys.exit(0)

    output_path = Path(output)

    credentials = chatgpt_oauth_flow(timeout)

    if credentials:
        save_session_data("chatgpt-oauth", credentials, output_path)
        print_success("ChatGPT OAuth token extracted successfully!")
        print_info(
            "\nNext steps:\n"
            "1. Open the AI Subtitle Translator extension options page\n"
            "2. Select 'ChatGPT Subscription' as the provider\n"
            f"3. Copy the accessToken from {output_path} and paste it\n"
            "4. Delete the session file after use for security"
        )
    else:
        print_error("Failed to extract ChatGPT OAuth token.")
        sys.exit(1)


if __name__ == "__main__":
    cli()
