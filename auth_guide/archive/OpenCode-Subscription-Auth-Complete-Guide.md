# OpenCode 訂閱帳號認證完整指南

> 本文檔完整分析 OpenCode 如何透過 `/connect` 命令使用 Claude 和 ChatGPT 的訂閱帳號。

---

## 重大發現

經過深入分析，我發現 OpenCode 對 **Claude** 和 **ChatGPT** 都支援訂閱帳號認證！

| Provider | 訂閱支援 | OAuth Endpoint | 認證方式 |
|----------|---------|----------------|---------|
| **Claude (Anthropic)** | ✅ Claude Pro/Max | `claude.ai/oauth/authorize` | OAuth 2.0 + PKCE |
| **ChatGPT (OpenAI)** | ✅ ChatGPT Plus/Pro | `auth.openai.com/oauth/authorize` | OAuth 2.0 + PKCE |

---

## 第一部分：Claude 訂閱帳號認證

### 1.1 核心配置

從 `opencode-anthropic-auth` 插件（版本 0.0.9）提取：

```javascript
// Claude OAuth 配置
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

// 授權端點
const AUTH_ENDPOINTS = {
    max: "https://claude.ai/oauth/authorize",           // Claude Pro/Max 訂閱
    console: "https://console.anthropic.com/oauth/authorize"  // API Key 創建
};

// Token 端點
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";

// Redirect URI
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
```

### 1.2 OAuth 授權流程

```javascript
// 步驟 1: 構建授權 URL
async function authorize(mode) {
    const pkce = await generatePKCE();

    const url = new URL(
        `https://${mode === "console" ? "console.anthropic.com" : "claude.ai"}/oauth/authorize`
    );

    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", "https://console.anthropic.com/oauth/code/callback");
    url.searchParams.set("scope", "org:create_api_key user:profile user:inference");
    url.searchParams.set("code_challenge", pkce.challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", pkce.verifier);
    url.searchParams.set("code", "true");

    return { url: url.toString(), verifier: pkce.verifier };
}
```

### 1.3 Token 交換

```javascript
// 步驟 2: 用授權碼交換 Token
async function exchange(code, verifier) {
    const splits = code.split("#");

    const result = await fetch("https://console.anthropic.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            code: splits[0],
            state: splits[1],
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            redirect_uri: "https://console.anthropic.com/oauth/code/callback",
            code_verifier: verifier,
        }),
    });

    const json = await result.json();
    return {
        refresh: json.refresh_token,
        access: json.access_token,
        expires: Date.now() + json.expires_in * 1000,
    };
}
```

### 1.4 API 請求設置

**關鍵發現**：Claude OAuth 仍然使用標準的 `api.anthropic.com`，但需要特殊的 Headers！

```javascript
// 設置請求 Headers
requestHeaders.set("authorization", `Bearer ${auth.access}`);  // 使用 OAuth Token
requestHeaders.set("anthropic-beta", "oauth-2025-04-20,interleaved-thinking-2025-05-14");
requestHeaders.set("user-agent", "claude-cli/2.1.2 (external, cli)");
requestHeaders.delete("x-api-key");  // 刪除 API Key header

// 修改 URL 添加 beta 參數
if (requestUrl.pathname === "/v1/messages") {
    requestUrl.searchParams.set("beta", "true");
}
```

### 1.5 重要的轉換處理

OpenCode 對請求做了一些轉換來通過 Anthropic 的檢查：

```javascript
// 1. 替換系統提示中的 "OpenCode" 字樣（伺服器會阻擋）
if (parsed.system && Array.isArray(parsed.system)) {
    parsed.system = parsed.system.map(item => ({
        ...item,
        text: item.text
            .replace(/OpenCode/g, 'Claude Code')
            .replace(/opencode/gi, 'Claude')
    }));
}

// 2. 給工具名稱加前綴 "mcp_"
if (parsed.tools && Array.isArray(parsed.tools)) {
    parsed.tools = parsed.tools.map((tool) => ({
        ...tool,
        name: `mcp_${tool.name}`,
    }));
}

