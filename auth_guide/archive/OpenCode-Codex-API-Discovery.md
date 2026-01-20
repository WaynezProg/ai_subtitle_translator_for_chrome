# OpenCode `/connect` 訂閱方案實作分析

> 本文檔詳細分析 OpenCode 如何透過 `/connect` 命令使用 ChatGPT 訂閱帳號，而非 API Key。

---

## 關鍵發現

經過深入分析 OpenCode 的二進制文件，我發現了一個重要的秘密：

**OpenCode 並不使用標準的 `api.openai.com`，而是使用一個特殊的 "Codex API" 端點！**

```
標準 API 路徑：  api.openai.com/v1/chat/completions
OpenCode 路徑：  chatgpt.com/backend-api/codex/responses  ← 這是關鍵！
```

---

## 1. Codex API 配置

從 OpenCode 二進制文件中提取的關鍵配置：

```javascript
// 核心配置常數
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
ISSUER = "https://auth.openai.com"
CODEX_API_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses"
OAUTH_PORT = 1455
```

### 1.1 為什麼這很重要？

| 端點類型 | URL | 認證方式 | 適用對象 |
|---------|-----|---------|---------|
| **標準 API** | `api.openai.com/v1/*` | API Key | 開發者（付費 API） |
| **Codex API** | `chatgpt.com/backend-api/codex/*` | OAuth Token | 訂閱用戶（Plus/Pro） |

OpenCode 使用 Codex API 讓訂閱用戶可以透過 OAuth 認證使用他們的訂閱額度！

---

## 2. OAuth 認證流程

### 2.1 授權 URL 構建

```javascript
// OpenCode 構建 OAuth 授權 URL 的方式
const authUrl = `${ISSUER}/oauth/authorize?` + new URLSearchParams({
    client_id: CLIENT_ID,                    // "app_EMoamEEZ73f0CkXaXp7hrann"
    redirect_uri: `http://localhost:${OAUTH_PORT}/callback`,
    response_type: "code",
    scope: "openid email profile offline_access",
    state: randomState,
    code_challenge: pkceChallenge,           // PKCE 安全驗證
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",       // Codex CLI 專用標記
    originator: "opencode"
});
```

### 2.2 Token 交換

```javascript
// 用授權碼交換 Token
const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
        code_verifier: pkce.verifier
    })
});

// 回應包含
{
    access_token: "eyJhbGciOi...",    // 用於 API 請求
    refresh_token: "...",             // 用於刷新
    id_token: "...",                  // 包含用戶資訊
    expires_in: 3600,
    token_type: "Bearer"
}
```

### 2.3 Token 刷新

```javascript
// 刷新過期的 Access Token
const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefreshToken,
        client_id: CLIENT_ID
    })
});
```

---

## 3. Codex API 請求格式

### 3.1 請求頭設置

```javascript
// 發送請求到 Codex API 時的 Headers
headers = {
    "Authorization": `Bearer ${accessToken}`,
    "ChatGPT-Account-Id": accountId,         // 從 OAuth claims 取得
    "Content-Type": "application/json"
};
```

### 3.2 API 端點

```
POST https://chatgpt.com/backend-api/codex/responses
```

### 3.3 請求體格式

**重要更新 (2026-01-20)**：Codex API **不支援** GPT-4 系列模型！必須使用 GPT-5 系列：

```json
{
    "model": "gpt-5-codex-mini",
    "instructions": "You are a helpful assistant.",
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": "Hello!"}]
        }
    ],
    "stream": true,
    "store": false
}
```

### 3.4 支援的模型（2026-01-20 更新）

根據 [codex-proxy](https://github.com/dvcrn/codex-proxy) 專案的分析，Codex API 支援以下 GPT-5 系列模型：

| Model ID | 說明 | 適用場景 |
|----------|------|----------|
| `gpt-5` | 基礎 GPT-5 | 通用任務 |
| `gpt-5-codex` | 程式碼優化版 | 編程任務 |
| `gpt-5-codex-mini` | 輕量快速版 | 快速回應、翻譯 |
| `gpt-5.1` | 更新版本 | 更強推理 |
| `gpt-5.1-codex` | 5.1 程式碼版 | 複雜編程 |
| `gpt-5.1-codex-max` | 最強版本 | 需要 xhigh reasoning |
| `gpt-5.2` | 最新版本 | 最強推理能力 |

**重要限制**：
- `stream: true` 是**必須**的，不支援非串流模式
- 必須提供 `instructions` 欄位（系統提示）
- 使用 `input` 陣列而非 `messages`
- 每個輸入訊息使用 `input_text` 類型

---

## 4. OpenCode 的路由邏輯

從原始碼中發現的關鍵路由判斷：

```javascript
// 判斷是否使用 Codex API
const isCodex = provider.id === "openai" && auth?.type === "oauth";

