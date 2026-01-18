# Subtitle Translator Extension - Specification Document

> **Version**: 0.1.0  
> **Last Updated**: 2025-01-18  
> **Status**: Draft

---

## 1. 專案概述

### 1.1 背景
串流平台觀看外語內容時，經常遇到缺乏中文字幕的問題。本專案旨在開發一個 Chrome 擴充功能，自動攔截串流平台的字幕檔案，並透過 AI 進行高品質翻譯。

### 1.2 目標
- 支援主流串流平台的字幕抓取（YouTube、Netflix、Disney+、Prime Video）
- 提供 AI 驅動的高品質翻譯（具完整上下文）
- 最小化使用者操作，達到「一鍵翻譯」體驗

### 1.3 非目標（Out of Scope）
- 語音辨識（ASR）功能（無字幕影片）
- 字幕時間軸編輯
- 離線翻譯功能

### 1.4 專案設計說明

#### 問題定義

串流平台（YouTube、Netflix、Disney+、Prime Video）觀看外語內容時，經常面臨缺乏中文字幕或機器翻譯品質低落的問題。現有的瀏覽器翻譯工具多採用逐句即時翻譯，缺乏上下文導致譯文不自然、角色名稱不一致、語意斷裂。

#### 解決方案

開發 Chrome 擴充功能，透過攔截串流平台的字幕網路請求，一次性取得完整字幕檔，再以 AI（Claude/GPT）進行全文翻譯。相較於逐句翻譯，全文翻譯能讓模型理解劇情脈絡、維持角色名稱一致性，產出更接近人工翻譯的品質。

#### 核心架構

系統分為四層：

**攔截層**：利用 Chrome Extension 的 `webRequest` API 監聽字幕請求（WebVTT/TTML 格式），各平台有獨立的 URL pattern 匹配邏輯，攔截後解析為統一的內部資料結構。

**認證層**：採用 Provider 抽象設計，支援三種認證方式。推薦使用「訂閱帳號登入」，讓 Claude Pro / ChatGPT Plus 用戶可直接使用既有訂閱額度，無需額外付費。此機制參考 Claude Code 官方工具的實作方式，透過 OAuth 流程取得 session token 後呼叫平台內部 API。同時支援 API Key 模式（穩定性最高）與本地 Ollama 模型（完全免費）。

**翻譯層**：採用「全量送出」策略，將完整字幕（約 2000-4000 句）作為單一請求送至 AI API。一部 2 小時電影約 30K-50K tokens，在 Claude 200K context window 內可完整處理。首次翻譯需等待 30-60 秒，但可獲得最佳翻譯品質。

**快取層**：採用兩層快取設計。L1 為記憶體快取，存放當前播放 session 的字幕；L2 為 IndexedDB，持久化儲存歷史翻譯結果。以 `hash(videoId + sourceLang + targetLang)` 作為 key，避免重複翻譯相同內容。單部電影字幕約 50-150KB，可輕鬆快取上千部影片。

#### 資料流程

```
用戶開啟影片 → 偵測平台並攔截字幕請求 → 解析字幕格式
     ↓
檢查 IndexedDB 快取 → [命中] → 直接載入翻譯結果
     ↓ [未命中]
驗證認證狀態（訂閱登入 / API Key / Ollama）
     ↓
送出完整字幕至 AI（附帶影片標題作為上下文）
     ↓
接收翻譯結果 → 寫入快取 → 渲染至播放器覆蓋層
```

#### 翻譯服務認證

提供三種認證方式，使用者可依需求選擇：

**訂閱帳號登入（推薦）**：支援 Claude Pro / ChatGPT Plus 訂閱帳號直接登入。透過 OAuth 流程取得 session token，呼叫平台內部 API 完成翻譯，無需額外付費。此方式依賴平台非公開介面，若平台政策變更可能需要調整。

**API Key**：適合開發者或重度使用者，填入官方 API Key 直接呼叫，穩定性最高但需另外付費。

**本地模型**：整合 Ollama，完全免費且離線可用。適合有隱私顧慮或願意自架環境的進階使用者。

#### 關鍵設計決策

