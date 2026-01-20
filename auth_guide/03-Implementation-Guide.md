# AI 訂閱帳號認證實作指南

> 本文件提供 Python 和 Chrome Extension 的完整實作範例。

---

## 目錄

1. [Python 實作](#1-python-實作)
   - [Claude OAuth Client](#11-claude-oauth-client)
   - [ChatGPT Codex Client](#12-chatgpt-codex-client)
   - [統一介面](#13-統一介面)
2. [Chrome Extension 實作](#2-chrome-extension-實作)
   - [認證管理器](#21-認證管理器)
   - [OAuth 流程處理](#22-oauth-流程處理)
   - [API 呼叫封裝](#23-api-呼叫封裝)
3. [瀏覽器自動化方案](#3-瀏覽器自動化方案)
4. [繞過 Cloudflare](#4-繞過-cloudflare)
5. [最佳實踐](#5-最佳實踐)

---

## 1. Python 實作

### 1.1 Claude OAuth Client

```python
# claude_oauth_client.py
"""
Claude Pro/Max 訂閱帳號 OAuth 認證客戶端
基於 opencode-anthropic-auth@0.0.9 插件
"""

import requests
import hashlib
import base64
import secrets
import json
import time
import webbrowser
from typing import Optional, Generator
from urllib.parse import urlencode


class ClaudeOAuthClient:
    """使用 Claude Pro/Max 訂閱帳號的 OAuth Token 呼叫 API"""

    # OAuth 配置
    CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    AUTH_URL = "https://claude.ai/oauth/authorize"
    TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
    REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback"
    
    # API 配置（注意 ?beta=true 參數）
    API_URL = "https://api.anthropic.com/v1/messages?beta=true"

    def __init__(self):
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.expires_at: int = 0

    # ========================================================================
    # PKCE 生成
    # ========================================================================
    
    def _generate_pkce(self) -> tuple[str, str]:
        """生成 PKCE code_verifier 和 code_challenge"""
        verifier = secrets.token_urlsafe(32)
        challenge = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(challenge).decode().rstrip('=')
        return verifier, challenge

    # ========================================================================
    # OAuth 流程
    # ========================================================================

    def get_auth_url(self) -> tuple[str, str]:
        """
        獲取授權 URL
        
        Returns:
            (auth_url, verifier): 授權 URL 和 PKCE verifier
        """
        verifier, challenge = self._generate_pkce()

        params = {
            "client_id": self.CLIENT_ID,
            "response_type": "code",
            "redirect_uri": self.REDIRECT_URI,
            "scope": "org:create_api_key user:profile user:inference",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": verifier,
            "code": "true"
        }

        url = f"{self.AUTH_URL}?{urlencode(params)}"
        return url, verifier

    def exchange_code(self, code: str, verifier: str) -> bool:
        """
        用授權碼交換 Token
        
        Args:
            code: 授權碼（格式：code#state）
            verifier: PKCE verifier
        """
        # 授權碼格式是 "code#state"
        splits = code.split("#")

        data = {
            "code": splits[0],
            "state": splits[1] if len(splits) > 1 else "",
            "grant_type": "authorization_code",
            "client_id": self.CLIENT_ID,
            "redirect_uri": self.REDIRECT_URI,
            "code_verifier": verifier
        }

        response = requests.post(
            self.TOKEN_URL,
            json=data,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code != 200:
            print(f"Token exchange failed: {response.status_code}")
            print(response.text)
            return False

        tokens = response.json()
        self.access_token = tokens.get("access_token")
        self.refresh_token = tokens.get("refresh_token")
        self.expires_at = int(time.time()) + tokens.get("expires_in", 3600)

        print("✅ Login successful!")
        return True

    def login_interactive(self) -> bool:
        """互動式登入（手動複製授權碼）"""
        auth_url, verifier = self.get_auth_url()

        print(f"\n📋 請在瀏覽器中開啟以下 URL：")
        print(f"\n{auth_url}\n")

        try:
            webbrowser.open(auth_url)
            print("🌐 已嘗試自動開啟瀏覽器...")
        except Exception:
            pass

        print("登入後，複製頁面顯示的授權碼（格式：xxxxx#xxxxx）")
        code = input("請貼上授權碼: ").strip()

        return self.exchange_code(code, verifier)

    # ========================================================================
    # Token 管理
    # ========================================================================

    def _refresh_access_token(self) -> bool:
        """刷新 Access Token"""
        if not self.refresh_token:
            return False

        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
            "client_id": self.CLIENT_ID
        }

        response = requests.post(
            self.TOKEN_URL,
            json=data,
            headers={"Content-Type": "application/json"}
        )

        if response.status_code != 200:
            print(f"Token refresh failed: {response.status_code}")
            return False

        tokens = response.json()
        self.access_token = tokens.get("access_token")
        self.expires_at = int(time.time()) + tokens.get("expires_in", 3600)

        if "refresh_token" in tokens:
            self.refresh_token = tokens["refresh_token"]

        print("🔄 Token refreshed!")
        return True

    def _ensure_valid_token(self) -> bool:
        """確保 Token 有效（提前 5 分鐘刷新）"""
        if not self.access_token:
            return False

        if time.time() > self.expires_at - 300:
            return self._refresh_access_token()

        return True

    # ========================================================================
    # API 請求
    # ========================================================================

    def _get_headers(self) -> dict:
        """獲取 API 請求需要的 Headers"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14",
            "anthropic-version": "2023-06-01",
            "user-agent": "claude-cli/2.1.2 (external, cli)"
        }

    def _prepare_body(
        self,
        messages: list,
        model: str,
        system: str = None,
        tools: list = None,
        stream: bool = False
    ) -> dict:
        """
        準備請求 body
        
        注意：
        1. 系統提示不能包含 "OpenCode" 字樣
        2. 工具名稱需要加上 "mcp_" 前綴
        """
        body = {
            "model": model,
            "max_tokens": 8192,
            "messages": messages,
            "stream": stream
        }

        # 處理系統提示（替換 OpenCode 字樣）
        if system:
            system = system.replace("OpenCode", "Claude Code").replace("opencode", "Claude")
            body["system"] = system

        # 處理工具（需要加 mcp_ 前綴）
        if tools:
            body["tools"] = [
                {**tool, "name": f"mcp_{tool['name']}"}
                for tool in tools
            ]

        return body

    # ========================================================================
    # 公開 API
    # ========================================================================

    def chat(
        self,
        message: str,
        model: str = "claude-sonnet-4-20250514",
        system: str = None
    ) -> str:
        """
        發送訊息並獲取回應
        
        Args:
            message: 用戶訊息
            model: 模型名稱
            system: 系統提示（可選）
        
        Returns:
            AI 回應文字
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        body = self._prepare_body(messages, model, system, stream=False)

        response = requests.post(self.API_URL, headers=headers, json=body)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")

        data = response.json()

        # 提取回應文字
        content = data.get("content", [])
        for block in content:
            if block.get("type") == "text":
                return block.get("text", "")

        return ""

    def stream_chat(
        self,
        message: str,
        model: str = "claude-sonnet-4-20250514",
        system: str = None
    ) -> Generator[str, None, None]:
        """
        串流發送訊息
        
        Args:
            message: 用戶訊息
            model: 模型名稱
            system: 系統提示（可選）
        
        Yields:
            回應文字片段
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        body = self._prepare_body(messages, model, system, stream=True)

        response = requests.post(self.API_URL, headers=headers, json=body, stream=True)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code}")

        for line in response.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        event_type = data.get("type")

                        if event_type == "content_block_delta":
                            delta = data.get("delta", {})
                            if delta.get("type") == "text_delta":
                                text = delta.get("text", "")
                                # 移除工具名稱前綴（如果有）
                                text = text.replace('"name": "mcp_', '"name": "')
                                yield text
                    except json.JSONDecodeError:
                        pass

    def chat_with_tools(
        self,
        message: str,
        tools: list,
        model: str = "claude-sonnet-4-20250514"
    ) -> dict:
        """
        帶工具的對話
        
        Args:
            message: 用戶訊息
            tools: 工具列表
            model: 模型名稱
        
        Returns:
            完整的 API 回應
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        body = self._prepare_body(messages, model, tools=tools, stream=False)

        response = requests.post(self.API_URL, headers=headers, json=body)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")

        data = response.json()

        # 移除工具名稱前綴
        if "content" in data:
            for block in data["content"]:
                if block.get("type") == "tool_use" and block.get("name", "").startswith("mcp_"):
                    block["name"] = block["name"][4:]

        return data

    # ========================================================================
    # Token 持久化
    # ========================================================================

    def save_tokens(self, filepath: str = "claude_oauth_tokens.json"):
        """保存 Token 到檔案"""
        data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"💾 Tokens saved to {filepath}")

    def load_tokens(self, filepath: str = "claude_oauth_tokens.json") -> bool:
        """從檔案載入 Token"""
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            self.expires_at = data.get("expires_at", 0)

            if self._ensure_valid_token():
                print("✅ Tokens loaded and valid!")
                return True
            else:
                print("❌ Tokens expired and refresh failed.")
                return False
        except FileNotFoundError:
            return False
        except Exception as e:
            print(f"❌ Failed to load tokens: {e}")
            return False


# ============================================================================
# 使用範例
# ============================================================================

if __name__ == "__main__":
    client = ClaudeOAuthClient()

    # 嘗試載入已保存的 Token
    if not client.load_tokens():
        print("\n🔐 需要登入 Claude 帳號")
        if not client.login_interactive():
            print("❌ Login failed!")
            exit(1)
        client.save_tokens()

    # 測試簡單對話
    print("\n" + "=" * 50)
    print("📝 簡單對話測試")
    print("=" * 50)

    try:
        response = client.chat("你好！請用一句話介紹你自己。")
        print(f"\n🤖 Claude: {response}")
    except Exception as e:
        print(f"❌ Error: {e}")

    # 測試串流對話
    print("\n" + "=" * 50)
    print("📝 串流對話測試")
    print("=" * 50)

    try:
        print("\n🤖 Claude: ", end="", flush=True)
        for chunk in client.stream_chat("寫一首關於程式設計的俳句。"):
            print(chunk, end="", flush=True)
        print()
    except Exception as e:
        print(f"❌ Error: {e}")
```

---

### 1.2 ChatGPT Codex Client

```python
# chatgpt_codex_client.py
"""
ChatGPT Plus/Pro 訂閱帳號 Codex API 客戶端
基於 OpenCode 二進制分析
"""

import requests
import hashlib
import base64
import secrets
import json
import time
import webbrowser
from typing import Optional, Generator
from urllib.parse import urlencode, parse_qs, urlparse
from http.server import HTTPServer, BaseHTTPRequestHandler


class ChatGPTCodexClient:
    """使用 ChatGPT Plus/Pro 訂閱帳號的 Codex API"""

    # OAuth 配置
    CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
    ISSUER = "https://auth.openai.com"
    CALLBACK_PORT = 1455
    
    # API 配置（注意：不是標準 OpenAI API）
    CODEX_API = "https://chatgpt.com/backend-api/codex/responses"

    def __init__(self):
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.account_id: Optional[str] = None
        self.expires_at: int = 0

    # ========================================================================
    # PKCE 生成
    # ========================================================================

    def _generate_pkce(self) -> tuple[str, str]:
        """生成 PKCE code_verifier 和 code_challenge"""
        verifier = secrets.token_urlsafe(32)
        challenge = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(challenge).decode().rstrip('=')
        return verifier, challenge

    def _generate_state(self) -> str:
        """生成隨機 state"""
        return secrets.token_urlsafe(16)

    # ========================================================================
    # OAuth 流程
    # ========================================================================

    def login(self) -> bool:
        """
        啟動 OAuth 登入流程
        會開啟瀏覽器並啟動本地伺服器接收回調
        """
        verifier, challenge = self._generate_pkce()
        state = self._generate_state()

        # 構建授權 URL
        auth_params = {
            "client_id": self.CLIENT_ID,
            "redirect_uri": f"http://localhost:{self.CALLBACK_PORT}/callback",
            "response_type": "code",
            "scope": "openid email profile offline_access",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
            "originator": "opencode"
        }

        auth_url = f"{self.ISSUER}/oauth/authorize?{urlencode(auth_params)}"

        # 存儲回調結果
        received = {"code": None, "state": None}

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(handler_self):
                parsed = urlparse(handler_self.path)
                if parsed.path == "/callback":
                    params = parse_qs(parsed.query)
                    received["code"] = params.get("code", [None])[0]
                    received["state"] = params.get("state", [None])[0]

                    handler_self.send_response(200)
                    handler_self.send_header("Content-type", "text/html; charset=utf-8")
                    handler_self.end_headers()
                    handler_self.wfile.write("""
                        <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
                        <h1>✅ 授權成功！</h1>
                        <p>你可以關閉此視窗了。</p>
                        </body></html>
                    """.encode('utf-8'))

            def log_message(handler_self, format, *args):
                pass  # 禁止日誌輸出

        # 啟動伺服器
        server = HTTPServer(("localhost", self.CALLBACK_PORT), CallbackHandler)
        server.timeout = 120  # 2 分鐘超時

        print(f"🌐 正在開啟瀏覽器...")
        webbrowser.open(auth_url)

        print("⏳ 等待授權...")
        server.handle_request()
        server.server_close()

        # 驗證 state
        if received["state"] != state:
            print("❌ State mismatch! Possible CSRF attack.")
            return False

        if not received["code"]:
            print("❌ No authorization code received.")
            return False

        # 交換 Token
        return self._exchange_token(received["code"], verifier)

    def _exchange_token(self, code: str, verifier: str) -> bool:
        """用授權碼交換 Token"""
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": f"http://localhost:{self.CALLBACK_PORT}/callback",
            "client_id": self.CLIENT_ID,
            "code_verifier": verifier
        }

        response = requests.post(
            f"{self.ISSUER}/oauth/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if response.status_code != 200:
            print(f"❌ Token exchange failed: {response.status_code}")
            print(response.text)
            return False

        tokens = response.json()
        self.access_token = tokens.get("access_token")
        self.refresh_token = tokens.get("refresh_token")
        self.expires_at = int(time.time()) + tokens.get("expires_in", 3600)

        # 從 id_token 提取 account_id
        id_token = tokens.get("id_token", "")
        if id_token:
            try:
                payload = id_token.split(".")[1]
                payload += "=" * (4 - len(payload) % 4)
                decoded = base64.urlsafe_b64decode(payload)
                claims = json.loads(decoded)
                self.account_id = claims.get("chatgpt_account_id")
            except Exception as e:
                print(f"⚠️ Failed to parse id_token: {e}")

        print("✅ Login successful!")
        return True

    # ========================================================================
    # Token 管理
    # ========================================================================

    def _refresh_access_token(self) -> bool:
        """刷新 Access Token"""
        if not self.refresh_token:
            return False

        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
            "client_id": self.CLIENT_ID
        }

        response = requests.post(
            f"{self.ISSUER}/oauth/token",
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if response.status_code != 200:
            print(f"❌ Token refresh failed: {response.status_code}")
            return False

        tokens = response.json()
        self.access_token = tokens.get("access_token")
        self.expires_at = int(time.time()) + tokens.get("expires_in", 3600)

        if "refresh_token" in tokens:
            self.refresh_token = tokens["refresh_token"]

        print("🔄 Token refreshed!")
        return True

    def _ensure_valid_token(self) -> bool:
        """確保 Token 有效"""
        if not self.access_token:
            return False

        if time.time() > self.expires_at - 300:
            return self._refresh_access_token()

        return True

    # ========================================================================
    # API 請求
    # ========================================================================

    def _get_headers(self) -> dict:
        """獲取 API 請求需要的 Headers"""
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        if self.account_id:
            headers["ChatGPT-Account-Id"] = self.account_id
        return headers

    def _build_payload(
        self,
        messages: list,
        model: str,
        instructions: str = None
    ) -> dict:
        """
        構建 Codex API 請求 payload
        
        注意：Codex API 格式與標準 OpenAI API 不同
        """
        # 轉換訊息格式
        input_messages = []
        for msg in messages:
            content_type = "input_text" if msg["role"] == "user" else "output_text"
            input_messages.append({
                "type": "message",
                "role": msg["role"],
                "content": [{"type": content_type, "text": msg["content"]}]
            })

        payload = {
            "model": model,
            "instructions": instructions or "You are a helpful assistant.",
            "input": input_messages,
            "stream": True,  # Codex API 必須使用串流
            "store": False
        }

        return payload

    # ========================================================================
    # 公開 API
    # ========================================================================

    def chat(
        self,
        message: str,
        model: str = "gpt-5-codex-mini",
        instructions: str = None
    ) -> str:
        """
        發送訊息並獲取回應
        
        Args:
            message: 用戶訊息
            model: 模型名稱（必須是 GPT-5 系列）
            instructions: 系統指令（可選）
        
        Returns:
            AI 回應文字
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        payload = self._build_payload(messages, model, instructions)

        response = requests.post(
            self.CODEX_API,
            headers=headers,
            json=payload,
            stream=True
        )

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")

        # 解析 SSE 回應
        full_response = ""
        for line in response.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        if data.get("type") == "response.output_text.delta":
                            full_response += data.get("delta", "")
                    except json.JSONDecodeError:
                        pass

        return full_response

    def stream_chat(
        self,
        message: str,
        model: str = "gpt-5-codex-mini",
        instructions: str = None
    ) -> Generator[str, None, None]:
        """
        串流發送訊息
        
        Args:
            message: 用戶訊息
            model: 模型名稱
            instructions: 系統指令（可選）
        
        Yields:
            回應文字片段
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        headers = self._get_headers()
        payload = self._build_payload(messages, model, instructions)

        response = requests.post(
            self.CODEX_API,
            headers=headers,
            json=payload,
            stream=True
        )

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code}")

        for line in response.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        if data.get("type") == "response.output_text.delta":
                            yield data.get("delta", "")
                    except json.JSONDecodeError:
                        pass

    # ========================================================================
    # Token 持久化
    # ========================================================================

    def save_tokens(self, filepath: str = "chatgpt_codex_tokens.json"):
        """保存 Token 到檔案"""
        data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "account_id": self.account_id,
            "expires_at": self.expires_at
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"💾 Tokens saved to {filepath}")

    def load_tokens(self, filepath: str = "chatgpt_codex_tokens.json") -> bool:
        """從檔案載入 Token"""
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            self.account_id = data.get("account_id")
            self.expires_at = data.get("expires_at", 0)

            if self._ensure_valid_token():
                print("✅ Tokens loaded and valid!")
                return True
            else:
                print("❌ Tokens expired and refresh failed.")
                return False
        except FileNotFoundError:
            return False
        except Exception as e:
            print(f"❌ Failed to load tokens: {e}")
            return False


# ============================================================================
# 使用範例
# ============================================================================

if __name__ == "__main__":
    client = ChatGPTCodexClient()

    # 嘗試載入已保存的 Token
    if not client.load_tokens():
        print("\n🔐 需要登入 ChatGPT 帳號")
        if not client.login():
            print("❌ Login failed!")
            exit(1)
        client.save_tokens()

    # 測試簡單對話
    print("\n" + "=" * 50)
    print("📝 簡單對話測試")
    print("=" * 50)

    try:
        response = client.chat("Hello! Please introduce yourself briefly.")
        print(f"\n🤖 ChatGPT: {response}")
    except Exception as e:
        print(f"❌ Error: {e}")

    # 測試串流對話
    print("\n" + "=" * 50)
    print("📝 串流對話測試")
    print("=" * 50)

    try:
        print("\n🤖 ChatGPT: ", end="", flush=True)
        for chunk in client.stream_chat("Write a haiku about coding."):
            print(chunk, end="", flush=True)
        print()
    except Exception as e:
        print(f"❌ Error: {e}")
```

---

### 1.3 統一介面

```python
# unified_ai_client.py
"""
統一的 AI 客戶端介面
支援 Claude 和 ChatGPT 訂閱帳號
"""

from abc import ABC, abstractmethod
from typing import Generator, Optional
from claude_oauth_client import ClaudeOAuthClient
from chatgpt_codex_client import ChatGPTCodexClient


class AIProvider(ABC):
    """AI Provider 抽象基類"""
    
    @abstractmethod
    def chat(self, message: str, **kwargs) -> str:
        pass
    
    @abstractmethod
    def stream_chat(self, message: str, **kwargs) -> Generator[str, None, None]:
        pass
    
    @abstractmethod
    def login(self) -> bool:
        pass
    
    @abstractmethod
    def is_logged_in(self) -> bool:
        pass


class ClaudeProvider(AIProvider):
    """Claude Provider 實作"""
    
    def __init__(self):
        self.client = ClaudeOAuthClient()
    
    def chat(self, message: str, **kwargs) -> str:
        model = kwargs.get("model", "claude-sonnet-4-20250514")
        system = kwargs.get("system")
        return self.client.chat(message, model=model, system=system)
    
    def stream_chat(self, message: str, **kwargs) -> Generator[str, None, None]:
        model = kwargs.get("model", "claude-sonnet-4-20250514")
        system = kwargs.get("system")
        return self.client.stream_chat(message, model=model, system=system)
    
    def login(self) -> bool:
        if self.client.load_tokens():
            return True
        if self.client.login_interactive():
            self.client.save_tokens()
            return True
        return False
    
    def is_logged_in(self) -> bool:
        return self.client._ensure_valid_token()


class ChatGPTProvider(AIProvider):
    """ChatGPT Provider 實作"""
    
    def __init__(self):
        self.client = ChatGPTCodexClient()
    
    def chat(self, message: str, **kwargs) -> str:
        model = kwargs.get("model", "gpt-5-codex-mini")
        instructions = kwargs.get("instructions") or kwargs.get("system")
        return self.client.chat(message, model=model, instructions=instructions)
    
    def stream_chat(self, message: str, **kwargs) -> Generator[str, None, None]:
        model = kwargs.get("model", "gpt-5-codex-mini")
        instructions = kwargs.get("instructions") or kwargs.get("system")
        return self.client.stream_chat(message, model=model, instructions=instructions)
    
    def login(self) -> bool:
        if self.client.load_tokens():
            return True
        if self.client.login():
            self.client.save_tokens()
            return True
        return False
    
    def is_logged_in(self) -> bool:
        return self.client._ensure_valid_token()


class UnifiedAIClient:
    """統一的 AI 客戶端"""
    
    def __init__(self):
        self.providers: dict[str, AIProvider] = {
            "claude": ClaudeProvider(),
            "chatgpt": ChatGPTProvider()
        }
        self.default_provider = "claude"
    
    def login(self, provider: str = None) -> bool:
        """登入指定的 Provider"""
        provider = provider or self.default_provider
        if provider not in self.providers:
            raise ValueError(f"Unknown provider: {provider}")
        return self.providers[provider].login()
    
    def login_all(self) -> dict[str, bool]:
        """登入所有 Provider"""
        results = {}
        for name, provider in self.providers.items():
            try:
                results[name] = provider.login()
            except Exception as e:
                print(f"❌ Failed to login {name}: {e}")
                results[name] = False
        return results
    
    def chat(
        self,
        message: str,
        provider: str = None,
        **kwargs
    ) -> str:
        """發送訊息"""
        provider = provider or self.default_provider
        if provider not in self.providers:
            raise ValueError(f"Unknown provider: {provider}")
        return self.providers[provider].chat(message, **kwargs)
    
    def stream_chat(
        self,
        message: str,
        provider: str = None,
        **kwargs
    ) -> Generator[str, None, None]:
        """串流發送訊息"""
        provider = provider or self.default_provider
        if provider not in self.providers:
            raise ValueError(f"Unknown provider: {provider}")
        return self.providers[provider].stream_chat(message, **kwargs)
    
    def compare(self, message: str, **kwargs) -> dict[str, str]:
        """
        向所有 Provider 發送相同訊息並比較結果
        """
        results = {}
        for name, provider in self.providers.items():
            if provider.is_logged_in():
                try:
                    results[name] = provider.chat(message, **kwargs)
                except Exception as e:
                    results[name] = f"Error: {e}"
            else:
                results[name] = "Not logged in"
        return results


# ============================================================================
# 使用範例
# ============================================================================

if __name__ == "__main__":
    client = UnifiedAIClient()
    
    # 登入所有 Provider
    print("🔐 Logging in to all providers...")
    login_results = client.login_all()
    for provider, success in login_results.items():
        status = "✅" if success else "❌"
        print(f"  {status} {provider}")
    
    # 使用預設 Provider（Claude）
    print("\n📝 Using default provider (Claude):")
    try:
        response = client.chat("What is 2+2?")
        print(f"Response: {response}")
    except Exception as e:
        print(f"Error: {e}")
    
    # 使用指定 Provider（ChatGPT）
    print("\n📝 Using ChatGPT:")
    try:
        response = client.chat("What is 2+2?", provider="chatgpt")
        print(f"Response: {response}")
    except Exception as e:
        print(f"Error: {e}")
    
    # 比較兩者回應
    print("\n📝 Comparing responses:")
    try:
        results = client.compare("Explain what AI is in one sentence.")
        for provider, response in results.items():
            print(f"\n{provider}:")
            print(f"  {response}")
    except Exception as e:
        print(f"Error: {e}")
```

---

## 2. Chrome Extension 實作

### 2.1 認證管理器

```javascript
// auth-manager.js
/**
 * Chrome Extension 認證管理器
 * 使用 chrome.storage.local 儲存認證資訊
 */

class ExtensionAuthManager {
    constructor() {
        this.STORAGE_KEY = 'ai_auth';
    }

    // ========================================================================
    // 儲存與載入
    // ========================================================================

    async saveAuth(providerId, auth) {
        const allAuth = await this.loadAllAuth();
        allAuth[providerId] = {
            ...auth,
            savedAt: Date.now()
        };
        await chrome.storage.local.set({ [this.STORAGE_KEY]: allAuth });
    }

    async loadAuth(providerId) {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY]?.[providerId] || null;
    }

    async loadAllAuth() {
        const result = await chrome.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || {};
    }

    async clearAuth(providerId) {
        const allAuth = await this.loadAllAuth();
        delete allAuth[providerId];
        await chrome.storage.local.set({ [this.STORAGE_KEY]: allAuth });
    }

    // ========================================================================
    // Token 驗證與刷新
    // ========================================================================

    isTokenExpired(auth) {
        if (auth.type !== 'oauth') return false;
        const buffer = 5 * 60 * 1000; // 5 分鐘緩衝
        return Date.now() > (auth.expires - buffer);
    }

    async refreshClaudeToken(auth) {
        const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                refresh_token: auth.refresh,
                client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
            })
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const tokens = await response.json();
        return {
            type: 'oauth',
            access: tokens.access_token,
            refresh: tokens.refresh_token || auth.refresh,
            expires: Date.now() + tokens.expires_in * 1000
        };
    }

    async refreshChatGPTToken(auth) {
        const response = await fetch('https://auth.openai.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: auth.refresh,
                client_id: 'app_EMoamEEZ73f0CkXaXp7hrann'
            })
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const tokens = await response.json();
        return {
            type: 'oauth',
            access: tokens.access_token,
            refresh: tokens.refresh_token || auth.refresh,
            expires: Date.now() + tokens.expires_in * 1000,
            accountId: auth.accountId
        };
    }

    async getValidAuth(providerId) {
        let auth = await this.loadAuth(providerId);

        if (!auth) {
            throw new Error('Not logged in');
        }

        if (auth.type === 'oauth' && this.isTokenExpired(auth)) {
            try {
                if (providerId === 'claude') {
                    auth = await this.refreshClaudeToken(auth);
                } else if (providerId === 'chatgpt') {
                    auth = await this.refreshChatGPTToken(auth);
                }
                await this.saveAuth(providerId, auth);
            } catch (error) {
                await this.clearAuth(providerId);
                throw new Error('Token expired, please login again');
            }
        }

        return auth;
    }
}

// 全域實例
const authManager = new ExtensionAuthManager();
```

### 2.2 OAuth 流程處理

```javascript
// oauth-handler.js
/**
 * Chrome Extension OAuth 流程處理
 * 使用 chrome.identity API
 */

class OAuthHandler {
    // ========================================================================
    // PKCE 生成
    // ========================================================================

    async generatePKCE() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        const verifier = this.base64URLEncode(array);

        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await crypto.subtle.digest('SHA-256', data);
        const challenge = this.base64URLEncode(new Uint8Array(hash));

        return { verifier, challenge };
    }

    base64URLEncode(buffer) {
        return btoa(String.fromCharCode(...buffer))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    // ========================================================================
    // Claude OAuth
    // ========================================================================

    async loginClaude() {
        const { verifier, challenge } = await this.generatePKCE();

        const params = new URLSearchParams({
            client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
            response_type: 'code',
            redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
            scope: 'org:create_api_key user:profile user:inference',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state: verifier,
            code: 'true'
        });

        const authUrl = `https://claude.ai/oauth/authorize?${params}`;

        // 開啟新分頁讓使用者授權
        const tab = await chrome.tabs.create({ url: authUrl });

        // 顯示指示
        return new Promise((resolve) => {
            // 使用者需要手動複製授權碼
            // 可以透過 popup 或 options 頁面提供輸入框
            chrome.runtime.onMessage.addListener(async function handler(message) {
                if (message.type === 'CLAUDE_AUTH_CODE') {
                    chrome.runtime.onMessage.removeListener(handler);
                    
                    try {
                        const auth = await this.exchangeClaudeCode(message.code, verifier);
                        await authManager.saveAuth('claude', auth);
                        resolve(true);
                    } catch (error) {
                        console.error('Claude auth failed:', error);
                        resolve(false);
                    }
                }
            }.bind(this));
        });
    }

    async exchangeClaudeCode(code, verifier) {
        const [authCode, state] = code.split('#');

        const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: authCode,
                state: state || '',
                grant_type: 'authorization_code',
                client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
                redirect_uri: 'https://console.anthropic.com/oauth/code/callback',
                code_verifier: verifier
            })
        });

        if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.status}`);
        }

        const tokens = await response.json();
        return {
            type: 'oauth',
            access: tokens.access_token,
            refresh: tokens.refresh_token,
            expires: Date.now() + tokens.expires_in * 1000
        };
    }

    // ========================================================================
    // ChatGPT OAuth（需要本地伺服器，Extension 較難實作）
    // ========================================================================

    // ChatGPT OAuth 需要本地伺服器接收回調
    // 在 Extension 中建議使用 Native Messaging 或 Backend Proxy
}

const oauthHandler = new OAuthHandler();
```

### 2.3 API 呼叫封裝

```javascript
// api-client.js
/**
 * AI API 呼叫封裝
 */

class AIAPIClient {
    // ========================================================================
    // Claude API
    // ========================================================================

    async callClaudeAPI(message, options = {}) {
        const auth = await authManager.getValidAuth('claude');
        
        const { model = 'claude-sonnet-4-20250514', system } = options;

        const body = {
            model,
            max_tokens: 8192,
            messages: [{ role: 'user', content: message }],
            stream: false
        };

        if (system) {
            // 替換 OpenCode 字樣
            body.system = system
                .replace(/OpenCode/g, 'Claude Code')
                .replace(/opencode/gi, 'Claude');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages?beta=true', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.access}`,
                'Content-Type': 'application/json',
                'anthropic-beta': 'oauth-2025-04-20,interleaved-thinking-2025-05-14',
                'anthropic-version': '2023-06-01',
                'user-agent': 'claude-cli/2.1.2 (external, cli)'
            },
            body: JSON.stringify(body)
        });

        if (response.status === 401) {
            await authManager.clearAuth('claude');
            throw new Error('Authentication failed, please login again');
        }

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return data.content?.[0]?.text || '';
    }

    async *streamClaudeAPI(message, options = {}) {
        const auth = await authManager.getValidAuth('claude');
        
        const { model = 'claude-sonnet-4-20250514', system } = options;

        const body = {
            model,
            max_tokens: 8192,
            messages: [{ role: 'user', content: message }],
            stream: true
        };

        if (system) {
            body.system = system
                .replace(/OpenCode/g, 'Claude Code')
                .replace(/opencode/gi, 'Claude');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages?beta=true', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${auth.access}`,
                'Content-Type': 'application/json',
                'anthropic-beta': 'oauth-2025-04-20,interleaved-thinking-2025-05-14',
                'anthropic-version': '2023-06-01',
                'user-agent': 'claude-cli/2.1.2 (external, cli)'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content_block_delta') {
                            const text = data.delta?.text || '';
                            if (text) yield text;
                        }
                    } catch (e) {
                        // 忽略解析錯誤
                    }
                }
            }
        }
    }

    // ========================================================================
    // ChatGPT Codex API
    // ========================================================================

    async callChatGPTAPI(message, options = {}) {
        const auth = await authManager.getValidAuth('chatgpt');
        
        const { model = 'gpt-5-codex-mini', instructions } = options;

        const headers = {
            'Authorization': `Bearer ${auth.access}`,
            'Content-Type': 'application/json'
        };

        if (auth.accountId) {
            headers['ChatGPT-Account-Id'] = auth.accountId;
        }

        const body = {
            model,
            instructions: instructions || 'You are a helpful assistant.',
            input: [{
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: message }]
            }],
            stream: true,
            store: false
        };

        const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        // 解析串流回應
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'response.output_text.delta') {
                            fullResponse += data.delta || '';
                        }
                    } catch (e) {
                        // 忽略解析錯誤
                    }
                }
            }
        }

        return fullResponse;
    }
}

