# AI 訂閱帳號認證架構指南

> 本文件說明如何使用 Claude Pro/Max 和 ChatGPT Plus/Pro 訂閱帳號進行 OAuth 認證，繞過 API Key 付費限制。

---

## 目錄

1. [架構概述](#1-架構概述)
2. [認證類型比較](#2-認證類型比較)
3. [Claude OAuth 認證](#3-claude-oauth-認證)
4. [ChatGPT Codex 認證](#4-chatgpt-codex-認證)
5. [Token 生命週期管理](#5-token-生命週期管理)
6. [Extension 開發注意事項](#6-extension-開發注意事項)
7. [安全性與法律考量](#7-安全性與法律考量)

---

## 1. 架構概述

### 1.1 核心概念

傳統 API 呼叫需要付費購買 API Key，但訂閱帳號（Claude Pro/Max、ChatGPT Plus/Pro）可以透過 OAuth 認證使用訂閱額度：

```
┌─────────────────────────────────────────────────────────────────┐
│                    訂閱帳號 vs API Key                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   傳統 API Key 方式：                                            │
│   ┌─────────┐    API Key     ┌─────────────┐                   │
│   │  應用程式 │───────────────▶│  AI Provider │                   │
│   └─────────┘   (付費購買)    │  標準 API   │                   │
│                              └─────────────┘                   │
│                                                                 │
│   訂閱帳號 OAuth 方式：                                          │
│   ┌─────────┐   OAuth Token   ┌─────────────┐                   │
│   │  應用程式 │───────────────▶│  AI Provider │                   │
│   └─────────┘   (訂閱額度)    │  特殊 API   │                   │
│                              └─────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 支援的 Provider

| Provider | 訂閱方案 | OAuth 支援 | API 端點 |
|----------|---------|-----------|---------|
| **Claude (Anthropic)** | Pro / Max | ✅ | `api.anthropic.com/v1/messages?beta=true` |
| **ChatGPT (OpenAI)** | Plus / Pro | ✅ | `chatgpt.com/backend-api/codex/responses` |

### 1.3 認證流程概覽

```
┌─────────┐      ┌──────────────┐      ┌─────────────┐      ┌───────────┐
│  使用者  │      │   應用程式    │      │  OAuth 端點  │      │  AI API   │
└────┬────┘      └──────┬───────┘      └──────┬──────┘      └─────┬─────┘
     │                  │                     │                   │
     │ 1. 發起登入      │                     │                   │
     │─────────────────▶│                     │                   │
     │                  │ 2. 重定向授權        │                   │
     │◀─────────────────│                     │                   │
     │                  │                     │                   │
     │ 3. 使用者授權    │                     │                   │
     │──────────────────────────────────────▶│                   │
     │                  │                     │                   │
     │ 4. 返回授權碼    │                     │                   │
     │◀──────────────────────────────────────│                   │
     │                  │                     │                   │
     │ 5. 提交授權碼    │                     │                   │
     │─────────────────▶│ 6. 換取 Token       │                   │
     │                  │────────────────────▶│                   │
     │                  │ 7. 返回 Token       │                   │
     │                  │◀────────────────────│                   │
     │                  │                     │                   │
     │                  │ 8. 使用 Token 呼叫 API                  │
     │                  │────────────────────────────────────────▶│
     │                  │ 9. AI 回應                              │
     │                  │◀────────────────────────────────────────│
     │ 10. 顯示結果     │                     │                   │
     │◀─────────────────│                     │                   │
```

---

## 2. 認證類型比較

### 2.1 三種認證方式

| 方式 | 說明 | 適用場景 |
|------|------|---------|
| **API Key** | 直接使用付費 API Key | 正式專案、高穩定性需求 |
| **OAuth Token** | 使用訂閱帳號的 OAuth 認證 | 個人使用、學習研究 |
| **Session Token** | 從瀏覽器提取的 Session Cookie | 臨時測試（不穩定） |

### 2.2 認證資料結構

```typescript
// API Key 認證
type ApiAuth = {
    type: "api";
    key: string;  // 如 "sk-ant-api03-xxx" 或 "sk-xxx"
};

// OAuth 認證
type OAuthAuth = {
    type: "oauth";
    access: string;       // Access Token
    refresh: string;      // Refresh Token
    expires: number;      // 過期時間 (Unix timestamp)
    accountId?: string;   // 帳號 ID（ChatGPT 需要）
};
```

### 2.3 比較表

| 特性 | API Key | OAuth Token | Session Token |
|------|---------|-------------|---------------|
| **費用** | 按用量付費 | 訂閱費用 | 訂閱費用 |
| **穩定性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **設定難度** | 簡單 | 中等 | 困難 |
| **Token 有效期** | 永久 | ~1 小時 | 不定 |
| **自動刷新** | 不需要 | 需要 | 需手動更新 |
| **官方支援** | ✅ | ⚠️ 非公開 | ❌ |

---

## 3. Claude OAuth 認證

### 3.1 核心配置

```javascript
// Claude OAuth 配置常數
const CLAUDE_CONFIG = {
    CLIENT_ID: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    AUTH_URL: "https://claude.ai/oauth/authorize",
    TOKEN_URL: "https://console.anthropic.com/v1/oauth/token",
    API_URL: "https://api.anthropic.com/v1/messages",
    REDIRECT_URI: "https://console.anthropic.com/oauth/code/callback",
    SCOPE: "org:create_api_key user:profile user:inference"
};
```

### 3.2 授權 URL 建構

```javascript
function buildAuthUrl() {
    const { verifier, challenge } = generatePKCE();
    
    const params = new URLSearchParams({
        client_id: CLAUDE_CONFIG.CLIENT_ID,
        response_type: "code",
        redirect_uri: CLAUDE_CONFIG.REDIRECT_URI,
        scope: CLAUDE_CONFIG.SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: verifier,
        code: "true"
    });
    
    return {
        url: `${CLAUDE_CONFIG.AUTH_URL}?${params}`,
        verifier
    };
}
```

### 3.3 Token 交換

授權碼格式為 `code#state`，需要分割處理：

```javascript
async function exchangeToken(authCode, verifier) {
    const [code, state] = authCode.split("#");
    
    const response = await fetch(CLAUDE_CONFIG.TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            code,
            state,
            grant_type: "authorization_code",
            client_id: CLAUDE_CONFIG.CLIENT_ID,
            redirect_uri: CLAUDE_CONFIG.REDIRECT_URI,
            code_verifier: verifier
        })
    });
    
    return response.json();
}
```

### 3.4 API 請求設置

**關鍵差異**：OAuth 認證需要特殊的 URL 和 Headers：

```javascript
// ❌ 標準 API Key 方式
const standardHeaders = {
    "x-api-key": "sk-ant-api03-xxx",
    "anthropic-version": "2023-06-01"
};
const standardUrl = "https://api.anthropic.com/v1/messages";

// ✅ OAuth Token 方式
const oauthHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14",
    "anthropic-version": "2023-06-01",
    "user-agent": "claude-cli/2.1.2 (external, cli)"
};
const oauthUrl = "https://api.anthropic.com/v1/messages?beta=true";
```

### 3.5 重要限制

| 限制項目 | 說明 |
|---------|------|
| **URL 參數** | 必須加上 `?beta=true` |
| **Beta Header** | 必須包含 `oauth-2025-04-20` |
| **User-Agent** | 必須偽裝成 `claude-cli/2.1.2` |
| **工具名稱** | 需要加上 `mcp_` 前綴 |
| **系統提示** | 不能包含 "OpenCode" 字樣 |

---

## 4. ChatGPT Codex 認證

### 4.1 核心配置

ChatGPT 使用 **Codex API** 而非標準 OpenAI API：

```javascript
// ChatGPT Codex 配置常數
const CHATGPT_CONFIG = {
    CLIENT_ID: "app_EMoamEEZ73f0CkXaXp7hrann",
    ISSUER: "https://auth.openai.com",
    CODEX_API: "https://chatgpt.com/backend-api/codex/responses",
    CALLBACK_PORT: 1455,
    SCOPE: "openid email profile offline_access"
};
```

### 4.2 端點差異

```
┌─────────────────────────────────────────────────────────────────┐
│                    API 端點比較                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   標準 OpenAI API（API Key 用戶）：                              │
│   POST https://api.openai.com/v1/chat/completions               │
│                                                                 │
│   Codex API（訂閱用戶）：                                        │
│   POST https://chatgpt.com/backend-api/codex/responses          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 授權 URL 建構

```javascript
function buildAuthUrl() {
    const { verifier, challenge } = generatePKCE();
    const state = generateRandomState();
    
    const params = new URLSearchParams({
        client_id: CHATGPT_CONFIG.CLIENT_ID,
        redirect_uri: `http://localhost:${CHATGPT_CONFIG.CALLBACK_PORT}/callback`,
        response_type: "code",
        scope: CHATGPT_CONFIG.SCOPE,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "opencode"
    });
    
    return {
        url: `${CHATGPT_CONFIG.ISSUER}/oauth/authorize?${params}`,
        verifier,
        state
    };
}
```

### 4.4 API 請求設置

```javascript
const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "ChatGPT-Account-Id": accountId  // 從 id_token 中提取
};

// 請求格式與標準 OpenAI 不同
const payload = {
    model: "gpt-5-codex-mini",  // 只支援 GPT-5 系列
    instructions: "You are a helpful assistant.",
    input: [
        {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello!" }]
        }
    ],
    stream: true,  // 必須為 true
    store: false
};
```

### 4.5 支援的模型

| Model ID | 說明 | 適用場景 |
|----------|------|---------|
| `gpt-5` | 基礎 GPT-5 | 通用任務 |
| `gpt-5-codex` | 程式碼優化版 | 編程任務 |
| `gpt-5-codex-mini` | 輕量快速版 | 快速回應、翻譯 |
| `gpt-5.1` | 更新版本 | 更強推理 |
| `gpt-5.1-codex` | 5.1 程式碼版 | 複雜編程 |
| `gpt-5.1-codex-max` | 最強版本 | 需要 xhigh reasoning |
| `gpt-5.2` | 最新版本 | 最強推理能力 |

**重要**：Codex API **不支援** GPT-4 系列模型。

---

## 5. Token 生命週期管理

### 5.1 Token 有效期

| Provider | Access Token 有效期 | Refresh Token 有效期 |
|----------|-------------------|---------------------|
| Claude | ~1 小時 | 較長（具體未公開） |
| ChatGPT | ~1 小時 | 較長（具體未公開） |

### 5.2 自動刷新機制

```javascript
class TokenManager {
    constructor(config) {
        this.config = config;
        this.auth = null;
    }
    
    // 檢查是否需要刷新（提前 5 分鐘）
    needsRefresh() {
        if (!this.auth || this.auth.type !== "oauth") return false;
        const buffer = 5 * 60 * 1000; // 5 分鐘
        return Date.now() > (this.auth.expires - buffer);
    }
    
    // 刷新 Token
    async refresh() {
        const response = await fetch(this.config.TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "refresh_token",
                refresh_token: this.auth.refresh,
                client_id: this.config.CLIENT_ID
            })
        });
        
        const tokens = await response.json();
        
        this.auth = {
            type: "oauth",
            access: tokens.access_token,
            refresh: tokens.refresh_token || this.auth.refresh,
            expires: Date.now() + tokens.expires_in * 1000
        };
        
        return this.auth;
    }
    
    // 取得有效 Token（自動刷新）
    async getValidToken() {
        if (this.needsRefresh()) {
            await this.refresh();
        }
        return this.auth.access;
    }
}
```

### 5.3 錯誤處理與重試

```javascript
async function callAPIWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            
            if (response.status === 401) {
                // Token 失效，嘗試刷新
                await tokenManager.refresh();
                options.headers.Authorization = `Bearer ${tokenManager.auth.access}`;
                continue;
            }
            
            if (response.status === 429) {
                // Rate limit，指數退避
                await sleep(Math.pow(2, i) * 1000);
                continue;
            }
            
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
        }
    }
}
```

---

## 6. Extension 開發注意事項

### 6.1 桌面應用 vs Extension 差異

```
┌─────────────────────────────────────────────────────────────────┐
│              桌面應用 vs Browser Extension                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   桌面應用（如 OpenCode）：                                       │
│   ✅ 可存取檔案系統                                              │
│   ✅ 可運行本地 Server                                           │
│   ✅ 持久化儲存安全                                              │
│   ✅ OAuth callback 容易處理                                     │
│                                                                 │
│   Browser Extension：                                           │
│   ❌ 無法存取檔案系統                                            │
│   ❌ 無法運行本地 Server                                         │
│   ⚠️ Storage 有限制且易被清除                                    │
│   ⚠️ Service Worker 生命週期不持久                               │
│   ⚠️ OAuth callback 需特殊處理                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Extension 儲存方案

