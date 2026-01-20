# Claude OAuth API 呼叫完整指南

> 基於 `opencode-anthropic-auth@0.0.9` 插件的精確實作

---

## 重要發現

Claude 訂閱帳號（Pro/Max）的 OAuth Token **可以用於呼叫 API**，但需要：

1. 使用特定的 URL 參數：`?beta=true`
2. 使用特定的 Headers
3. 工具名稱需要加上 `mcp_` 前綴
4. 系統提示中不能包含 "OpenCode" 字樣

---

## API 端點

```
POST https://api.anthropic.com/v1/messages?beta=true
                                          ^^^^^^^^^^
                                          這個參數很重要！
```

---

## 必要的 Headers

```http
Authorization: Bearer {access_token}
Content-Type: application/json
anthropic-beta: oauth-2025-04-20,interleaved-thinking-2025-05-14
anthropic-version: 2023-06-01
user-agent: claude-cli/2.1.2 (external, cli)
```

**注意**：不要包含 `x-api-key` header！

---

## 完整 Python 實作

```python
# claude_oauth_api.py
import requests
import hashlib
import base64
import secrets
import json
import time
import webbrowser
from typing import Optional, Generator

class ClaudeOAuthClient:
    """
    使用 Claude Pro/Max 訂閱帳號的 OAuth Token 呼叫 API

    關鍵點：
    1. API URL 需要加上 ?beta=true
    2. 需要特定的 anthropic-beta header
    3. user-agent 需要偽裝成 claude-cli
    4. 工具名稱需要加上 mcp_ 前綴
    """

    CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    AUTH_URL = "https://claude.ai/oauth/authorize"
    TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
    REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback"

    # 關鍵：API URL 需要加上 ?beta=true
    API_URL = "https://api.anthropic.com/v1/messages?beta=true"

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

        用戶需要：
        1. 在瀏覽器中開啟此 URL
        2. 登入 Claude 帳號
        3. 複製授權碼（格式：code#state）
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

        from urllib.parse import urlencode
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
        """互動式登入"""
        auth_url, verifier = self.get_auth_url()

        print(f"\n📋 請在瀏覽器中開啟以下 URL：")
        print(f"\n{auth_url}\n")

        try:
            webbrowser.open(auth_url)
            print("🌐 已嘗試自動開啟瀏覽器...")
        except:
            pass

        print("登入後，複製頁面顯示的授權碼（格式：xxxxx#xxxxx）")
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

        print("🔄 Token refreshed!")
        return True

    def _ensure_valid_token(self) -> bool:
        """確保 Token 有效"""
        if not self.access_token:
            return False

        # 提前 5 分鐘刷新
        if time.time() > self.expires_at - 300:
            return self._refresh_access_token()

        return True

    def _get_headers(self) -> dict:
        """
        獲取 API 請求需要的 Headers

        這些 Headers 是從 opencode-anthropic-auth 插件中提取的
        """
        return {
            # 使用 Bearer token，不是 x-api-key
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",

            # 關鍵：必須包含 oauth-2025-04-20 beta 標記
            "anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14",

            # API 版本
            "anthropic-version": "2023-06-01",

            # 偽裝成 claude-cli
            "user-agent": "claude-cli/2.1.2 (external, cli)"
        }

    def _prepare_body(self, messages: list, model: str, system: str = None,
                      tools: list = None, stream: bool = False) -> dict:
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

        # 處理系統提示
        if system:
            # 替換 OpenCode 字樣（伺服器會阻擋）
            system = system.replace("OpenCode", "Claude Code").replace("opencode", "Claude")
            body["system"] = system

        # 處理工具（需要加前綴）
        if tools:
            body["tools"] = [
                {**tool, "name": f"mcp_{tool['name']}"}
                for tool in tools
            ]

        return body

    def chat(self, message: str, model: str = "claude-sonnet-4-20250514",
             system: str = None) -> str:
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

        # 關鍵：使用帶 ?beta=true 的 URL
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

    def stream_chat(self, message: str, model: str = "claude-sonnet-4-20250514",
                    system: str = None) -> Generator[str, None, None]:
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

        # 關鍵：使用帶 ?beta=true 的 URL
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

    def chat_with_tools(self, message: str, tools: list,
                        model: str = "claude-sonnet-4-20250514") -> dict:
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
                    block["name"] = block["name"][4:]  # 移除 "mcp_" 前綴

        return data

    def save_tokens(self, filepath: str = "claude_oauth_tokens.json"):
        """保存 Token"""
        data = {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at
        }
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        print(f"💾 Tokens saved to {filepath}")

    def load_tokens(self, filepath: str = "claude_oauth_tokens.json") -> bool:
        """載入 Token"""
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


# ============================================================
# 使用範例
# ============================================================

if __name__ == "__main__":
    client = ClaudeOAuthClient()

    # 嘗試載入已保存的 Token
    if not client.load_tokens():
        # 需要重新登入
        print("\n🔐 需要登入 Claude 帳號")
        if not client.login_interactive():
            print("❌ Login failed!")
            exit(1)
        client.save_tokens()

    # 測試簡單對話
    print("\n" + "="*50)
    print("📝 簡單對話測試")
    print("="*50)

    try:
        response = client.chat("你好！請用一句話介紹你自己。")
        print(f"\n🤖 Claude: {response}")
    except Exception as e:
        print(f"❌ Error: {e}")

    # 測試串流對話
    print("\n" + "="*50)
    print("📝 串流對話測試")
    print("="*50)

    try:
        print("\n🤖 Claude: ", end="", flush=True)
        for chunk in client.stream_chat("寫一首關於程式設計的俳句。"):
            print(chunk, end="", flush=True)
        print()
    except Exception as e:
        print(f"❌ Error: {e}")

    # 測試帶工具的對話
    print("\n" + "="*50)
    print("📝 工具呼叫測試")
    print("="*50)

    tools = [
        {
            "name": "get_weather",
            "description": "獲取指定城市的天氣",
            "input_schema": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名稱"
                    }
                },
                "required": ["city"]
            }
        }
    ]

    try:
        response = client.chat_with_tools("台北今天天氣如何？", tools)
        print(f"\n🤖 Response: {json.dumps(response, indent=2, ensure_ascii=False)}")
    except Exception as e:
        print(f"❌ Error: {e}")
```