const apiClient = new AIAPIClient();
```

---

## 3. 瀏覽器自動化方案

### 3.1 使用 Playwright

```python
# browser_automation.py
"""
使用 Playwright 進行瀏覽器自動化
可完全繞過 Cloudflare
"""

import asyncio
from playwright.async_api import async_playwright, Page


class ClaudeBrowserClient:
    """使用瀏覽器自動化操作 Claude"""

    def __init__(self):
        self.browser = None
        self.page: Page = None
        self.playwright = None

    async def start(self, headless: bool = False, user_data_dir: str = None):
        """
        啟動瀏覽器
        
        Args:
            headless: 是否無頭模式
            user_data_dir: 使用者資料目錄（保留登入狀態）
        """
        self.playwright = await async_playwright().start()

        if user_data_dir:
            self.browser = await self.playwright.chromium.launch_persistent_context(
                user_data_dir,
                headless=headless,
                viewport={"width": 1280, "height": 720}
            )
            self.page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()
        else:
            self.browser = await self.playwright.chromium.launch(headless=headless)
            context = await self.browser.new_context(viewport={"width": 1280, "height": 720})
            self.page = await context.new_page()

    async def login(self, email: str = None, password: str = None):
        """登入 Claude（首次需要手動登入）"""
        await self.page.goto("https://claude.ai")
        await self.page.wait_for_load_state("networkidle")

        # 檢查是否已登入
        if "/new" in self.page.url or "/chat" in self.page.url:
            print("✅ Already logged in")
            return

        if email and password:
            # 自動登入
            await self.page.fill('input[type="email"]', email)
            await self.page.click('button[type="submit"]')
            await self.page.wait_for_selector('input[type="password"]')
            await self.page.fill('input[type="password"]', password)
            await self.page.click('button[type="submit"]')
            await self.page.wait_for_url("**/claude.ai/**", timeout=30000)
        else:
            # 等待手動登入
            print("Please login manually in the browser...")
            await self.page.wait_for_url("**/claude.ai/new**", timeout=120000)
        
        print("✅ Login successful")

    async def chat(self, message: str) -> str:
        """發送訊息並取得回應"""
        # 確保在聊天頁面
        if "/new" not in self.page.url and "/chat" not in self.page.url:
            await self.page.goto("https://claude.ai/new")
            await self.page.wait_for_load_state("networkidle")

        # 找到輸入框
        textarea = await self.page.wait_for_selector('div[contenteditable="true"]')
        await textarea.fill(message)

        # 點擊送出
        send_button = await self.page.wait_for_selector('button[aria-label="Send message"]')
        await send_button.click()

        # 等待回應完成
        await self.page.wait_for_selector('button[aria-label="Stop"]', state="hidden", timeout=120000)

        # 取得最後一個回應
        responses = await self.page.query_selector_all('[data-testid="assistant-message"]')
        if responses:
            return await responses[-1].inner_text()

        return ""

    async def close(self):
        """關閉瀏覽器"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()


# 使用範例
async def main():
    client = ClaudeBrowserClient()
    await client.start(
        headless=False,
        user_data_dir="./claude_browser_data"
    )
    
    await client.login()
    
    response = await client.chat("Hello! What is 2+2?")
    print(f"Response: {response}")
    
    await client.close()


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 4. 繞過 Cloudflare

### 4.1 使用 curl_cffi

```python
# cloudflare_bypass.py
"""
使用 curl_cffi 繞過 Cloudflare
模擬瀏覽器的 TLS 指紋
"""

from curl_cffi import requests


class CloudflareBypassClient:
    """使用 Chrome TLS 指紋的 HTTP 客戶端"""
    
    def __init__(self, impersonate: str = "chrome120"):
        self.session = requests.Session(impersonate=impersonate)
    
    def get(self, url: str, **kwargs):
        return self.session.get(url, **kwargs)
    
    def post(self, url: str, **kwargs):
        return self.session.post(url, **kwargs)


# 使用範例
if __name__ == "__main__":
    client = CloudflareBypassClient()
    
    # 這個請求會帶有 Chrome 的 TLS 指紋
    response = client.get("https://claude.ai")
    print(f"Status: {response.status_code}")
```

### 4.2 使用 DrissionPage（推薦）

```python
# drission_page_client.py
"""
使用 DrissionPage 繞過 Cloudflare
比 Selenium 更不容易被檢測
"""

from DrissionPage import ChromiumPage, ChromiumOptions


class DrissionClient:
    """使用 DrissionPage 的瀏覽器客戶端"""
    
    def __init__(self):
        self.page = None
    
    def start(self, headless: bool = False, user_data_dir: str = None):
        options = ChromiumOptions()
        
        if headless:
            options.headless()
        
        if user_data_dir:
            options.set_user_data_path(user_data_dir)
        
        # 設定為不被檢測
        options.set_argument('--disable-blink-features=AutomationControlled')
        
        self.page = ChromiumPage(options)
    
    def login_claude(self, email: str = None, password: str = None):
        self.page.get("https://claude.ai")
        
        if "login" in self.page.url:
            if email and password:
                self.page.ele('input[type="email"]').input(email)
                self.page.ele('button[type="submit"]').click()
                self.page.wait.load_start()
                
                self.page.ele('input[type="password"]').input(password)
                self.page.ele('button[type="submit"]').click()
                self.page.wait.load_start()
            else:
                print("Please login manually...")
                self.page.wait.url_change(timeout=120)
    
    def chat(self, message: str) -> str:
        textarea = self.page.ele('div[contenteditable="true"]')
        textarea.input(message)
        
        self.page.ele('button[aria-label="Send message"]').click()
        self.page.wait.ele_hidden('button[aria-label="Stop"]', timeout=120)
        
        responses = self.page.eles('[data-testid="assistant-message"]')
        if responses:
            return responses[-1].text
        
        return ""
    
    def close(self):
        if self.page:
            self.page.quit()


# 使用範例
if __name__ == "__main__":
    client = DrissionClient()
    client.start(user_data_dir="./drission_data")
    client.login_claude()
    
    response = client.chat("Hello!")
    print(f"Response: {response}")
    
    client.close()
```

---

## 5. 最佳實踐

### 5.1 錯誤處理

```python
# error_handling.py
"""
錯誤處理與重試機制
"""

import time
import functools
from typing import Callable, TypeVar

T = TypeVar('T')


def retry_on_error(
    max_retries: int = 3,
    retry_delay: float = 1.0,
    exponential_backoff: bool = True,
    retryable_errors: tuple = (Exception,)
) -> Callable:
    """
    重試裝飾器
    
    Args:
        max_retries: 最大重試次數
        retry_delay: 初始重試延遲（秒）
        exponential_backoff: 是否使用指數退避
        retryable_errors: 可重試的錯誤類型
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_error = None
            delay = retry_delay
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_errors as e:
                    last_error = e
                    
                    if attempt < max_retries:
                        print(f"Attempt {attempt + 1} failed: {e}")
                        print(f"Retrying in {delay:.1f}s...")
                        time.sleep(delay)
                        
                        if exponential_backoff:
                            delay *= 2
            
            raise last_error
        
        return wrapper
    return decorator