// 3. 回應中移除前綴
text = text.replace(/"name"\s*:\s*"mcp_([^"]+)"/g, '"name": "$1"');
```

### 1.6 Token 刷新

```javascript
// 刷新過期的 Token
async function refreshToken(auth) {
    const response = await fetch("https://console.anthropic.com/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: auth.refresh,
            client_id: CLIENT_ID,
        }),
    });

    const json = await response.json();
    return {
        access: json.access_token,
        refresh: json.refresh_token,
        expires: Date.now() + json.expires_in * 1000,
    };
}
```

---

## 第二部分：ChatGPT 訂閱帳號認證

### 2.1 核心配置

從 OpenCode 二進制文件提取：

```javascript
// ChatGPT/Codex OAuth 配置
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const OAUTH_PORT = 1455;
```

### 2.2 OAuth 授權流程

```javascript
// 構建授權 URL
const authParams = {
    client_id: CLIENT_ID,
    redirect_uri: `http://localhost:${OAUTH_PORT}/callback`,
    response_type: "code",
    scope: "openid email profile offline_access",
    state: randomState,
    code_challenge: pkceChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",  // Codex CLI 專用標記
    originator: "opencode"
};

const authUrl = `${ISSUER}/oauth/authorize?${new URLSearchParams(authParams)}`;
```

### 2.3 Token 交換

```javascript
// 用授權碼交換 Token
const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: `http://localhost:${OAUTH_PORT}/callback`,
        client_id: CLIENT_ID,
        code_verifier: pkce.verifier
    })
});
```

### 2.4 API 端點選擇

**關鍵邏輯**：OpenCode 根據認證類型選擇不同的 API 端點！

```javascript
// 判斷是否使用 Codex API
const isCodex = provider.id === "openai" && auth?.type === "oauth";

if (isCodex) {
    // 使用 Codex API（訂閱用戶）
    endpoint = "https://chatgpt.com/backend-api/codex/responses";
    headers.set("ChatGPT-Account-Id", auth.accountId);
} else {
    // 使用標準 API（API Key 用戶）
    endpoint = "https://api.openai.com/v1/chat/completions";
}
```

---

## 第三部分：Python 完整實作

### 3.1 Claude 訂閱認證實作

```python
# claude_subscription.py
import requests
import hashlib
import base64
import secrets
import json
import time
import webbrowser
from typing import Optional, Generator
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, parse_qs, urlparse