1. **訂閱登入優先**：多數用戶已有 ChatGPT Plus 或 Claude Pro 訂閱，降低使用門檻。參考 Claude Code 等官方工具的實作方式，技術上可行。

2. **全量翻譯優先於串流翻譯**：犧牲首次載入速度，換取翻譯品質與實作簡潔性。未來可加入 Sliding Window 模式作為「邊看邊翻」選項。

3. **平台適配模組化**：各串流平台的字幕格式與 URL 結構不同，採用 Strategy Pattern 隔離平台特定邏輯，新增平台支援時不影響核心流程。

4. **Manifest V3 相容**：遵循 Chrome 最新的擴充功能規範，使用 Service Worker 取代 Background Page，確保長期維護性。

---

## 2. 功能規格

### 2.1 核心功能

| ID | 功能 | 優先級 | 描述 |
|----|------|--------|------|
| F01 | 字幕攔截 | P0 | 自動偵測並攔截平台字幕請求 |
| F02 | 字幕解析 | P0 | 解析 WebVTT / TTML 格式 |
| F03 | AI 翻譯 | P0 | 批次翻譯完整字幕檔 |
| F04 | 字幕覆蓋 | P0 | 在原生播放器上顯示翻譯字幕 |
| F05 | 雙語顯示 | P1 | 同時顯示原文與譯文 |
| F06 | 翻譯快取 | P1 | 快取已翻譯內容避免重複 API 呼叫 |
| F07 | 手動觸發 | P2 | 手動上傳 .srt/.vtt 檔案翻譯 |

### 2.2 平台支援矩陣

| 平台 | 字幕格式 | 攔截方式 | 優先開發順序 |
|------|----------|----------|--------------|
| YouTube | WebVTT (timedtext API) | URL Pattern Match | Phase 1 |
| Netflix | TTML/DFXP | webRequest 攔截 | Phase 2 |
| Disney+ | WebVTT | webRequest 攔截 | Phase 2 |
| Prime Video | WebVTT | webRequest 攔截 | Phase 3 |

### 2.3 使用者故事

```
US-01: 作為觀眾，我希望在觀看 YouTube 外語影片時，自動看到中文翻譯字幕
US-02: 作為觀眾，我希望能選擇只看翻譯或同時看雙語字幕
US-03: 作為觀眾，我希望翻譯品質比 Google Translate 更自然
US-04: 作為觀眾，我希望翻譯延遲在可接受範圍內（<5秒）
```

---

## 3. 技術規格

### 3.1 系統架構

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Background     │  Content        │  Popup                  │
│  Service Worker │  Script         │  UI                     │
│                 │                 │                         │
│  - webRequest   │  - DOM 操作     │  - 設定介面             │
│  - 字幕攔截     │  - 字幕注入     │  - 翻譯狀態             │
│  - API 呼叫     │  - 播放器偵測   │  - 語言選擇             │
└────────┬────────┴────────┬────────┴─────────────────────────┘
         │                 │
         │  chrome.runtime.sendMessage
         │                 │
         ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Translation Service                       │
│  (Claude API / OpenAI API / Local Model)                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 目錄結構

```
subtitle-translator/
├── manifest.json
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── subtitle-interceptor.ts
│   │   └── translation-service.ts
│   ├── content/
│   │   ├── content-script.ts
│   │   ├── subtitle-renderer.ts
│   │   └── platforms/
│   │       ├── youtube.ts
│   │       ├── netflix.ts
│   │       ├── disney.ts
│   │       └── prime.ts
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── shared/
│   │   ├── types.ts
│   │   ├── parsers/
│   │   │   ├── webvtt-parser.ts
│   │   │   └── ttml-parser.ts
│   │   └── utils.ts
│   └── options/
│       ├── options.html
│       └── options.ts
├── tests/
│   ├── unit/
│   └── e2e/
├── package.json
├── tsconfig.json
└── webpack.config.js
```

### 3.3 Manifest V3 配置

