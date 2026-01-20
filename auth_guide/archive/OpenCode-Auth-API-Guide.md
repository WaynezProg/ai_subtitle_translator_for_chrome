# OpenCode 認證與 API 呼叫完整教學指南

> 本文件詳細說明 OpenCode 如何實作 Claude 和 ChatGPT 的認證機制，以及如何呼叫 AI 模型 API。

---

## 目錄

1. [架構概述](#1-架構概述)
2. [認證系統詳解](#2-認證系統詳解)
3. [OAuth 認證流程](#3-oauth-認證流程)
4. [API Key 認證流程](#4-api-key-認證流程)
5. [Provider 管理](#5-provider-管理)
6. [AI 模型 API 呼叫](#6-ai-模型-api-呼叫)
7. [完整程式碼範例](#7-完整程式碼範例)
8. [API 端點參考](#8-api-端點參考)

---

## 1. 架構概述

### 1.1 核心概念

OpenCode **沒有實作傳統的會員登入系統**（如帳號密碼註冊登入），而是採用 **Provider-based（提供者認證）** 架構：

```
┌─────────────────────────────────────────────────────────────┐
│                      OpenCode 架構                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐  │
│   │   使用者     │────▶│  OpenCode   │────▶│  AI Provider │  │
│   │             │     │   Server    │     │  (Claude/   │  │
│   │             │◀────│             │◀────│   OpenAI)   │  │
│   └─────────────┘     └─────────────┘     └─────────────┘  │
│                              │                              │
│                              ▼                              │
│                    ┌─────────────────┐                      │
│                    │  認證憑證儲存    │                      │
│                    │  - OAuth Token  │                      │
│                    │  - API Key      │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 支援的 AI 提供者

| Provider ID | 名稱 | 支援的模型範例 |
|-------------|------|---------------|
| `anthropic` | Anthropic | claude-3-5-sonnet, claude-3-opus |
| `openai` | OpenAI | gpt-4, gpt-4-turbo, gpt-3.5-turbo |
| `google` | Google | gemini-pro, gemini-ultra |
| `github` | GitHub Copilot | copilot-gpt-4 |

---

## 2. 認證系統詳解

### 2.1 三種認證類型

OpenCode 支援三種認證方式，定義於 SDK 的類型系統中：

```typescript
// 類型 1: OAuth 認證（適用於有 OAuth 流程的服務）
type OAuth = {
    type: "oauth";
    refresh: string;      // Refresh Token - 用於更新 Access Token
    access: string;       // Access Token - 實際用於 API 呼叫
    expires: number;      // Token 過期時間（Unix timestamp）
    accountId?: string;   // 帳號 ID（可選）
    enterpriseUrl?: string; // 企業版 URL（如 GitHub Enterprise）
};

// 類型 2: API Key 認證（最常用，適用於 Claude、OpenAI）
type ApiAuth = {
    type: "api";
    key: string;          // API Key，如 "sk-xxx" 或 "anthropic-xxx"
};

// 類型 3: Well-Known 認證（特殊用途）
type WellKnownAuth = {
    type: "wellknown";
    key: string;
    token: string;
};

// 聯合類型
type Auth = OAuth | ApiAuth | WellKnownAuth;
```

### 2.2 認證方法定義

每個 Provider 可以支援多種認證方法：

```typescript
type ProviderAuthMethod = {
    type: "oauth" | "api";  // 認證類型
    label: string;          // 顯示標籤，如 "API Key" 或 "Sign in with Google"
};
```

---

## 3. OAuth 認證流程

適用於需要 OAuth 授權的服務（如 GitHub Copilot）。

### 3.1 流程圖

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  使用者   │      │ OpenCode │      │ OpenCode │      │ Provider │
│  前端    │      │  前端    │      │  Server  │      │ (GitHub) │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │ 1. 點擊登入     │                 │                 │
     │────────────────▶│                 │                 │
     │                 │                 │                 │
     │                 │ 2. 請求授權 URL │                 │
     │                 │────────────────▶│                 │
     │                 │                 │                 │
     │                 │ 3. 返回授權 URL │                 │
     │                 │◀────────────────│                 │
     │                 │                 │                 │
     │ 4. 重定向到授權頁面               │                 │
     │◀────────────────│                 │                 │
     │                 │                 │                 │
     │ 5. 使用者授權   │                 │                 │
     │─────────────────────────────────────────────────────▶│
     │                 │                 │                 │
     │ 6. 返回授權碼 (code)              │                 │
     │◀─────────────────────────────────────────────────────│
     │                 │                 │                 │
     │ 7. 提交授權碼   │                 │                 │
     │────────────────▶│                 │                 │
     │                 │ 8. 換取 Token   │                 │
     │                 │────────────────▶│                 │
     │                 │                 │ 9. 換取 Token   │
     │                 │                 │────────────────▶│
     │                 │                 │                 │
     │                 │                 │ 10. 返回 Token  │
     │                 │                 │◀────────────────│
     │                 │                 │                 │
     │                 │ 11. 儲存認證    │                 │
     │                 │◀────────────────│                 │
     │                 │                 │                 │
     │ 12. 認證完成    │                 │                 │
     │◀────────────────│                 │                 │
     │                 │                 │                 │
```

### 3.2 步驟 1：發起授權請求

```javascript
// API: POST /provider/{providerID}/oauth/authorize
// 用途：取得 OAuth 授權 URL

const response = await fetch('/provider/github/oauth/authorize', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        method: 0,  // 認證方法索引（從 /provider/auth 取得）
    }),
});

const authorizationInfo = await response.json();
// 回應範例：
// {
//     url: "https://github.com/login/oauth/authorize?client_id=xxx&scope=xxx",
//     method: "auto",        // "auto" 自動處理 | "code" 需手動輸入
//     instructions: "請在瀏覽器中完成授權..."
// }
```

**回應類型定義：**

```typescript
type ProviderAuthAuthorization = {
    url: string;              // 授權 URL，使用者需訪問此 URL
    method: "auto" | "code";  // auto=自動回調, code=手動輸入授權碼
    instructions: string;     // 給使用者的指示文字
};
```

### 3.3 步驟 2：使用者完成授權

使用者被重定向到 `authorizationInfo.url`，完成授權後：
- **auto 模式**：自動重定向回應用程式
- **code 模式**：使用者需手動複製授權碼

### 3.4 步驟 3：處理授權回調

```javascript
// API: POST /provider/{providerID}/oauth/callback
// 用途：用授權碼換取 Token

const callbackResponse = await fetch('/provider/github/oauth/callback', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        method: 0,                    // 認證方法索引
        code: 'authorization_code_here',  // 從授權頁面取得的 code
    }),
});

const success = await callbackResponse.json(); // 返回 boolean
```

---

## 4. API Key 認證流程

這是最常用的認證方式，適用於 Claude 和 OpenAI。

### 4.1 流程圖

```
┌──────────┐      ┌──────────┐      ┌──────────┐
│  使用者   │      │ OpenCode │      │ OpenCode │
│  前端    │      │  前端    │      │  Server  │
└────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │
     │ 1. 輸入 API Key│                 │
     │────────────────▶│                 │
     │                 │                 │
     │                 │ 2. 儲存認證     │
     │                 │────────────────▶│
     │                 │                 │
     │                 │ 3. 驗證並儲存   │
     │                 │◀────────────────│
     │                 │                 │
     │ 4. 認證完成     │                 │
     │◀────────────────│                 │
     │                 │                 │
```

### 4.2 設定 API Key 認證

```javascript
// API: PUT /auth/{providerID}
// 用途：儲存認證憑證

// 範例 1：設定 Anthropic (Claude) API Key
const response = await fetch('/auth/anthropic', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        type: 'api',
        key: 'sk-ant-api03-xxxxxxxxxxxxxxxxxx',  // 你的 Claude API Key
    }),
});

// 範例 2：設定 OpenAI (ChatGPT) API Key
const response = await fetch('/auth/openai', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        type: 'api',
        key: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',  // 你的 OpenAI API Key
    }),
});
```

### 4.3 設定 OAuth Token（手動）

```javascript
// 如果需要手動設定 OAuth Token
const response = await fetch('/auth/github', {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        type: 'oauth',
        access: 'gho_xxxxxxxxxxxx',      // Access Token
        refresh: 'ghr_xxxxxxxxxxxx',     // Refresh Token
        expires: 1735689600,             // 過期時間 (Unix timestamp)
        accountId: 'user123',            // 可選
        enterpriseUrl: 'https://github.mycompany.com',  // 企業版 URL（可選）
    }),
});
```

---

## 5. Provider 管理

### 5.1 列出所有可用的 Provider

```javascript
// API: GET /provider
// 用途：取得所有可用的 AI 提供者及其模型

const response = await fetch('/provider');
const providers = await response.json();

// 回應範例：
// [
//     {
//         id: "anthropic",
//         name: "Anthropic",
//         source: "env",           // 認證來源：env/config/custom/api
//         env: ["ANTHROPIC_API_KEY"],
//         models: {
//             "claude-3-5-sonnet": {
//                 id: "claude-3-5-sonnet",
//                 name: "Claude 3.5 Sonnet",
//                 capabilities: { ... },
//                 cost: { input: 0.003, output: 0.015 },
//                 limit: { context: 200000, output: 8192 }
//             },
//             // ... 更多模型
//         }
//     },
//     {
//         id: "openai",
//         name: "OpenAI",
//         source: "env",
//         env: ["OPENAI_API_KEY"],
//         models: { ... }
//     }
// ]
```

**Provider 完整類型定義：**

```typescript
type Provider = {
    id: string;              // Provider ID，如 "anthropic"
    name: string;            // 顯示名稱，如 "Anthropic"
    source: "env" | "config" | "custom" | "api";  // 認證來源
    env: Array<string>;      // 對應的環境變數，如 ["ANTHROPIC_API_KEY"]
    key?: string;            // 已設定的 API Key（部分遮蔽）
    options: {               // 額外選項
        [key: string]: unknown;
    };
    models: {                // 可用模型
        [modelId: string]: Model;
    };
};
```

### 5.2 取得認證方法

```javascript
// API: GET /provider/auth
// 用途：取得各 Provider 支援的認證方法

const response = await fetch('/provider/auth');
const authMethods = await response.json();

// 回應範例：
// {
//     "anthropic": [
//         { type: "api", label: "API Key" }
//     ],
//     "openai": [
//         { type: "api", label: "API Key" }
//     ],
//     "github": [
//         { type: "oauth", label: "Sign in with GitHub" },
//         { type: "api", label: "Personal Access Token" }
//     ]
// }
```

### 5.3 Model 類型定義

```typescript
type Model = {
    id: string;              // 模型 ID
    providerID: string;      // 所屬 Provider
    name: string;            // 顯示名稱
    family?: string;         // 模型家族
    api: {
        id: string;
        url: string;         // API 端點
        npm: string;         // 對應的 NPM 套件
    };
    capabilities: {
        temperature: boolean;    // 支援溫度調整
        reasoning: boolean;      // 支援推理
        attachment: boolean;     // 支援附件
        toolcall: boolean;       // 支援工具呼叫
        input: {
            text: boolean;
            audio: boolean;
            image: boolean;
            video: boolean;
            pdf: boolean;
        };
        output: {
            text: boolean;
            audio: boolean;
            image: boolean;
            video: boolean;
            pdf: boolean;
        };
        interleaved: boolean;    // 支援交錯輸出
    };
    cost: {
        input: number;           // 輸入成本（每 1M tokens）
        output: number;          // 輸出成本（每 1M tokens）
        cache: {
            read: number;
            write: number;
        };
    };
    limit: {
        context: number;         // Context window 大小
        input?: number;          // 最大輸入 tokens
        output: number;          // 最大輸出 tokens
    };
    status: "alpha" | "beta" | "deprecated" | "active";
    release_date: string;
};
```

---

## 6. AI 模型 API 呼叫

### 6.1 Session 管理

在呼叫 AI 模型前，需要先建立或取得 Session：

```javascript
// API: POST /session
// 用途：建立新的對話 Session

const response = await fetch('/session', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        title: 'My Chat Session',  // 可選，Session 標題
    }),
});

const session = await response.json();
// {
//     id: "session_abc123",
//     title: "My Chat Session",
//     ...
// }
```

### 6.2 發送訊息（核心 API）

這是呼叫 AI 模型的核心 API，支援串流回應：

```javascript
// API: POST /session/{sessionID}/message
// 用途：發送訊息並取得 AI 回應

const response = await fetch(`/session/${sessionId}/message`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        // 必填：指定使用的模型
        model: {
            providerID: 'anthropic',       // Provider ID
            modelID: 'claude-3-5-sonnet',  // Model ID
        },

        // 訊息內容（必填）
        parts: [
            {
                type: 'text',
                text: '請解釋什麼是機器學習？',
            }
        ],

        // 以下為選填參數
        messageID: 'msg_123',          // 自訂訊息 ID
        agent: 'default',              // Agent 名稱
        system: '你是一個專業的 AI 助手',  // System Prompt
        variant: '',                   // 模型變體
        noReply: false,                // 是否不需要回應
        tools: {                       // 啟用的工具
            'web_search': true,
            'code_execution': false,
        },
    }),
});

// 處理串流回應
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    console.log('收到回應:', chunk);
}
```

### 6.3 訊息內容格式

**文字訊息：**

```typescript
type TextPartInput = {
    id?: string;             // 可選，Part ID
    type: 'text';            // 類型：文字
    text: string;            // 文字內容
    synthetic?: boolean;     // 是否為合成內容
    ignored?: boolean;       // 是否忽略
    time?: {
        start: number;
        end?: number;
    };
    metadata?: {             // 額外 metadata
        [key: string]: unknown;
    };
};
```

**檔案訊息（圖片、文件等）：**

```typescript
type FilePartInput = {
    id?: string;             // 可選，Part ID
    type: 'file';            // 類型：檔案
    mime: string;            // MIME 類型，如 'image/png'
    filename?: string;       // 檔案名稱
    url: string;             // 檔案 URL 或 Base64 Data URI
    source?: FilePartSource; // 來源資訊
};
```

### 6.4 發送訊息範例

**範例 1：簡單文字訊息**

```javascript
const response = await fetch(`/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model: {
            providerID: 'anthropic',
            modelID: 'claude-3-5-sonnet',
        },
        parts: [
            { type: 'text', text: '你好，請自我介紹' }
        ],
    }),
});
```

**範例 2：帶有 System Prompt**

```javascript
const response = await fetch(`/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model: {
            providerID: 'openai',
            modelID: 'gpt-4-turbo',
        },
        system: '你是一個專業的程式設計師，專精於 TypeScript 和 React。回答要簡潔有條理。',
        parts: [
            { type: 'text', text: '如何在 React 中管理全域狀態？' }
        ],
    }),
});
```

**範例 3：發送圖片**

```javascript
const response = await fetch(`/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model: {
            providerID: 'anthropic',
            modelID: 'claude-3-5-sonnet',
        },
        parts: [
            { type: 'text', text: '請描述這張圖片的內容' },
            {
                type: 'file',
                mime: 'image/png',
                filename: 'screenshot.png',
                url: 'data:image/png;base64,iVBORw0KGgo...',  // Base64 編碼
            }
        ],
    }),
});
```

### 6.5 非同步發送訊息

```javascript
// API: POST /session/{sessionID}/prompt_async
// 用途：非同步發送，立即返回不等待完成

const response = await fetch(`/session/${sessionId}/prompt_async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        model: {
            providerID: 'anthropic',
            modelID: 'claude-3-5-sonnet',
        },
        parts: [
            { type: 'text', text: '請寫一篇 1000 字的文章...' }
        ],
    }),
});

// 立即返回，不等待 AI 完成回應
const result = await response.json();
```

### 6.6 AI 回應格式

```typescript
type AssistantMessage = {
    id: string;              // 訊息 ID
    sessionID: string;       // Session ID
    role: 'assistant';       // 角色
    time: {
        created: number;     // 建立時間
        completed?: number;  // 完成時間
    };
    error?: ProviderAuthError | UnknownError | ApiError;  // 錯誤資訊
    parentID: string;        // 父訊息 ID
    modelID: string;         // 使用的模型
    providerID: string;      // 使用的 Provider
    mode: string;            // 模式
    agent: string;           // Agent 名稱
    path: {
        cwd: string;         // 當前工作目錄
        root: string;        // 根目錄
    };
    cost: number;            // 費用
    tokens: {
        input: number;       // 輸入 tokens
        output: number;      // 輸出 tokens
        reasoning: number;   // 推理 tokens
        cache: {
            read: number;    // 快取讀取
            write: number;   // 快取寫入
        };
    };
    finish?: string;         // 結束原因
};
```

---

## 7. 完整程式碼範例

### 7.1 使用 SDK 初始化 Client

```javascript
import { createOpencodeClient } from '@opencode-ai/sdk';

// 建立 Client
const client = createOpencodeClient({
    baseUrl: 'http://localhost:3000',  // OpenCode Server URL
    directory: '/path/to/project',      // 專案目錄
});

// 使用 Client
async function main() {
    // 1. 列出 Providers
    const providers = await client.provider.list();
    console.log('可用的 Providers:', providers);

    // 2. 設定認證
    await client.auth.set({
        providerID: 'anthropic',
        auth: {
            type: 'api',
            key: 'sk-ant-api03-xxx',
        },
    });

    // 3. 建立 Session
    const session = await client.session.create({
        title: 'My Chat',
    });

    // 4. 發送訊息
    const response = await client.session.prompt({
        sessionID: session.data.id,
        model: {
            providerID: 'anthropic',
            modelID: 'claude-3-5-sonnet',
        },
        parts: [
            { type: 'text', text: '你好！' },
        ],
    });

    console.log('AI 回應:', response);
}

main();
```

### 7.2 完整的認證流程範例

```javascript
// auth-example.js

class OpenCodeAuth {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    // 取得所有 Provider 及認證方法
    async getProviders() {
        const [providers, authMethods] = await Promise.all([
            fetch(`${this.baseUrl}/provider`).then(r => r.json()),
            fetch(`${this.baseUrl}/provider/auth`).then(r => r.json()),
        ]);

        return providers.map(p => ({
            ...p,
            authMethods: authMethods[p.id] || [],
        }));
    }

    // API Key 認證
    async authenticateWithApiKey(providerId, apiKey) {
        const response = await fetch(`${this.baseUrl}/auth/${providerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'api',
                key: apiKey,
            }),
        });

        if (!response.ok) {
            throw new Error('認證失敗');
        }

        return true;
    }

    // OAuth 認證 - 步驟 1
    async startOAuthFlow(providerId, methodIndex = 0) {
        const response = await fetch(
            `${this.baseUrl}/provider/${providerId}/oauth/authorize`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method: methodIndex }),
            }
        );

        return response.json();
    }

    // OAuth 認證 - 步驟 2
    async completeOAuthFlow(providerId, code, methodIndex = 0) {
        const response = await fetch(
            `${this.baseUrl}/provider/${providerId}/oauth/callback`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method: methodIndex,
                    code: code,
                }),
            }
        );

        return response.json();
    }
}