// 如果是 Codex，使用特殊端點
if (isCodex) {
    // 使用 chatgpt.com/backend-api/codex/responses
    options.instructions = SystemPrompt.instructions();
}

// 設置 Headers
if (plugin.includes("opencode-openai-codex-auth") ||
    plugin.includes("opencode-copilot-auth")) {
    const authWithAccount = auth as OAuthWithAccount;
    headers.set("ChatGPT-Account-Id", authWithAccount.accountId);
}
```

**關鍵邏輯**：
1. 檢查 provider 是否為 "openai"
2. 檢查認證類型是否為 "oauth"
3. 如果兩者都是，則路由到 Codex API

---

## 5. Provider 配置對比

### 5.1 Anthropic (Claude)

```json
{
    "anthropic": {
        "id": "anthropic",
        "env": ["ANTHROPIC_API_KEY"],
        "npm": "@ai-sdk/anthropic",
        "api": "https://api.anthropic.com/v1"
    }
}
```

**注意**：Claude 只支援 API Key 認證，沒有 OAuth 選項。

### 5.2 OpenAI

```json
{
    "openai": {
        "id": "openai",
        "env": ["OPENAI_API_KEY"],
        "npm": "@ai-sdk/openai",
        "api": "https://api.openai.com/v1"
    }
}
```

**但是**：當使用 OAuth 認證時，OpenCode 會改用 `chatgpt.com/backend-api/codex/responses`

### 5.3 Auth 類型定義

```typescript
// OpenCode 支援的認證類型
type OAuth = {
    type: "oauth";
    refresh: string;      // Refresh Token
    access: string;       // Access Token
    expires: number;      // 過期時間
    accountId?: string;   // ChatGPT Account ID
};

type ApiAuth = {
    type: "api";
    key: string;          // API Key
};
```

---

## 6. Python 實作範例

基於以上發現，以下是使用 Python 複製 OpenCode Codex API 功能的範例：

### 6.1 安裝依賴

```bash
pip install requests authlib
```

### 6.2 完整實作

```python
# opencode_codex.py
import requests
import secrets
import hashlib
import base64
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, parse_qs, urlparse
import json
import time
from typing import Optional, Dict, Generator