---

## 關鍵差異總結

| 項目 | API Key 方式 | OAuth Token 方式 |
|-----|-------------|-----------------|
| **URL** | `api.anthropic.com/v1/messages` | `api.anthropic.com/v1/messages?beta=true` |
| **認證 Header** | `x-api-key: sk-ant-xxx` | `Authorization: Bearer {token}` |
| **Beta Header** | 可選 | **必須** `oauth-2025-04-20` |
| **User-Agent** | 任意 | **必須** `claude-cli/2.1.2 (external, cli)` |
| **工具名稱** | 正常 | 需要加 `mcp_` 前綴 |
| **系統提示** | 正常 | 不能包含 "OpenCode" |

---

## 你的 Agent 說 "Token 只能用於 Claude Code" 的原因

這個說法**不完全正確**。根據插件源碼，OAuth Token 可以用於 API 呼叫，但需要：

1. ✅ 使用正確的 URL（加 `?beta=true`）
2. ✅ 使用正確的 Headers（特別是 `anthropic-beta: oauth-2025-04-20`）
3. ✅ 偽裝 User-Agent 為 `claude-cli/2.1.2`
4. ✅ 工具名稱加上 `mcp_` 前綴
5. ✅ 避免系統提示包含 "OpenCode"

如果你的 Agent 沒有做到以上這些，就會失敗。

---

## 測試命令

你可以用 curl 快速測試：

```bash
curl -X POST "https://api.anthropic.com/v1/messages?beta=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "anthropic-beta: oauth-2025-04-20,interleaved-thinking-2025-05-14" \
  -H "anthropic-version: 2023-06-01" \
  -H "user-agent: claude-cli/2.1.2 (external, cli)" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

*文件最後更新：2026-01-20*
*基於 opencode-anthropic-auth@0.0.9 源碼分析*