```json
{
  "manifest_version": 3,
  "name": "AI Subtitle Translator",
  "version": "0.1.0",
  "description": "AI-powered subtitle translation for streaming platforms",
  
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  
  "host_permissions": [
    "https://www.youtube.com/*",
    "https://www.netflix.com/*",
    "https://www.disneyplus.com/*",
    "https://www.primevideo.com/*"
  ],
  
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  
  "content_scripts": [
    {
      "matches": [
        "https://www.youtube.com/*",
        "https://www.netflix.com/*",
        "https://www.disneyplus.com/*",
        "https://www.primevideo.com/*"
      ],
      "js": ["content/content-script.js"],
      "css": ["content/subtitle-overlay.css"],
      "run_at": "document_idle"
    }
  ],
  
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "options_page": "options/options.html"
}
```

---

## 4. 資料結構

### 4.1 核心型別定義

```typescript
// src/shared/types.ts

/** 單一字幕條目 */
interface SubtitleCue {
  id: string;
  startTime: number;      // 毫秒
  endTime: number;        // 毫秒
  originalText: string;
  translatedText?: string;
}

/** 完整字幕檔 */
interface SubtitleTrack {
  id: string;
  language: string;       // ISO 639-1 (e.g., 'en', 'ja')
  format: 'webvtt' | 'ttml' | 'srt';
  cues: SubtitleCue[];
  metadata?: {
    title?: string;
    platform: Platform;
    videoId: string;
  };
}

/** 支援的平台 */
type Platform = 'youtube' | 'netflix' | 'disney' | 'prime';

/** 翻譯請求 */
interface TranslationRequest {
  trackId: string;
  sourceLang: string;
  targetLang: string;
  cues: SubtitleCue[];
  context?: string;       // 影片標題或描述，提供翻譯上下文
}

/** 翻譯回應 */
interface TranslationResponse {
  trackId: string;
  translatedCues: SubtitleCue[];
  tokensUsed: number;
  cached: boolean;
}

/** 擴充功能設定 */
interface ExtensionSettings {
  enabled: boolean;
  targetLanguage: string;
  displayMode: 'translated' | 'bilingual' | 'original';
  translationProvider: 'claude' | 'openai' | 'google';
  apiKey?: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: 'bottom' | 'top';
}

/** 快取條目 */
interface CacheEntry {
  key: string;            // hash(originalText + sourceLang + targetLang)
  translatedText: string;
  createdAt: number;
  expiresAt: number;
}
```

### 4.2 訊息協定

```typescript
// Background <-> Content Script 通訊

type MessageType = 
  | 'SUBTITLE_INTERCEPTED'
  | 'TRANSLATION_REQUEST'
  | 'TRANSLATION_COMPLETE'
  | 'SETTINGS_UPDATED'
  | 'ERROR';

interface ExtensionMessage<T = unknown> {
  type: MessageType;
  payload: T;
  timestamp: number;
}

// 範例：字幕攔截完成
interface SubtitleInterceptedPayload {
  platform: Platform;
  videoId: string;
  track: SubtitleTrack;
}

// 範例：翻譯完成
interface TranslationCompletePayload {
  trackId: string;
  cues: SubtitleCue[];
}
```

---

## 5. 翻譯服務認證

### 5.1 認證方式總覽

提供三種認證方式，使用者可依需求選擇：

| 認證方式 | 成本 | 穩定性 | 適用對象 |
|----------|------|--------|----------|
| 訂閱帳號登入 | 免費（已有訂閱） | 中 | 一般用戶 |
| API Key | 按量付費 | 高 | 開發者 / 重度用戶 |
| 本地模型 | 免費 | 高 | 進階用戶 / 隱私需求 |

### 5.2 訂閱帳號登入（推薦）

支援 Claude Pro / ChatGPT Plus 訂閱帳號直接登入，無需額外付費。

**認證流程**：

```
┌─────────────────────────────────────────────────────────┐
│  1. 用戶點擊「連結帳號」                                  │
│         ↓                                               │
│  2. 開啟 OAuth 授權頁面（claude.ai / chat.openai.com）   │
│         ↓                                               │
│  3. 用戶登入並授權                                       │
│         ↓                                               │
│  4. 取得 session token                                  │
│         ↓                                               │
│  5. 安全儲存至 chrome.storage.local（加密）              │
│         ↓                                               │
│  6. 後續翻譯直接呼叫內部 API                             │
└─────────────────────────────────────────────────────────┘
```

