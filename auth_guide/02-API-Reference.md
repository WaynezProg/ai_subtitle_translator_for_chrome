# AI 訂閱帳號認證 API 參考

> 本文件提供 Claude 和 ChatGPT 訂閱帳號 OAuth 認證的完整 API 端點參考。

---

## 目錄

1. [Claude (Anthropic) API](#1-claude-anthropic-api)
2. [ChatGPT (OpenAI Codex) API](#2-chatgpt-openai-codex-api)
3. [通用工具函數](#3-通用工具函數)
4. [錯誤代碼參考](#4-錯誤代碼參考)

---

## 1. Claude (Anthropic) API

### 1.1 配置常數

```javascript
const CLAUDE_CONFIG = {
    CLIENT_ID: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    AUTH_URL: "https://claude.ai/oauth/authorize",
    TOKEN_URL: "https://console.anthropic.com/v1/oauth/token",
    API_URL: "https://api.anthropic.com/v1/messages",
    REDIRECT_URI: "https://console.anthropic.com/oauth/code/callback",
    SCOPE: "org:create_api_key user:profile user:inference"
};
```

---

### 1.2 OAuth 授權端點

#### 建構授權 URL

```
GET https://claude.ai/oauth/authorize
```

**Query Parameters:**

| 參數 | 類型 | 必填 | 說明 |
|-----|------|-----|------|
| `client_id` | string | ✅ | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` |
| `response_type` | string | ✅ | 固定為 `code` |
| `redirect_uri` | string | ✅ | `https://console.anthropic.com/oauth/code/callback` |
| `scope` | string | ✅ | `org:create_api_key user:profile user:inference` |
| `code_challenge` | string | ✅ | PKCE challenge (SHA256 + Base64URL) |
| `code_challenge_method` | string | ✅ | 固定為 `S256` |
| `state` | string | ✅ | PKCE verifier（用於後續驗證） |
| `code` | string | ✅ | 固定為 `true` |

**範例 URL:**

```
https://claude.ai/oauth/authorize?
  client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&
  response_type=code&
  redirect_uri=https://console.anthropic.com/oauth/code/callback&
  scope=org:create_api_key%20user:profile%20user:inference&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256&
  state=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&
  code=true
```

**回應:**

使用者授權後，頁面會顯示授權碼，格式為：`{code}#{state}`

---

### 1.3 Token 交換端點

#### 用授權碼換取 Token

```
POST https://console.anthropic.com/v1/oauth/token
```

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
    "code": "授權碼部分（#前面）",
    "state": "狀態部分（#後面）",
    "grant_type": "authorization_code",
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    "redirect_uri": "https://console.anthropic.com/oauth/code/callback",
    "code_verifier": "原始 PKCE verifier"
}
```

**Response (200 OK):**

```json
{
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4..."
}
```

---

### 1.4 Token 刷新端點

```
POST https://console.anthropic.com/v1/oauth/token
```

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

**Request Body:**

```json
{
    "grant_type": "refresh_token",
    "refresh_token": "你的 refresh_token",
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
}
```

**Response (200 OK):**

```json
{
    "access_token": "新的 access_token",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "新的或原有的 refresh_token"
}
```

---

### 1.5 Messages API 端點

#### 發送訊息（OAuth 認證）

```
POST https://api.anthropic.com/v1/messages?beta=true
```

**⚠️ 重要：URL 必須包含 `?beta=true` 參數**

**Headers:**

| Header | Value | 必填 |
|--------|-------|-----|
| `Authorization` | `Bearer {access_token}` | ✅ |
| `Content-Type` | `application/json` | ✅ |
| `anthropic-beta` | `oauth-2025-04-20,interleaved-thinking-2025-05-14` | ✅ |
| `anthropic-version` | `2023-06-01` | ✅ |
| `user-agent` | `claude-cli/2.1.2 (external, cli)` | ✅ |

**⚠️ 重要：不要包含 `x-api-key` header**

**Request Body:**

```json
{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 8192,
    "messages": [
        {
            "role": "user",
            "content": "你好！"
        }
    ],
    "stream": false
}
```

**帶系統提示的請求：**

```json
{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 8192,
    "system": "你是一個友善的助手。",
    "messages": [
        {
            "role": "user",
            "content": "你好！"
        }
    ],
    "stream": false
}
```

**⚠️ 注意：系統提示不能包含 "OpenCode" 字樣，需替換為 "Claude Code"**

**帶工具的請求：**

```json
{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 8192,
    "messages": [
        {
            "role": "user",
            "content": "台北今天天氣如何？"
        }
    ],
    "tools": [
        {
            "name": "mcp_get_weather",
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
    ],
    "stream": false
}
```

**⚠️ 重要：工具名稱必須加上 `mcp_` 前綴**

**Response (200 OK) - 非串流：**

```json
{
    "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
    "type": "message",
    "role": "assistant",
    "content": [
        {
            "type": "text",
            "text": "你好！我是 Claude，很高興為你服務。"
        }
    ],
    "model": "claude-sonnet-4-20250514",
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "usage": {
        "input_tokens": 10,
        "output_tokens": 25
    }
}
```

**Response - 串流 (stream: true):**

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_xxx","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-20250514"}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"！"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":25}}

event: message_stop
data: {"type":"message_stop"}
```

---

### 1.6 支援的模型

| Model ID | 名稱 | Context Window |
|----------|------|---------------|
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | 200K |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet | 200K |
| `claude-3-opus-20240229` | Claude 3 Opus | 200K |
| `claude-3-haiku-20240307` | Claude 3 Haiku | 200K |

---

## 2. ChatGPT (OpenAI Codex) API

### 2.1 配置常數

```javascript
const CHATGPT_CONFIG = {
    CLIENT_ID: "app_EMoamEEZ73f0CkXaXp7hrann",
    ISSUER: "https://auth.openai.com",
    TOKEN_URL: "https://auth.openai.com/oauth/token",
    CODEX_API: "https://chatgpt.com/backend-api/codex/responses",
    CALLBACK_PORT: 1455,
    SCOPE: "openid email profile offline_access"
};
```

---

### 2.2 OAuth 授權端點

#### 建構授權 URL

```
GET https://auth.openai.com/oauth/authorize
```

**Query Parameters:**

| 參數 | 類型 | 必填 | 說明 |
|-----|------|-----|------|
| `client_id` | string | ✅ | `app_EMoamEEZ73f0CkXaXp7hrann` |
| `redirect_uri` | string | ✅ | `http://localhost:1455/callback` |
| `response_type` | string | ✅ | 固定為 `code` |
| `scope` | string | ✅ | `openid email profile offline_access` |
| `state` | string | ✅ | 隨機字串（防 CSRF） |
| `code_challenge` | string | ✅ | PKCE challenge |
| `code_challenge_method` | string | ✅ | 固定為 `S256` |
| `id_token_add_organizations` | string | ✅ | 固定為 `true` |
| `codex_cli_simplified_flow` | string | ✅ | 固定為 `true` |
| `originator` | string | ✅ | 固定為 `opencode` |

**範例 URL:**

```
https://auth.openai.com/oauth/authorize?
  client_id=app_EMoamEEZ73f0CkXaXp7hrann&
  redirect_uri=http://localhost:1455/callback&
  response_type=code&
  scope=openid%20email%20profile%20offline_access&
  state=abc123&
  code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
  code_challenge_method=S256&
  id_token_add_organizations=true&
  codex_cli_simplified_flow=true&
  originator=opencode
```

**回應:**

授權成功後重定向到：
```
http://localhost:1455/callback?code=授權碼&state=abc123
```

---

### 2.3 Token 交換端點

```
POST https://auth.openai.com/oauth/token
```

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/x-www-form-urlencoded` |

**Request Body (URL-encoded):**

```
grant_type=authorization_code&
code=授權碼&
redirect_uri=http://localhost:1455/callback&
client_id=app_EMoamEEZ73f0CkXaXp7hrann&
code_verifier=原始PKCE_verifier
```

**Response (200 OK):**

```json
{
    "access_token": "eyJhbGciOiJSUzI1NiIs...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "v1.MjAyNS0wMS0yMFQw...",
    "id_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**從 id_token 提取 account_id:**

```javascript
// id_token 是 JWT，解碼 payload 部分
const payload = id_token.split('.')[1];
const decoded = JSON.parse(atob(payload));
const accountId = decoded.chatgpt_account_id;
```

---

### 2.4 Token 刷新端點

```
POST https://auth.openai.com/oauth/token
```

**Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/x-www-form-urlencoded` |

**Request Body (URL-encoded):**

```
grant_type=refresh_token&
refresh_token=你的refresh_token&
client_id=app_EMoamEEZ73f0CkXaXp7hrann
```

**Response (200 OK):**

```json
{
    "access_token": "新的 access_token",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "新的 refresh_token"
}
```

---

### 2.5 Codex API 端點

#### 發送訊息

```
POST https://chatgpt.com/backend-api/codex/responses
```

**⚠️ 注意：這不是標準的 OpenAI API 端點**

**Headers:**

| Header | Value | 必填 |
|--------|-------|-----|
| `Authorization` | `Bearer {access_token}` | ✅ |
| `Content-Type` | `application/json` | ✅ |
| `ChatGPT-Account-Id` | `{account_id}` | ✅ |

**Request Body:**

```json
{
    "model": "gpt-5-codex-mini",
    "instructions": "You are a helpful assistant.",
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "Hello!"
                }
            ]
        }
    ],
    "stream": true,
    "store": false
}
```

**⚠️ 重要限制：**
- `stream` 必須為 `true`（不支援非串流模式）
- 使用 `instructions` 而非 `system`
- 使用 `input` 陣列而非 `messages`
- 每個訊息內容使用 `input_text` 類型

**多輪對話請求：**

```json
{
    "model": "gpt-5-codex-mini",
    "instructions": "You are a helpful assistant.",
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                { "type": "input_text", "text": "Hello!" }
            ]
        },
        {
            "type": "message",
            "role": "assistant",
            "content": [
                { "type": "output_text", "text": "Hello! How can I help you?" }
            ]
        },
        {
            "type": "message",
            "role": "user",
            "content": [
                { "type": "input_text", "text": "What is 2+2?" }
            ]
        }
    ],
    "stream": true,
    "store": false
}
```

**Response (SSE Stream):**

```
data: {"type":"response.created","response":{"id":"resp_xxx","object":"response","status":"in_progress"}}

