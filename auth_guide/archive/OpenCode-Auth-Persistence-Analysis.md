# OpenCode 認證持久化機制分析

## 為什麼 OpenCode 登入後可以持續使用？而 Extension 會失敗？

---

## 1. OpenCode 的認證持久化機制

### 1.1 核心架構

OpenCode 使用 **Server-Side 認證管理**，這是它能持久化的關鍵：

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenCode 認證架構                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐      ┌──────────────────┐      ┌───────────┐ │
│   │  OpenCode   │      │   OpenCode       │      │  本地檔案  │ │
│   │    CLI      │─────▶│   Server         │─────▶│  系統     │ │
│   │   (前端)    │      │  (localhost)     │      │           │ │
│   └─────────────┘      └──────────────────┘      └───────────┘ │
│                               │                       │         │
│                               │                       ▼         │
│                               │              ┌───────────────┐  │
│                               │              │ ~/.config/    │  │
│                               │              │ opencode/     │  │
│                               │              │  - auth.json  │  │
│                               │              │  - state.json │  │
│                               └─────────────▶│  - tokens/    │  │
│                                              └───────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 認證儲存位置

OpenCode Server 將認證資訊儲存在**本地檔案系統**：

```bash
# Linux
~/.config/opencode/
├── auth.json          # API Keys 和 OAuth Tokens
├── state.json         # 應用程式狀態
└── providers/
    ├── anthropic.json # Claude 認證
    └── openai.json    # OpenAI 認證

# macOS
~/Library/Application Support/opencode/

# Windows
%APPDATA%\opencode\
```

### 1.3 認證儲存格式

```json
// auth.json 範例
{
  "anthropic": {
    "type": "api",
    "key": "sk-ant-api03-xxxxx"
  },
  "openai": {
    "type": "api",
    "key": "sk-xxxxx"
  },
  "github": {
    "type": "oauth",
    "access": "gho_xxxxx",
    "refresh": "ghr_xxxxx",
    "expires": 1735689600
  }
}
```

### 1.4 Token 自動刷新機制

OpenCode Server 實作了完整的 Token 管理：

```javascript
// OpenCode Server 內部實作 (概念程式碼)

class AuthManager {
  // 檢查 Token 是否過期
  isTokenExpired(auth) {
    if (auth.type !== 'oauth') return false;
    return Date.now() > auth.expires;
  }

  // 自動刷新 Token
  async refreshTokenIfNeeded(providerId) {
    const auth = await this.loadAuth(providerId);

    if (this.isTokenExpired(auth)) {
      const newTokens = await this.refreshOAuthToken(auth.refresh);
      await this.saveAuth(providerId, {
        ...auth,
        access: newTokens.access_token,
        refresh: newTokens.refresh_token,
        expires: Date.now() + newTokens.expires_in * 1000
      });
    }

    return auth;
  }

  // API 呼叫時自動處理 401 錯誤
  async callProviderAPI(providerId, request) {
    let auth = await this.refreshTokenIfNeeded(providerId);

    try {
      return await this.makeRequest(request, auth);
    } catch (error) {
      if (error.status === 401) {
        // Token 失效，嘗試刷新
        auth = await this.forceRefreshToken(providerId);
        return await this.makeRequest(request, auth);
      }
      throw error;
    }
  }
}
```

---

## 2. 為什麼 Extension 會失敗？

### 2.1 Extension 的限制

Browser Extension 運行在**完全不同的環境**，面臨以下限制：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Extension 環境限制                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                              │
│   │  Browser    │  ❌ 無法存取檔案系統                          │
│   │  Extension  │  ❌ 無法運行本地 Server                       │
│   │             │  ❌ localStorage 有限制且不安全               │
│   │             │  ❌ 跨域請求有 CORS 限制                      │
│   │             │  ❌ Service Worker 生命週期不持久             │
│   └─────────────┘                                              │
│                                                                 │
│   可用的儲存方式：                                               │
│   ┌─────────────────────────────────────────────────┐          │
│   │  chrome.storage.local   │ 5MB 限制，非加密      │          │
│   │  chrome.storage.sync    │ 100KB 限制，同步      │          │
│   │  localStorage           │ 5-10MB，易被清除      │          │
│   │  IndexedDB              │ 較大，但複雜          │          │
│   └─────────────────────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 常見失敗原因

#### 原因 1：儲存被清除

```javascript
// ❌ 問題：使用 localStorage，容易被清除
localStorage.setItem('anthropic_key', 'sk-ant-xxx');

// 以下情況會導致 Token 遺失：
// - 使用者清除瀏覽器資料
// - 無痕模式
// - 瀏覽器更新
// - Storage 達到限制
```

#### 原因 2：Service Worker 重啟

```javascript
// ❌ 問題：Service Worker 會被瀏覽器終止
// manifest.json
{
  "background": {
    "service_worker": "background.js"
  }
}

// background.js
let cachedAuth = null;  // ❌ 記憶體變數在 SW 重啟後消失

chrome.runtime.onMessage.addListener((msg) => {
  // SW 可能已重啟，cachedAuth 已是 null
  if (!cachedAuth) {
    // 需要重新從 storage 載入
  }
});
```