```javascript
// ✅ 推薦：使用 chrome.storage.local
await chrome.storage.local.set({
    auth: {
        type: "oauth",
        access: accessToken,
        refresh: refreshToken,
        expires: expiresAt
    }
});

// ❌ 不推薦：使用 localStorage（易被清除）
localStorage.setItem("auth", JSON.stringify(auth));
```

### 6.3 Service Worker 重啟處理

```javascript
// background.js (Service Worker)

// ❌ 問題：變數在 SW 重啟後消失
let cachedAuth = null;

// ✅ 解決方案：每次都從 storage 載入
async function getAuth() {
    const result = await chrome.storage.local.get("auth");
    return result.auth;
}

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    const auth = await getAuth();
    // 使用 auth...
});
```

### 6.4 OAuth Callback 處理

Extension 可使用 `chrome.identity` API：

```javascript
// manifest.json
{
    "permissions": ["identity"],
    "oauth2": {
        "client_id": "YOUR_CLIENT_ID",
        "scopes": ["openid", "email", "profile"]
    }
}

// oauth.js
async function startOAuthFlow() {
    const redirectUrl = chrome.identity.getRedirectURL();
    
    const authUrl = new URL(AUTH_ENDPOINT);
    authUrl.searchParams.set("redirect_uri", redirectUrl);
    // ... 其他參數
    
    const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
    });
    
    // 解析 responseUrl 取得 code
    const url = new URL(responseUrl);
    const code = url.searchParams.get("code");
    
    // 換取 token...
}
```