// 使用範例
async function example() {
    const auth = new OpenCodeAuth('http://localhost:3000');

    // 列出所有 Provider
    const providers = await auth.getProviders();
    console.log('Providers:', providers);

    // 使用 API Key 認證 Claude
    await auth.authenticateWithApiKey('anthropic', 'sk-ant-api03-xxx');
    console.log('Claude 認證成功！');

    // 使用 API Key 認證 OpenAI
    await auth.authenticateWithApiKey('openai', 'sk-xxx');
    console.log('OpenAI 認證成功！');
}
```

### 7.3 完整的對話範例

```javascript
// chat-example.js

class OpenCodeChat {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    // 建立新 Session
    async createSession(title = 'New Chat') {
        const response = await fetch(`${this.baseUrl}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        });
        return response.json();
    }

    // 發送訊息（支援串流）
    async sendMessage(sessionId, message, options = {}) {
        const {
            provider = 'anthropic',
            model = 'claude-3-5-sonnet',
            systemPrompt = '',
            onChunk = () => {},
        } = options;

        const response = await fetch(
            `${this.baseUrl}/session/${sessionId}/message`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: {
                        providerID: provider,
                        modelID: model,
                    },
                    system: systemPrompt,
                    parts: [
                        { type: 'text', text: message },
                    ],
                }),
            }
        );

        // 處理串流回應
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            fullResponse += chunk;
            onChunk(chunk);
        }

        return fullResponse;
    }

    // 取得對話歷史
    async getMessages(sessionId, limit = 50) {
        const response = await fetch(
            `${this.baseUrl}/session/${sessionId}/message?limit=${limit}`
        );
        return response.json();
    }
}

// 使用範例
async function chatExample() {
    const chat = new OpenCodeChat('http://localhost:3000');

    // 1. 建立 Session
    const session = await chat.createSession('技術問答');
    console.log('建立 Session:', session.id);

    // 2. 發送訊息給 Claude
    console.log('\n詢問 Claude:');
    const claudeResponse = await chat.sendMessage(
        session.id,
        '請用簡單的方式解釋什麼是 REST API？',
        {
            provider: 'anthropic',
            model: 'claude-3-5-sonnet',
            systemPrompt: '你是一個友善的技術導師，善於用簡單的例子解釋複雜概念。',
            onChunk: (chunk) => process.stdout.write(chunk),
        }
    );

    // 3. 發送訊息給 ChatGPT
    console.log('\n\n詢問 ChatGPT:');
    const gptResponse = await chat.sendMessage(
        session.id,
        '同樣的問題，你怎麼解釋 REST API？',
        {
            provider: 'openai',
            model: 'gpt-4-turbo',
            onChunk: (chunk) => process.stdout.write(chunk),
        }
    );

    // 4. 取得對話歷史
    const history = await chat.getMessages(session.id);
    console.log('\n\n對話歷史:', history);
}
```

---

## 8. API 端點參考

### 8.1 認證相關

| 端點 | 方法 | 說明 | 參數 |
|------|------|------|------|
| `/provider` | GET | 列出所有 Provider | - |
| `/provider/auth` | GET | 取得認證方法 | - |
| `/provider/{providerID}/oauth/authorize` | POST | 發起 OAuth 授權 | `method`: 認證方法索引 |
| `/provider/{providerID}/oauth/callback` | POST | 處理 OAuth 回調 | `method`, `code` |
| `/auth/{providerID}` | PUT | 設定認證憑證 | `auth`: Auth 物件 |

### 8.2 Session 相關

| 端點 | 方法 | 說明 | 參數 |
|------|------|------|------|
| `/session` | GET | 列出所有 Session | - |
| `/session` | POST | 建立新 Session | `title` |
| `/session/{sessionID}` | GET | 取得 Session 詳情 | - |
| `/session/{sessionID}` | DELETE | 刪除 Session | - |
| `/session/{sessionID}/message` | GET | 取得對話訊息 | `limit` |
| `/session/{sessionID}/message` | POST | 發送訊息 | 見下方 |
| `/session/{sessionID}/prompt_async` | POST | 非同步發送訊息 | 見下方 |
| `/session/{sessionID}/summarize` | POST | 摘要 Session | - |

### 8.3 發送訊息參數

```typescript
{
    messageID?: string;           // 自訂訊息 ID
    model: {
        providerID: string;       // Provider ID (必填)
        modelID: string;          // Model ID (必填)
    };
    agent?: string;               // Agent 名稱
    system?: string;              // System Prompt
    noReply?: boolean;            // 是否不需要回應
    tools?: {                     // 啟用的工具
        [toolName: string]: boolean;
    };
    variant?: string;             // 模型變體
    parts: Array<                 // 訊息內容 (必填)
        TextPartInput | FilePartInput
    >;
}
```

### 8.4 其他端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/event` | GET (SSE) | 訂閱事件串流 |
| `/mcp` | GET | 取得 MCP Server 狀態 |
| `/mcp` | POST | 新增 MCP Server |
| `/app/agents` | GET | 列出所有 Agent |
| `/app/skills` | GET | 列出所有 Skill |
| `/global/health` | GET | 健康檢查 |

---

## 附錄 A：錯誤處理

```typescript
// 錯誤類型
type ProviderAuthError = {
    type: 'provider_auth';
    provider: string;
    message: string;
};

type ApiError = {
    type: 'api';
    code: string;
    message: string;
};

type UnknownError = {
    type: 'unknown';
    message: string;
};

// 錯誤處理範例
async function handleApiCall() {
    try {
        const response = await fetch('/session/xxx/message', { ... });

        if (!response.ok) {
            const error = await response.json();

            switch (error.type) {
                case 'provider_auth':
                    console.error(`認證錯誤 (${error.provider}):`, error.message);
                    // 重新認證
                    break;
                case 'api':
                    console.error(`API 錯誤 [${error.code}]:`, error.message);
                    break;
                default:
                    console.error('未知錯誤:', error.message);
            }
        }
    } catch (e) {
        console.error('網路錯誤:', e);
    }
}
```

---

## 附錄 B：環境變數設定

你也可以透過環境變數設定認證：

```bash
# Anthropic (Claude)
export ANTHROPIC_API_KEY="sk-ant-api03-xxxxxxxxxx"

# OpenAI (ChatGPT)
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxx"

# Google (Gemini)
export GOOGLE_GENERATIVE_AI_API_KEY="xxxxxxxxxxxxxxxx"

# GitHub Copilot
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxx"
```

設定後，OpenCode 會自動偵測並使用這些環境變數。

---

## 附錄 C：配置檔設定

你也可以在專案的 `opencode.json` 或 `.opencode/config.json` 中設定：

```json
{
    "provider": {
        "anthropic": {
            "options": {
                "apiKey": "sk-ant-api03-xxx"
            }
        },
        "openai": {
            "options": {
                "apiKey": "sk-xxx",
                "baseURL": "https://api.openai.com/v1"
            }
        }
    }
}
```

---

*文件最後更新：2026-01-19*