#### 原因 3：OAuth Callback 問題

```javascript
// ❌ 問題：Extension 無法接收 OAuth callback
// OAuth 流程需要 redirect_uri，但 Extension 的 URL 格式特殊

// Extension URL 格式：
// chrome-extension://abcdefg1234567/callback.html

// 很多 OAuth Provider 不接受這種格式的 redirect_uri
```

#### 原因 4：Token 刷新失敗

```javascript
// ❌ 問題：Extension 沒有實作自動 Token 刷新
async function callAPI() {
  const auth = await chrome.storage.local.get('auth');

  // 沒有檢查 Token 是否過期
  // 沒有自動刷新機制
  // Token 過期後直接失敗

  const response = await fetch('https://api.anthropic.com/...', {
    headers: { 'Authorization': `Bearer ${auth.access}` }
  });

  if (response.status === 401) {
    // ❌ 直接報錯，沒有重試機制
    throw new Error('認證失敗');
  }
}
```

---

## 3. 解決方案

### 方案 A：使用 chrome.storage + 完整的 Token 管理

```javascript
// auth-manager.js - Extension 認證管理器

class ExtensionAuthManager {
  constructor() {
    this.STORAGE_KEY = 'opencode_auth';
  }

  // 儲存認證
  async saveAuth(providerId, auth) {
    const allAuth = await this.loadAllAuth();
    allAuth[providerId] = {
      ...auth,
      savedAt: Date.now()
    };
    await chrome.storage.local.set({ [this.STORAGE_KEY]: allAuth });
  }

  // 載入認證
  async loadAuth(providerId) {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY]?.[providerId] || null;
  }

  // 載入所有認證
  async loadAllAuth() {
    const result = await chrome.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || {};
  }

  // 檢查 Token 是否過期（提前 5 分鐘視為過期）
  isTokenExpired(auth) {
    if (auth.type !== 'oauth') return false;
    const buffer = 5 * 60 * 1000; // 5 分鐘緩衝
    return Date.now() > (auth.expires - buffer);
  }

  // 刷新 OAuth Token
  async refreshOAuthToken(providerId, auth) {
    // 根據不同 Provider 實作刷新邏輯
    const refreshEndpoints = {
      github: 'https://github.com/login/oauth/access_token',
      // ... 其他 Provider
    };

    const response = await fetch(refreshEndpoints[providerId], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: auth.refresh,
        client_id: YOUR_CLIENT_ID,
        client_secret: YOUR_CLIENT_SECRET, // ⚠️ 不應放在 Extension
      })
    });

    if (!response.ok) {
      throw new Error('Token 刷新失敗');
    }

    const tokens = await response.json();

    const newAuth = {
      type: 'oauth',
      access: tokens.access_token,
      refresh: tokens.refresh_token || auth.refresh,
      expires: Date.now() + tokens.expires_in * 1000
    };

    await this.saveAuth(providerId, newAuth);
    return newAuth;
  }

  // 取得有效的認證（自動刷新）
  async getValidAuth(providerId) {
    let auth = await this.loadAuth(providerId);

    if (!auth) {
      throw new Error('未登入');
    }

    if (auth.type === 'oauth' && this.isTokenExpired(auth)) {
      try {
        auth = await this.refreshOAuthToken(providerId, auth);
      } catch (error) {
        // 刷新失敗，需要重新登入
        await this.clearAuth(providerId);
        throw new Error('Token 已過期，請重新登入');
      }
    }

    return auth;
  }

  // 清除認證
  async clearAuth(providerId) {
    const allAuth = await this.loadAllAuth();
    delete allAuth[providerId];
    await chrome.storage.local.set({ [this.STORAGE_KEY]: allAuth });
  }
}

// 使用範例
const authManager = new ExtensionAuthManager();

async function callClaudeAPI(message) {
  const auth = await authManager.getValidAuth('anthropic');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': auth.key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: message }]
    })
  });

  if (response.status === 401) {
    // 可能是 API Key 被撤銷
    await authManager.clearAuth('anthropic');
    throw new Error('API Key 無效，請重新設定');
  }

  return response.json();
}
```

### 方案 B：使用後端 Proxy（推薦）

```
┌─────────────────────────────────────────────────────────────────┐
│                    推薦架構：Backend Proxy                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐      ┌──────────────────┐      ┌───────────┐ │
│   │  Browser    │      │   Your Backend   │      │  Claude/  │ │
│   │  Extension  │─────▶│   Server         │─────▶│  OpenAI   │ │
│   │             │      │                  │      │   API     │ │
│   └─────────────┘      └──────────────────┘      └───────────┘ │
│         │                      │                               │
│         │                      ▼                               │
│         │              ┌───────────────┐                       │
│         │              │ - 認證管理     │                       │
│         │              │ - Token 刷新   │                       │
│         │              │ - 安全儲存     │                       │
│         │              │ - 用量控制     │                       │
│         └─────────────▶│ - 錯誤處理     │                       │
│                        └───────────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

```javascript
// Extension 端 - 只需要用戶認證
class ExtensionClient {
  constructor(backendUrl) {
    this.backendUrl = backendUrl;
    this.userToken = null;
  }