### 6.5 推薦架構：Backend Proxy

```
┌─────────────────────────────────────────────────────────────────┐
│                    推薦：Backend Proxy 架構                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐      ┌──────────────────┐      ┌───────────┐ │
│   │  Browser    │      │   Your Backend   │      │  Claude/  │ │
│   │  Extension  │─────▶│   Server         │─────▶│  OpenAI   │ │
│   │             │      │                  │      │   API     │ │
│   └─────────────┘      └──────────────────┘      └───────────┘ │
│                               │                               │
│                               ▼                               │
│                       ┌───────────────┐                       │
│                       │ 後端負責：     │                       │
│                       │ - 認證管理     │                       │
│                       │ - Token 刷新   │                       │
│                       │ - 安全儲存     │                       │
│                       │ - 錯誤處理     │                       │
│                       └───────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 安全性與法律考量

### 7.1 風險評估

| 風險類型 | 說明 | 等級 |
|---------|------|-----|
| **帳號封禁** | 違反 ToS 可能導致帳號被封 | 🟡 中 |
| **API 變更** | 非公開 API 可能隨時變更 | 🟠 中高 |
| **Client ID 失效** | Provider 可能撤銷 Client ID | 🟠 中高 |
| **Token 洩漏** | 不當儲存可能導致 Token 外洩 | 🔴 高 |

### 7.2 服務條款考量

- 這些方法使用的是**非公開 API**
- 可能違反各 Provider 的服務條款
- **僅建議用於學習和研究**
- 正式專案建議使用官方 API

### 7.3 安全建議

```javascript
// ✅ 加密儲存 Token
import { encrypt, decrypt } from './crypto';