data: {"type":"response.output_item.added","item":{"type":"message","role":"assistant"}}

data: {"type":"response.content_part.added","part":{"type":"output_text","text":""}}

data: {"type":"response.output_text.delta","delta":"Hello"}

data: {"type":"response.output_text.delta","delta":"!"}

data: {"type":"response.output_text.done","text":"Hello!"}

data: {"type":"response.completed","response":{"id":"resp_xxx","status":"completed"}}

data: [DONE]
```

---

### 2.6 支援的模型

| Model ID | 說明 | 推薦用途 |
|----------|------|---------|
| `gpt-5` | 基礎 GPT-5 | 通用任務 |
| `gpt-5-codex` | 程式碼優化版 | 編程任務 |
| `gpt-5-codex-mini` | 輕量快速版 | 快速回應、翻譯 |
| `gpt-5.1` | 更新版本 | 更強推理 |
| `gpt-5.1-codex` | 5.1 程式碼版 | 複雜編程 |
| `gpt-5.1-codex-max` | 最強版本 | 複雜任務 |
| `gpt-5.2` | 最新版本 | 最強推理 |

**⚠️ 不支援的模型：**
- `gpt-4`
- `gpt-4-turbo`
- `gpt-4o`
- `gpt-3.5-turbo`

---

## 3. 通用工具函數

### 3.1 PKCE 生成

```javascript
async function generatePKCE() {
    // 生成 code_verifier (43-128 字元的隨機字串)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const verifier = btoa(String.fromCharCode(...array))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    
    // 生成 code_challenge (SHA256 + Base64URL)
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    
    return { verifier, challenge };
}
```

### 3.2 Python 版本

```python
import secrets
import hashlib
import base64