  // 用戶登入你的服務
  async login(email, password) {
    const response = await fetch(`${this.backendUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    this.userToken = data.token;

    // 儲存用戶 Token
    await chrome.storage.local.set({ userToken: data.token });
  }

  // 透過後端呼叫 AI API
  async chat(provider, message) {
    const response = await fetch(`${this.backendUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.userToken}`
      },
      body: JSON.stringify({ provider, message })
    });

    return response.json();
  }
}

// 後端 - 管理所有 AI Provider 認證
// (Node.js Express 範例)

const express = require('express');
const app = express();

// 認證中間件
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = await verifyUserToken(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
};

// 聊天 API - 處理所有 Provider
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { provider, message } = req.body;

  // 從資料庫取得用戶的 AI Provider 認證
  const auth = await getUserProviderAuth(req.user.id, provider);

  if (!auth) {
    return res.status(400).json({ error: '請先設定 API Key' });
  }

  try {
    // 根據 Provider 呼叫對應 API
    let response;
    switch (provider) {
      case 'anthropic':
        response = await callClaudeAPI(auth.key, message);
        break;
      case 'openai':
        response = await callOpenAIAPI(auth.key, message);
        break;
    }

    res.json(response);
  } catch (error) {
    if (error.status === 401) {
      // 標記認證失效
      await markAuthInvalid(req.user.id, provider);
      return res.status(401).json({ error: 'API Key 已失效，請重新設定' });
    }
    throw error;
  }
});
```

### 方案 C：使用 chrome.identity API 處理 OAuth

```javascript
// 使用 Chrome Identity API 處理 OAuth
// manifest.json
{
  "permissions": ["identity"],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["openid", "email", "profile"]
  }
}

// oauth-handler.js
async function startOAuthFlow(provider) {
  // 使用 chrome.identity.launchWebAuthFlow
  const redirectUrl = chrome.identity.getRedirectURL();

  const authUrl = new URL(getAuthEndpoint(provider));
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', getScopes(provider));

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    // 解析 callback URL 取得 code
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');

    // 用 code 換取 token
    const tokens = await exchangeCodeForTokens(provider, code);

    // 儲存 tokens
    await authManager.saveAuth(provider, {
      type: 'oauth',
      access: tokens.access_token,
      refresh: tokens.refresh_token,
      expires: Date.now() + tokens.expires_in * 1000
    });

    return tokens;
  } catch (error) {
    console.error('OAuth 失敗:', error);
    throw error;
  }
}
```

---

## 4. 比較表

| 特性 | OpenCode (桌面) | Extension (未優化) | Extension (優化後) |
|------|----------------|-------------------|-------------------|
| 認證儲存 | 本地檔案系統 | localStorage | chrome.storage.local |
| Token 刷新 | ✅ 自動 | ❌ 無 | ✅ 實作 |
| 401 重試 | ✅ 自動 | ❌ 無 | ✅ 實作 |
| 持久性 | ✅ 持久 | ❌ 易失 | ⚠️ 較好 |
| 安全性 | ✅ 可加密 | ❌ 明文 | ⚠️ 較好 |
| OAuth 支援 | ✅ 完整 | ❌ 困難 | ⚠️ 需額外處理 |

---

## 5. 最佳實踐建議

### 5.1 對於 Extension 開發

1. **使用 `chrome.storage.local`** 而非 `localStorage`
2. **實作完整的 Token 生命週期管理**
3. **處理 Service Worker 重啟情況**
4. **實作 401 錯誤重試機制**
5. **考慮使用後端 Proxy 架構**

### 5.2 安全性建議

```javascript
// ⚠️ 不要這樣做
const API_KEY = 'sk-ant-xxx';  // 硬編碼在程式碼中

// ✅ 應該這樣做
// 1. 讓用戶輸入 API Key
// 2. 加密後儲存
// 3. 或使用後端 Proxy
```

### 5.3 錯誤處理

```javascript
async function safeAPICall(fn) {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.status === 401) {
        // 嘗試刷新 Token
        await authManager.refreshToken();
        continue;
      }

      if (error.status === 429) {
        // Rate limit，等待後重試
        await sleep(Math.pow(2, i) * 1000);
        continue;
      }

      // 其他錯誤直接拋出
      throw error;
    }
  }

  throw lastError;
}
```

---

## 6. 總結

**OpenCode 能持久登入的原因：**
1. 使用本地 Server 管理認證
2. 認證儲存在檔案系統
3. 完整的 Token 自動刷新機制
4. 401 錯誤自動重試

**Extension 失敗的原因：**
1. 無法存取檔案系統
2. Storage 限制且易被清除
3. 沒有實作 Token 刷新
4. Service Worker 生命週期問題
5. OAuth callback 處理困難

**解決方案：**
1. 使用 `chrome.storage.local` + 完整 Token 管理
2. 使用後端 Proxy 架構（推薦）
3. 使用 `chrome.identity` API 處理 OAuth

---

*文件最後更新：2026-01-19*