**支援的服務**：

| 服務 | 內部 API 端點 | Token 來源 |
|------|---------------|------------|
| Claude Pro | `claude.ai/api/chat/completions` | sessionKey cookie |
| ChatGPT Plus | `chat.openai.com/backend-api/conversation` | accessToken |

**注意事項**：
- 此方式依賴平台非公開介面，若平台政策變更可能需要調整
- 參考實作：Claude Code 官方工具已採用類似機制
- Token 過期時需重新授權

**型別定義**：

```typescript
interface SubscriptionAuth {
  provider: 'claude' | 'chatgpt';
  sessionToken: string;
  expiresAt: number;
  userEmail?: string;
}
```

### 5.3 API Key 模式

適合開發者或重度使用者，填入官方 API Key 直接呼叫，穩定性最高但需另外付費。

**支援的服務**：

| 服務 | API 端點 | 定價參考（輸入/輸出） |
|------|----------|----------------------|
| Claude | api.anthropic.com | $3 / $15 per 1M tokens (Sonnet) |
| OpenAI | api.openai.com | $0.15 / $0.60 per 1M tokens (gpt-4o-mini) |
| Google Gemini | generativelanguage.googleapis.com | 免費額度 / $0.075 per 1M tokens |

**型別定義**：

```typescript
interface ApiKeyAuth {
  provider: 'claude-api' | 'openai-api' | 'gemini-api' | 'custom';
  apiKey: string;
  endpoint?: string;  // 自訂端點，用於相容 OpenAI 格式的服務
  model?: string;     // 指定模型
}
```

### 5.4 本地模型（Ollama）

整合 Ollama，完全免費且離線可用。適合有隱私顧慮或願意自架環境的進階使用者。

**前置需求**：
- 安裝 Ollama（https://ollama.ai）
- 下載模型：`ollama pull llama3` 或 `ollama pull qwen2`

**連線方式**：

```typescript
interface OllamaAuth {
  provider: 'ollama';
  endpoint: string;  // 預設 http://localhost:11434
  model: string;     // llama3, qwen2, mistral 等
}

// 呼叫範例
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    model: 'llama3',
    messages: [{ role: 'user', content: prompt }],
    stream: false,
  }),
});
```

**推薦模型**：

| 模型 | VRAM 需求 | 翻譯品質 | 速度 |
|------|-----------|----------|------|
| llama3:8b | 8GB | ⭐⭐⭐ | 快 |
| qwen2:7b | 8GB | ⭐⭐⭐⭐ | 快 |
| llama3:70b | 48GB | ⭐⭐⭐⭐⭐ | 慢 |

### 5.5 Provider 抽象層

```typescript
// src/shared/translation-provider.ts

interface TranslationProvider {
  readonly name: string;
  readonly authType: 'subscription' | 'apikey' | 'local';
  
  /** 驗證認證是否有效 */
  validateAuth(): Promise<boolean>;
  
  /** 執行翻譯 */
  translate(request: TranslationRequest): Promise<TranslationResponse>;
  
  /** 取得剩餘配額（如適用） */
  getRemainingQuota?(): Promise<number | null>;
}

// 工廠模式建立 provider
function createProvider(config: AuthConfig): TranslationProvider {
  switch (config.provider) {
    case 'claude':
    case 'chatgpt':
      return new SubscriptionProvider(config);
    case 'claude-api':
    case 'openai-api':
    case 'gemini-api':
      return new ApiKeyProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
```

---

## 6. API 介面規格

### 6.1 字幕攔截介面

```typescript
// src/background/subtitle-interceptor.ts

interface SubtitleInterceptor {
  /**
   * 註冊平台特定的攔截規則
   */
  registerPlatform(platform: Platform, config: InterceptConfig): void;
  
  /**
   * 開始監聽字幕請求
   */
  startListening(): void;
  
  /**
   * 停止監聽
   */
  stopListening(): void;
  
  /**
   * 字幕攔截事件
   */
  onSubtitleCaptured: (callback: (track: SubtitleTrack) => void) => void;
}

interface InterceptConfig {
  urlPatterns: string[];
  responseHandler: (response: Response) => Promise<SubtitleTrack>;
}
```