class ClaudeSubscriptionClient:
    """
    使用 Claude Pro/Max 訂閱帳號進行認證
    基於 opencode-anthropic-auth 插件的實作
    """

    CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    AUTH_URL = "https://claude.ai/oauth/authorize"
    TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
    API_URL = "https://api.anthropic.com/v1/messages"
    REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback"

    def __init__(self):
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.expires_at: int = 0

    def _generate_pkce(self) -> tuple[str, str]:
        """生成 PKCE code_verifier 和 code_challenge"""
        verifier = secrets.token_urlsafe(32)
        challenge = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(challenge).decode().rstrip('=')
        return verifier, challenge

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

        Returns:
            是否成功
        """
        # 解析授權碼
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

        print("Login successful!")
        return True

    def login_interactive(self) -> bool:
        """
        互動式登入（手動複製授權碼）

        Returns:
            是否成功
        """
        auth_url, verifier = self.get_auth_url()

        print(f"\n請在瀏覽器中開啟以下 URL 進行登入：")
        print(f"\n{auth_url}\n")

        # 嘗試自動開啟瀏覽器
        try:
            webbrowser.open(auth_url)
            print("已嘗試自動開啟瀏覽器...")
        except:
            pass

        print("登入完成後，請複製頁面顯示的授權碼。")
        code = input("請貼上授權碼: ").strip()

        return self.exchange_code(code, verifier)

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

        return True

    def _ensure_valid_token(self) -> bool:
        """確保 Token 有效"""
        if not self.access_token:
            return False

        # 提前 5 分鐘刷新
        if time.time() > self.expires_at - 300:
            return self._refresh_access_token()

        return True

    def _prepare_request(self, messages: list, model: str, stream: bool) -> tuple[str, dict, dict]:
        """準備 API 請求"""
        # 處理工具名稱前綴（如果有 tools）
        # 這裡簡化處理，實際使用時可能需要更複雜的邏輯

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14",
            "anthropic-version": "2023-06-01",
            "user-agent": "claude-cli/2.1.2 (external, cli)"
        }

        payload = {
            "model": model,
            "max_tokens": 8192,
            "messages": messages,
            "stream": stream
        }

        # 添加 beta 參數到 URL
        url = f"{self.API_URL}?beta=true"

        return url, headers, payload

    def chat(self, message: str, model: str = "claude-sonnet-4-20250514") -> str:
        """
        發送訊息並獲取回應

        Args:
            message: 用戶訊息
            model: 模型名稱

        Returns:
            AI 回應
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        url, headers, payload = self._prepare_request(messages, model, stream=False)

        response = requests.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")

        data = response.json()
        return data.get("content", [{}])[0].get("text", "")

    def stream_chat(self, message: str, model: str = "claude-sonnet-4-20250514") -> Generator[str, None, None]:
        """
        串流發送訊息

        Args:
            message: 用戶訊息
            model: 模型名稱

        Yields:
            回應文字片段
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        messages = [{"role": "user", "content": message}]
        url, headers, payload = self._prepare_request(messages, model, stream=True)

        response = requests.post(url, headers=headers, json=payload, stream=True)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code}")

        for line in response.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if data.get("type") == "content_block_delta":
                            delta = data.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield delta.get("text", "")
                    except json.JSONDecodeError:
                        pass

    def save_tokens(self, filepath: str = "claude_tokens.json"):
        """保存 Token 到文件"""
        data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at
        }
        with open(filepath, "w") as f:
            json.dump(data, f)
        print(f"Tokens saved to {filepath}")

    def load_tokens(self, filepath: str = "claude_tokens.json") -> bool:
        """從文件載入 Token"""
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            self.expires_at = data.get("expires_at", 0)

            if self._ensure_valid_token():
                print("Tokens loaded and valid!")
                return True
            else:
                print("Tokens expired and refresh failed.")
                return False
        except FileNotFoundError:
            return False
        except Exception as e:
            print(f"Failed to load tokens: {e}")
            return False


# 使用範例
if __name__ == "__main__":
    client = ClaudeSubscriptionClient()

    # 嘗試載入已保存的 Token
    if not client.load_tokens():
        # 需要重新登入
        if not client.login_interactive():
            print("Login failed!")
            exit(1)
        client.save_tokens()

    # 測試對話
    print("\n--- Chat Test ---")
    response = client.chat("你好！請簡單介紹一下你自己。")
    print(f"Response: {response}")

    # 串流測試
    print("\n--- Stream Test ---")
    print("Response: ", end="", flush=True)
    for chunk in client.stream_chat("用一句話解釋什麼是人工智慧。"):
        print(chunk, end="", flush=True)
    print()
```

### 3.2 ChatGPT 訂閱認證實作

```python
# chatgpt_subscription.py
import requests
import hashlib
import base64
import secrets
import json
import time
import webbrowser
from typing import Optional, Generator
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, parse_qs, urlparse
import threading

class ChatGPTSubscriptionClient:
    """
    使用 ChatGPT Plus/Pro 訂閱帳號進行認證
    基於 OpenCode 的 Codex API 實作
    """

    CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
    ISSUER = "https://auth.openai.com"
    CODEX_API = "https://chatgpt.com/backend-api/codex/responses"
    CALLBACK_PORT = 1455

    def __init__(self):
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.account_id: Optional[str] = None
        self.expires_at: int = 0

    def _generate_pkce(self) -> tuple[str, str]:
        """生成 PKCE"""
        verifier = secrets.token_urlsafe(32)
        challenge = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(challenge).decode().rstrip('=')
        return verifier, challenge

    def login(self) -> bool:
        """
        啟動 OAuth 登入流程
        會開啟瀏覽器並啟動本地伺服器接收回調
        """
        verifier, challenge = self._generate_pkce()
        state = secrets.token_urlsafe(16)

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
                    handler_self.send_header("Content-type", "text/html")
                    handler_self.end_headers()
                    handler_self.wfile.write(b"""
                        <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
                        <h1>Authorization Successful!</h1>
                        <p>You can close this window.</p>
                        </body></html>
                    """)

            def log_message(handler_self, format, *args):
                pass

        # 啟動伺服器
        server = HTTPServer(("localhost", self.CALLBACK_PORT), CallbackHandler)
        server.timeout = 120

        print(f"Opening browser for login...")
        webbrowser.open(auth_url)

        print("Waiting for authorization...")
        server.handle_request()
        server.server_close()

        # 驗證
        if received["state"] != state:
            print("State mismatch!")
            return False

        if not received["code"]:
            print("No code received.")
            return False

        # 交換 Token
        return self._exchange_token(received["code"], verifier)

    def _exchange_token(self, code: str, verifier: str) -> bool:
        """交換 Token"""
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
            print(f"Token exchange failed: {response.status_code}")
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
            except:
                pass

        print("Login successful!")
        return True

    def _refresh_access_token(self) -> bool:
        """刷新 Token"""
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
            return False

        tokens = response.json()
        self.access_token = tokens.get("access_token")
        self.expires_at = int(time.time()) + tokens.get("expires_in", 3600)

        if "refresh_token" in tokens:
            self.refresh_token = tokens["refresh_token"]

        return True

    def _ensure_valid_token(self) -> bool:
        """確保 Token 有效"""
        if not self.access_token:
            return False

        if time.time() > self.expires_at - 300:
            return self._refresh_access_token()

        return True

    def chat(self, message: str, model: str = "gpt-4o") -> str:
        """發送訊息"""
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        if self.account_id:
            headers["ChatGPT-Account-Id"] = self.account_id

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": message}],
            "stream": False
        }

        response = requests.post(self.CODEX_API, headers=headers, json=payload)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")

        data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")

    def stream_chat(self, message: str, model: str = "gpt-4o") -> Generator[str, None, None]:
        """串流發送訊息"""
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        }

        if self.account_id:
            headers["ChatGPT-Account-Id"] = self.account_id

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": message}],
            "stream": True
        }

        response = requests.post(self.CODEX_API, headers=headers, json=payload, stream=True)

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code}")

        for line in response.iter_lines():
            if line:
                line = line.decode("utf-8")
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except:
                        pass

    def save_tokens(self, filepath: str = "chatgpt_tokens.json"):
        """保存 Token"""
        data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "account_id": self.account_id,
            "expires_at": self.expires_at
        }
        with open(filepath, "w") as f:
            json.dump(data, f)

    def load_tokens(self, filepath: str = "chatgpt_tokens.json") -> bool:
        """載入 Token"""
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            self.account_id = data.get("account_id")
            self.expires_at = data.get("expires_at", 0)

            return self._ensure_valid_token()
        except:
            return False


# 使用範例
if __name__ == "__main__":
    client = ChatGPTSubscriptionClient()

    if not client.load_tokens():
        if not client.login():
            print("Login failed!")
            exit(1)
        client.save_tokens()

    print("\n--- Chat Test ---")
    response = client.chat("Hello! What can you help me with?")
    print(f"Response: {response}")

    print("\n--- Stream Test ---")
    print("Response: ", end="", flush=True)
    for chunk in client.stream_chat("Write a haiku about coding."):
        print(chunk, end="", flush=True)
    print()
```

---

## 第四部分：技術細節總結

### 4.1 認證比較

| 特性 | Claude 訂閱 | ChatGPT 訂閱 |
|-----|------------|--------------|
| **Client ID** | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` | `app_EMoamEEZ73f0CkXaXp7hrann` |
| **Auth URL** | `claude.ai/oauth/authorize` | `auth.openai.com/oauth/authorize` |
| **Token URL** | `console.anthropic.com/v1/oauth/token` | `auth.openai.com/oauth/token` |
| **API URL** | `api.anthropic.com/v1/messages?beta=true` | `chatgpt.com/backend-api/codex/responses` |
| **特殊 Header** | `anthropic-beta: oauth-2025-04-20` | `ChatGPT-Account-Id` |
| **回調方式** | 手動複製授權碼 | 本地伺服器自動接收 |

### 4.2 關鍵 Headers

**Claude 訂閱：**
```
Authorization: Bearer {access_token}
anthropic-beta: oauth-2025-04-20,interleaved-thinking-2025-05-14
user-agent: claude-cli/2.1.2 (external, cli)
```

**ChatGPT 訂閱：**
```
Authorization: Bearer {access_token}
ChatGPT-Account-Id: {account_id}
```

### 4.3 Token 生命週期

| Provider | Access Token 有效期 | 刷新方式 |
|----------|-------------------|---------|
| Claude | ~1 小時 | 使用 refresh_token |
| ChatGPT | ~1 小時 | 使用 refresh_token |

---

## 第五部分：注意事項

### 5.1 法律與道德

- 這些方法使用的是內部 API，可能違反服務條款
- 僅供學習和研究使用
- 正式專案建議使用官方 API

### 5.2 穩定性風險

- Client ID 可能會被撤銷
- API 端點可能會變更
- 認證流程可能會更新

### 5.3 使用建議

1. **個人學習/測試**：可以使用這些方法
2. **商業專案**：強烈建議使用官方 API
3. **Token 管理**：務必安全存儲，定期刷新

---

## 附錄：OpenCode 插件列表

OpenCode 內建的認證插件：

| 插件名稱 | 版本 | 用途 |
|---------|------|-----|
| `opencode-anthropic-auth` | 0.0.9 | Claude Pro/Max 認證 |
| `opencode-openai-codex-auth` | 內建 | ChatGPT Plus/Pro 認證 |
| `opencode-copilot-auth` | 內建 | GitHub Copilot 認證 |
| `@gitlab/opencode-gitlab-auth` | 1.3.0 | GitLab 認證 |

---

*文件最後更新：2026-01-20*
*基於 OpenCode 二進制分析和 opencode-anthropic-auth 插件源碼*