# 使用範例
@retry_on_error(max_retries=3, retry_delay=1.0)
def call_api(message: str) -> str:
    # API 呼叫邏輯
    pass
```

### 5.2 Token 安全儲存

```python
# secure_storage.py
"""
安全儲存 Token
"""

import json
import os
from cryptography.fernet import Fernet
from pathlib import Path


class SecureTokenStorage:
    """加密儲存 Token"""
    
    def __init__(self, storage_path: str = "~/.ai_tokens"):
        self.storage_path = Path(storage_path).expanduser()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.key_file = self.storage_path / ".key"
        self.tokens_file = self.storage_path / "tokens.enc"
        
        self._ensure_key()
    
    def _ensure_key(self):
        """確保加密金鑰存在"""
        if not self.key_file.exists():
            key = Fernet.generate_key()
            self.key_file.write_bytes(key)
            os.chmod(self.key_file, 0o600)
    
    def _get_cipher(self) -> Fernet:
        key = self.key_file.read_bytes()
        return Fernet(key)
    
    def save(self, provider: str, tokens: dict):
        """儲存 Token"""
        all_tokens = self.load_all()
        all_tokens[provider] = tokens
        
        cipher = self._get_cipher()
        encrypted = cipher.encrypt(json.dumps(all_tokens).encode())
        self.tokens_file.write_bytes(encrypted)
        os.chmod(self.tokens_file, 0o600)
    
    def load(self, provider: str) -> dict:
        """載入 Token"""
        all_tokens = self.load_all()
        return all_tokens.get(provider)
    
    def load_all(self) -> dict:
        """載入所有 Token"""
        if not self.tokens_file.exists():
            return {}
        
        try:
            cipher = self._get_cipher()
            encrypted = self.tokens_file.read_bytes()
            decrypted = cipher.decrypt(encrypted)
            return json.loads(decrypted)
        except Exception:
            return {}
    
    def delete(self, provider: str):
        """刪除 Token"""
        all_tokens = self.load_all()
        if provider in all_tokens:
            del all_tokens[provider]
            
            cipher = self._get_cipher()
            encrypted = cipher.encrypt(json.dumps(all_tokens).encode())
            self.tokens_file.write_bytes(encrypted)
```

### 5.3 使用建議總結

| 場景 | 推薦方案 | 原因 |
|------|---------|------|
| **正式專案** | 官方 API Key | 穩定、有官方支援 |
| **個人 CLI 工具** | Python OAuth Client | 簡單、直接 |
| **Chrome Extension** | Backend Proxy | 安全、可管理 |
| **需要繞過 Cloudflare** | DrissionPage | 不易被檢測 |
| **臨時測試** | curl_cffi | 快速、簡單 |

---

*文件最後更新：2026-01-20*