### 6.2 翻譯服務介面

```typescript
// src/background/translation-service.ts

interface TranslationService {
  /**
   * 翻譯單一字幕軌
   * @param track - 原始字幕
   * @param targetLang - 目標語言
   * @returns 翻譯後的字幕軌
   */
  translateTrack(
    track: SubtitleTrack, 
    targetLang: string
  ): Promise<SubtitleTrack>;
  
  /**
   * 批次翻譯（優化 token 使用）
   * 將多個 cues 合併成單一請求
   */
  translateBatch(
    cues: SubtitleCue[], 
    sourceLang: string,
    targetLang: string,
    context?: string
  ): Promise<SubtitleCue[]>;
  
  /**
   * 取得翻譯服務狀態
   */
  getStatus(): TranslationServiceStatus;
}

interface TranslationServiceStatus {
  provider: string;
  isConfigured: boolean;
  remainingQuota?: number;
  lastError?: string;
}
```

### 6.3 AI 翻譯 Prompt 設計

```typescript
// 翻譯 Prompt 模板
const TRANSLATION_PROMPT = `
你是專業的影視字幕翻譯員。請將以下字幕翻譯成繁體中文。

翻譯準則：
1. 保持口語化、自然流暢
2. 維持原文的語氣和情感
3. 專有名詞保留原文或使用常見譯名
4. 每句翻譯必須簡潔，適合字幕顯示
5. 保持原始的斷句結構

影片資訊：{context}

原文字幕（JSON 格式）：
{subtitles}

請以相同的 JSON 格式回傳翻譯結果，只包含 id 和 translatedText 欄位：
`;
```

---

## 7. 快取策略

### 7.1 分層快取設計

```
┌─────────────────────────────────────────────────┐
│  L1: Memory Cache (Map)                         │
│  用途：當前播放的原文 + 翻譯結果                  │
│  生命週期：單一影片 session                       │
│  容量：無限制                                    │
└─────────────────┬───────────────────────────────┘
                  │ 影片切換時寫入
                  ▼
┌─────────────────────────────────────────────────┐
│  L2: IndexedDB                                  │
│  用途：歷史翻譯快取                              │
│  Key：hash(videoId + sourceLang + targetLang)   │
│  Value：完整翻譯後的 SubtitleTrack              │
│  容量：理論無限（單部電影約 50-150KB）           │
└─────────────────────────────────────────────────┘
```

### 7.2 快取策略

- **寫入時機**：翻譯完成後立即寫入 L1，影片切換或頁面關閉前寫入 L2
- **讀取順序**：L1 → L2 → 執行翻譯
- **過期策略**：L2 採用 LRU，超過 500MB 時淘汰最舊資料
- **快取 Key**：`sha256(videoId + sourceLang + targetLang + providerModel)`

---

## 8. 開發里程碑

### Phase 1: YouTube MVP + 認證系統（3 週）

| 任務 | 預估時間 | 驗收標準 |
|------|----------|----------|
| 專案初始化（TypeScript + Webpack） | 2h | 可 build 並載入 Chrome |
| WebVTT 解析器 | 4h | 通過 10 個測試案例 |
| YouTube 字幕攔截 | 8h | 成功抓取 YouTube 自動字幕 |
| **Claude 訂閱登入** | 12h | OAuth 流程完成、取得 session token |
| **ChatGPT 訂閱登入** | 8h | 同上，複用認證框架 |
| Provider 抽象層 | 6h | 可切換不同翻譯服務 |
| 基礎翻譯服務 | 8h | 完成單軌翻譯 |
| 字幕覆蓋渲染 | 8h | 在 YouTube 播放器上正確顯示 |
| Popup UI | 6h | 可開關功能、選擇語言、連結帳號 |

**Phase 1 完成標準**：可用 Claude Pro 訂閱在 YouTube 上觀看一部 10 分鐘影片並看到翻譯字幕

### Phase 2: Netflix & Disney+ + API Key 模式（2 週）