async function saveToken(token) {
    const encrypted = await encrypt(token, secretKey);
    await chrome.storage.local.set({ auth: encrypted });
}

// ✅ 不要硬編碼敏感資訊
// ❌ const API_KEY = "sk-ant-xxx";
// ✅ 讓使用者輸入或從安全來源取得

// ✅ 使用 HTTPS
// ✅ 驗證 OAuth state 防止 CSRF
// ✅ 限制 Token 權限範圍（scope）
```

### 7.4 使用建議總結

| 場景 | 建議方案 |
|------|---------|
| **正式專案** | 使用官方 API Key |
| **個人學習** | OAuth Token（本文方法） |
| **臨時測試** | Session Token |
| **Extension 開發** | Backend Proxy + OAuth |

---

## 附錄 A：PKCE 實作

```javascript
function generatePKCE() {
    // 生成 code_verifier (43-128 字元)
    const verifier = crypto.randomUUID().replace(/-/g, '') + 
                     crypto.randomUUID().replace(/-/g, '');
    
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

---

## 附錄 B：常見問題

### Q1: Token 過期後會發生什麼？

OAuth Token 過期後，API 會返回 401 錯誤。需要使用 Refresh Token 取得新的 Access Token。

### Q2: 為什麼 ChatGPT 不能用 GPT-4？

Codex API 是專為 coding agent 設計的端點，只支援 GPT-5 系列模型。

### Q3: Claude 的 `mcp_` 前綴是什麼？

這是 MCP (Model Context Protocol) 工具的命名規範，Claude OAuth API 要求工具名稱必須帶有此前綴。

### Q4: Extension 的 Token 會被清除嗎？

`chrome.storage.local` 相對穩定，但以下情況可能清除：
- 使用者手動清除擴充功能資料
- 擴充功能被移除後重新安裝
- 瀏覽器重大更新

---

*文件最後更新：2026-01-20*
*基於 OpenCode、opencode-anthropic-auth 插件分析*