def generate_pkce():
    # 生成 code_verifier
    verifier = secrets.token_urlsafe(32)
    
    # 生成 code_challenge
    challenge = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(challenge).decode().rstrip('=')
    
    return verifier, challenge
```

### 3.3 JWT 解碼（不驗證簽名）

```javascript
function decodeJWT(token) {
    const [header, payload, signature] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    return decoded;
}
```

```python
import json
import base64

def decode_jwt(token):
    payload = token.split('.')[1]
    # 添加 padding
    payload += '=' * (4 - len(payload) % 4)
    decoded = base64.urlsafe_b64decode(payload)
    return json.loads(decoded)
```

---

## 4. 錯誤代碼參考

### 4.1 Claude API 錯誤

| HTTP 狀態碼 | 錯誤類型 | 說明 | 處理方式 |
|------------|---------|------|---------|
| 400 | `invalid_request_error` | 請求格式錯誤 | 檢查請求參數 |
| 401 | `authentication_error` | 認證失敗 | 刷新 Token 或重新登入 |
| 403 | `permission_error` | 權限不足 | 檢查 scope 或訂閱狀態 |
| 404 | `not_found_error` | 資源不存在 | 檢查 URL |
| 429 | `rate_limit_error` | 超過速率限制 | 等待後重試 |
| 500 | `api_error` | 伺服器錯誤 | 稍後重試 |
| 529 | `overloaded_error` | API 過載 | 稍後重試 |

### 4.2 ChatGPT Codex API 錯誤

| HTTP 狀態碼 | 說明 | 處理方式 |
|------------|------|---------|
| 400 | 請求格式錯誤 | 檢查請求參數，確認使用 GPT-5 模型 |
| 401 | 認證失敗 | 刷新 Token 或重新登入 |
| 403 | 權限不足 | 檢查 ChatGPT-Account-Id header |
| 429 | 超過速率限制 | 等待後重試 |
| 500 | 伺服器錯誤 | 稍後重試 |

### 4.3 OAuth 錯誤

| 錯誤代碼 | 說明 | 處理方式 |
|---------|------|---------|
| `invalid_grant` | 授權碼無效或已過期 | 重新發起授權流程 |
| `invalid_client` | Client ID 無效 | 檢查 Client ID |
| `invalid_scope` | 請求的 scope 無效 | 檢查 scope 參數 |
| `access_denied` | 使用者拒絕授權 | 提示使用者重新授權 |
| `expired_token` | Token 已過期 | 使用 refresh_token 刷新 |

---

## 附錄 A：請求範例彙總

### Claude OAuth 完整範例

```bash
# 1. Token 交換
curl -X POST "https://console.anthropic.com/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "YOUR_CODE",
    "state": "YOUR_STATE",
    "grant_type": "authorization_code",
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    "redirect_uri": "https://console.anthropic.com/oauth/code/callback",
    "code_verifier": "YOUR_VERIFIER"
  }'