| 任務 | 預估時間 | 驗收標準 |
|------|----------|----------|
| TTML 解析器 | 6h | 通過 Netflix 字幕測試 |
| Netflix 字幕攔截 | 8h | 成功抓取 Netflix 字幕 |
| Disney+ 字幕攔截 | 6h | 成功抓取 Disney+ 字幕 |
| **API Key 認證模式** | 6h | 支援 Claude / OpenAI / Gemini API |
| 翻譯快取機制（IndexedDB） | 6h | 重複內容不重新翻譯 |
| 雙語顯示模式 | 4h | 可同時顯示原文與譯文 |

### Phase 3: 優化與擴展（2 週）

| 任務 | 預估時間 | 驗收標準 |
|------|----------|----------|
| Prime Video 支援 | 8h | 成功抓取 Prime 字幕 |
| **Ollama 本地模型支援** | 6h | 可選本地 LLM 翻譯 |
| Token 自動刷新機制 | 4h | Session 過期自動更新 |
| Options 頁面 | 6h | 完整設定介面 |
| 效能優化 | 8h | 翻譯延遲 < 3 秒（快取命中時） |
| E2E 測試 | 8h | 主要流程自動化測試 |

---

## 9. 測試規格

### 9.1 單元測試

```typescript
// tests/unit/parsers/webvtt-parser.test.ts

describe('WebVTT Parser', () => {
  it('should parse basic WebVTT file', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello, world!

00:00:05.000 --> 00:00:08.000
How are you?`;
    
    const result = parseWebVTT(vtt);
    
    expect(result.cues).toHaveLength(2);
    expect(result.cues[0].startTime).toBe(1000);
    expect(result.cues[0].originalText).toBe('Hello, world!');
  });
  
  it('should handle multi-line cues', () => { /* ... */ });
  it('should handle styling tags', () => { /* ... */ });
  it('should handle cue identifiers', () => { /* ... */ });
});
```

### 9.2 整合測試案例

| ID | 測試案例 | 前置條件 | 步驟 | 預期結果 |
|----|----------|----------|------|----------|
| IT-01 | YouTube 基本翻譯 | 已設定 API Key | 1. 開啟 YouTube 影片 2. 啟用字幕 3. 啟用擴充功能 | 顯示翻譯字幕 |
| IT-02 | Netflix 翻譯 | 已登入 Netflix | 1. 播放影片 2. 選擇英文字幕 | 顯示翻譯字幕 |
| IT-03 | 快取命中 | 已翻譯過相同影片 | 重新播放影片 | 立即顯示，無 API 呼叫 |
| IT-04 | 錯誤處理 | API Key 無效 | 嘗試翻譯 | 顯示錯誤提示 |

---

## 10. 風險與緩解

| 風險 | 影響 | 機率 | 緩解措施 |
|------|------|------|----------|
| 平台更新字幕 API | 攔截失敗 | 中 | 模組化設計，快速適配 |
| 訂閱登入介面變更 | 認證失效 | 中 | 多認證方式備援、快速修復機制 |
| 帳號被平台風控 | 用戶體驗差 | 低 | 控制請求頻率、提供 API Key 備案 |
| 翻譯 API 成本過高 | 使用成本 | 低 | 訂閱登入免費、支援本地模型 |
| Manifest V3 限制 | 功能受限 | 低 | 提前研究 API 限制 |
| 字幕同步問題 | 體驗差 | 中 | 保留原始時間軸 |
| Session Token 過期 | 需重新登入 | 中 | Token 自動刷新、過期提醒 |

---

## 11. 附錄

### A. YouTube 字幕 API 參考

```
GET https://www.youtube.com/api/timedtext
  ?v={videoId}
  &lang={languageCode}
  &fmt=vtt
  &name={trackName}
```

### B. 參考資源

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [WebVTT Spec](https://www.w3.org/TR/webvtt1/)
- [TTML Spec](https://www.w3.org/TR/ttml2/)
- [Anthropic Claude API](https://docs.anthropic.com/claude/reference/)

---

## Changelog

| 版本 | 日期 | 變更內容 |
|------|------|----------|
| 0.1.0 | 2025-01-18 | 初始版本 |