class OpenCodeCodexClient:
    """
    模擬 OpenCode 的 Codex API 客戶端
    使用 ChatGPT 訂閱帳號進行認證
    """

    # OpenCode 的 OAuth 配置
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
        """生成 PKCE code_verifier 和 code_challenge"""
        # 生成 code_verifier (43-128 字元)
        verifier = secrets.token_urlsafe(32)

        # 生成 code_challenge (SHA256 + Base64URL)
        challenge = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(challenge).decode().rstrip('=')

        return verifier, challenge

    def _generate_state(self) -> str:
        """生成隨機 state"""
        return secrets.token_urlsafe(16)

    def login(self) -> bool:
        """
        啟動 OAuth 登入流程
        會開啟瀏覽器讓用戶登入
        """
        # 生成 PKCE
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

        # 存儲用於驗證的資料
        received_code = [None]
        received_state = [None]

        # 創建本地伺服器接收回調
        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                if parsed.path == "/callback":
                    params = parse_qs(parsed.query)
                    received_code[0] = params.get("code", [None])[0]
                    received_state[0] = params.get("state", [None])[0]

                    # 回應成功頁面
                    self.send_response(200)
                    self.send_header("Content-type", "text/html")
                    self.end_headers()
                    self.wfile.write(b"""
                        <html>
                        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                            <h1>Authorization Successful!</h1>
                            <p>You can close this window and return to the terminal.</p>
                        </body>
                        </html>
                    """)

            def log_message(self, format, *args):
                pass  # 禁止日誌輸出

        # 啟動伺服器
        server = HTTPServer(("localhost", self.CALLBACK_PORT), CallbackHandler)
        server.timeout = 120  # 2分鐘超時

        # 開啟瀏覽器
        print(f"Opening browser for login...")
        webbrowser.open(auth_url)

        # 等待回調
        print("Waiting for authorization...")
        server.handle_request()
        server.server_close()

        # 驗證 state
        if received_state[0] != state:
            print("State mismatch! Possible CSRF attack.")
            return False

        if not received_code[0]:
            print("No authorization code received.")
            return False

        # 交換 Token
        return self._exchange_token(received_code[0], verifier)

    def _exchange_token(self, code: str, verifier: str) -> bool:
        """用授權碼交換 Token"""
        token_url = f"{self.ISSUER}/oauth/token"

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": f"http://localhost:{self.CALLBACK_PORT}/callback",
            "client_id": self.CLIENT_ID,
            "code_verifier": verifier
        }

        response = requests.post(
            token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )

        if response.status_code != 200:
            print(f"Token exchange failed: {response.status_code}")
            print(response.text)
            return False

        tokens = response.json()
        self.access_token = tokens.get("access_token")
        self.refresh_token = tokens.get("refresh_token")
        self.expires_at = int(time.time()) + tokens.get("expires_in", 3600)

        # 從 id_token 中提取 account_id
        id_token = tokens.get("id_token", "")
        if id_token:
            # 解析 JWT payload (不驗證簽名，僅解碼)
            try:
                payload = id_token.split(".")[1]
                # 添加 padding
                payload += "=" * (4 - len(payload) % 4)
                decoded = base64.urlsafe_b64decode(payload)
                claims = json.loads(decoded)
                self.account_id = claims.get("chatgpt_account_id")
            except Exception as e:
                print(f"Failed to parse id_token: {e}")

        print("Login successful!")
        return True

    def _refresh_access_token(self) -> bool:
        """刷新 Access Token"""
        if not self.refresh_token:
            return False

        token_url = f"{self.ISSUER}/oauth/token"

        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token,
            "client_id": self.CLIENT_ID
        }

        response = requests.post(
            token_url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
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

    def chat(self, message: str, model: str = "gpt-5-codex-mini", instructions: str = None) -> str:
        """
        發送訊息到 Codex API

        Args:
            message: 用戶訊息
            model: 模型名稱 (gpt-5, gpt-5-codex, gpt-5-codex-mini, etc.)
                   注意：Codex API 不支援 GPT-4 系列，只支援 GPT-5 系列
            instructions: 系統指令（可選）

        Returns:
            AI 回應文字
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        # 添加 Account ID (如果有)
        if self.account_id:
            headers["ChatGPT-Account-Id"] = self.account_id

        # Codex API 使用不同的請求格式，且必須使用串流
        payload = {
            "model": model,
            "instructions": instructions or "You are a helpful assistant.",
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": message}]
                }
            ],
            "stream": True,  # Codex API 必須使用串流
            "store": False
        }

        response = requests.post(
            self.CODEX_API,
            headers=headers,
            json=payload,
            stream=True
        )

        if response.status_code != 200:
            raise Exception(f"API error: {response.status_code} - {response.text}")

        # 解析 SSE 串流回應
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

    def stream_chat(self, message: str, model: str = "gpt-5-codex-mini", instructions: str = None) -> Generator[str, None, None]:
        """
        串流發送訊息到 Codex API

        Args:
            message: 用戶訊息
            model: 模型名稱 (gpt-5, gpt-5-codex, gpt-5-codex-mini, etc.)
                   注意：Codex API 不支援 GPT-4 系列，只支援 GPT-5 系列
            instructions: 系統指令（可選）

        Yields:
            回應文字片段
        """
        if not self._ensure_valid_token():
            raise Exception("No valid token. Please login first.")

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        if self.account_id:
            headers["ChatGPT-Account-Id"] = self.account_id

        # Codex API 使用不同的請求格式
        payload = {
            "model": model,
            "instructions": instructions or "You are a helpful assistant.",
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": message}]
                }
            ],
            "stream": True,
            "store": False
        }

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

    def save_tokens(self, filepath: str = "codex_tokens.json"):
        """保存 Token 到文件"""
        data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "account_id": self.account_id,
            "expires_at": self.expires_at
        }
        with open(filepath, "w") as f:
            json.dump(data, f)
        print(f"Tokens saved to {filepath}")

    def load_tokens(self, filepath: str = "codex_tokens.json") -> bool:
        """從文件載入 Token"""
        try:
            with open(filepath, "r") as f:
                data = json.load(f)

            self.access_token = data.get("access_token")
            self.refresh_token = data.get("refresh_token")
            self.account_id = data.get("account_id")
            self.expires_at = data.get("expires_at", 0)

            # 確保 Token 有效
            if self._ensure_valid_token():
                print("Tokens loaded and valid!")
                return True
            else:
                print("Tokens expired and refresh failed.")
                return False
        except FileNotFoundError:
            print("No saved tokens found.")
            return False
        except Exception as e:
            print(f"Failed to load tokens: {e}")
            return False


# 使用範例
if __name__ == "__main__":
    client = OpenCodeCodexClient()

    # 嘗試載入已保存的 Token
    if not client.load_tokens():
        # 需要重新登入
        if not client.login():
            print("Login failed!")
            exit(1)
        # 保存 Token
        client.save_tokens()

    # 發送訊息
    print("\n--- Chat Test ---")
    response = client.chat("Hello! What can you help me with?")
    print(f"Response: {response}")

    # 串流測試
    print("\n--- Stream Test ---")
    print("Response: ", end="", flush=True)
    for chunk in client.stream_chat("Write a haiku about coding."):
        print(chunk, end="", flush=True)
    print()
```

---

## 7. 重要注意事項

### 7.1 這個方法的限制

1. **只適用於 OpenAI/ChatGPT**
   - Claude (Anthropic) 沒有類似的 Codex API
   - Claude 目前只支援 API Key 認證

2. **依賴 OpenAI 的內部 API**
   - `chatgpt.com/backend-api/codex/*` 不是公開 API
   - 可能會在未經通知的情況下更改

3. **Client ID 可能會失效**
   - `app_EMoamEEZ73f0CkXaXp7hrann` 是 OpenCode 的專用 ID
   - OpenAI 可能會撤銷或限制此 ID

### 7.2 為什麼 Claude 沒有類似功能？

從 OpenCode 的配置可以看到：

```json
// Anthropic 的配置只有 API Key 選項
{
    "anthropic": {
        "id": "anthropic",
        "env": ["ANTHROPIC_API_KEY"],  // 只有 API Key
        "api": "https://api.anthropic.com/v1"
    }
}
```

Anthropic 目前沒有提供類似 OpenAI Codex 的 OAuth 認證端點給第三方工具使用。

### 7.3 法律與道德考量

- 使用非公開 API 可能違反服務條款
- 這個方法主要用於學習和研究
- 建議正式專案使用官方 API

---

## 8. 總結

| 特性 | OpenCode Codex (ChatGPT) | Claude |
|-----|-------------------------|--------|
| **認證方式** | OAuth 2.0 + PKCE | 僅 API Key |
| **API 端點** | `chatgpt.com/backend-api/codex/*` | `api.anthropic.com/v1/*` |
| **使用訂閱額度** | ✅ 可以 | ❌ 不行 |
| **Client ID** | `app_EMoamEEZ73f0CkXaXp7hrann` | N/A |
| **OAuth Issuer** | `auth.openai.com` | N/A |

OpenCode 透過這個巧妙的設計，讓 ChatGPT Plus/Pro 訂閱用戶可以在 CLI 工具中使用他們的訂閱額度，而不需要額外購買 API 配額。

---

*文件最後更新：2026-01-20*
*基於 OpenCode 二進制分析*