# 2. 發送訊息
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

# 3. Token 刷新
curl -X POST "https://console.anthropic.com/v1/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "refresh_token",
    "refresh_token": "YOUR_REFRESH_TOKEN",
    "client_id": "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
  }'
```

### ChatGPT Codex 完整範例

```bash
# 1. Token 交換
curl -X POST "https://auth.openai.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=YOUR_CODE&redirect_uri=http://localhost:1455/callback&client_id=app_EMoamEEZ73f0CkXaXp7hrann&code_verifier=YOUR_VERIFIER"

# 2. 發送訊息
curl -X POST "https://chatgpt.com/backend-api/codex/responses" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "ChatGPT-Account-Id: YOUR_ACCOUNT_ID" \
  -d '{
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
  }'

# 3. Token 刷新
curl -X POST "https://auth.openai.com/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&client_id=app_EMoamEEZ73f0CkXaXp7hrann"
```

---

## 附錄 B：Header 對照表

### Claude OAuth vs API Key

| Header | OAuth 認證 | API Key 認證 |
|--------|-----------|-------------|
| Authorization | `Bearer {token}` | ❌ 不使用 |
| x-api-key | ❌ 不使用 | `sk-ant-xxx` |
| anthropic-beta | ✅ 必須 | 可選 |
| anthropic-version | ✅ 必須 | ✅ 必須 |
| user-agent | ✅ 必須偽裝 | 任意 |
| URL 參數 | `?beta=true` | 無 |

### ChatGPT Codex vs 標準 API

| 特性 | Codex API | 標準 API |
|------|----------|---------|
| 端點 | `chatgpt.com/backend-api/codex/responses` | `api.openai.com/v1/chat/completions` |
| 認證 | OAuth Token | API Key |
| Account ID Header | ✅ 必須 | ❌ 不需要 |
| 請求格式 | `input` + `instructions` | `messages` + `system` |
| 串流 | ✅ 必須 | 可選 |
| 支援模型 | GPT-5 系列 | GPT-3.5/4 系列 |

---

*文件最後更新：2026-01-20*
