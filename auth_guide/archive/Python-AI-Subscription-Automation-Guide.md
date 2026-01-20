# Python 自動化 Claude/ChatGPT 訂閱帳號教學

> ⚠️ **重要聲明**：使用訂閱帳號自動化可能違反服務條款。本教學僅供學習研究用途。
> 建議正式專案使用官方 API。

---

## 目錄

1. [方案比較與選擇](#1-方案比較與選擇)
2. [方案 A：使用官方 API（推薦）](#2-方案-a使用官方-api推薦)
3. [方案 B：使用 Session Token 模擬登入](#3-方案-b使用-session-token-模擬登入)
4. [方案 C：使用瀏覽器自動化](#4-方案-c使用瀏覽器自動化)
5. [繞過 Cloudflare 的技術](#5-繞過-cloudflare-的技術)
6. [完整專案範例](#6-完整專案範例)
7. [常見問題與解決方案](#7-常見問題與解決方案)

---

## 1. 方案比較與選擇

| 方案 | 難度 | 穩定性 | Cloudflare | 成本 | 推薦度 |
|------|------|--------|------------|------|--------|
| **官方 API** | ⭐ 簡單 | ⭐⭐⭐⭐⭐ | ❌ 無問題 | 按用量付費 | ⭐⭐⭐⭐⭐ |
| **Session Token** | ⭐⭐ 中等 | ⭐⭐⭐ | ⚠️ 可能遇到 | 訂閱費用 | ⭐⭐⭐ |
| **瀏覽器自動化** | ⭐⭐⭐ 困難 | ⭐⭐ | ✅ 可繞過 | 訂閱費用 | ⭐⭐ |

### 選擇建議

```
如果你需要...
├── 穩定、長期運行 → 使用官方 API
├── 省錢、少量使用 → 使用 Session Token
└── 完全模擬人類操作 → 使用瀏覽器自動化
```

---

## 2. 方案 A：使用官方 API（推薦）

這是最穩定的方式，不會遇到 Cloudflare 問題。

### 2.1 安裝依賴

```bash
pip install anthropic openai
```

### 2.2 Claude API 使用

```python
# claude_api.py
import anthropic

class ClaudeAPI:
    def __init__(self, api_key: str):
        """
        初始化 Claude API

        取得 API Key：https://console.anthropic.com/
        """
        self.client = anthropic.Anthropic(api_key=api_key)

    def chat(self, message: str, model: str = "claude-sonnet-4-20250514") -> str:
        """發送訊息並取得回應"""
        response = self.client.messages.create(
            model=model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": message}
            ]
        )
        return response.content[0].text

    def chat_with_history(self, messages: list, system: str = None) -> str:
        """支援多輪對話"""
        kwargs = {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 4096,
            "messages": messages
        }
        if system:
            kwargs["system"] = system

        response = self.client.messages.create(**kwargs)
        return response.content[0].text

    def stream_chat(self, message: str):
        """串流回應"""
        with self.client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": message}]
        ) as stream:
            for text in stream.text_stream:
                yield text


# 使用範例
if __name__ == "__main__":
    claude = ClaudeAPI(api_key="sk-ant-api03-xxxxx")

    # 簡單對話
    response = claude.chat("什麼是機器學習？")
    print(response)

    # 串流回應
    for chunk in claude.stream_chat("寫一首關於程式設計的詩"):
        print(chunk, end="", flush=True)
```

### 2.3 OpenAI API 使用

```python
# openai_api.py
from openai import OpenAI

class ChatGPTAPI:
    def __init__(self, api_key: str):
        """
        初始化 OpenAI API

        取得 API Key：https://platform.openai.com/api-keys
        """
        self.client = OpenAI(api_key=api_key)

    def chat(self, message: str, model: str = "gpt-4-turbo") -> str:
        """發送訊息並取得回應"""
        response = self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": message}
            ]
        )
        return response.choices[0].message.content

    def chat_with_history(self, messages: list, system: str = None) -> str:
        """支援多輪對話"""
        if system:
            messages = [{"role": "system", "content": system}] + messages

        response = self.client.chat.completions.create(
            model="gpt-4-turbo",
            messages=messages
        )
        return response.choices[0].message.content

    def stream_chat(self, message: str):
        """串流回應"""
        stream = self.client.chat.completions.create(
            model="gpt-4-turbo",
            messages=[{"role": "user", "content": message}],
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


# 使用範例
if __name__ == "__main__":
    gpt = ChatGPTAPI(api_key="sk-xxxxx")

    # 簡單對話
    response = gpt.chat("什麼是深度學習？")
    print(response)
```

### 2.4 統一介面

```python
# unified_ai.py
from abc import ABC, abstractmethod
from typing import Generator, List, Dict
import anthropic
from openai import OpenAI

class AIProvider(ABC):
    @abstractmethod
    def chat(self, message: str) -> str:
        pass

    @abstractmethod
    def stream_chat(self, message: str) -> Generator[str, None, None]:
        pass

class ClaudeProvider(AIProvider):
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = "claude-sonnet-4-20250514"

    def chat(self, message: str) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": message}]
        )
        return response.content[0].text

    def stream_chat(self, message: str) -> Generator[str, None, None]:
        with self.client.messages.stream(
            model=self.model,
            max_tokens=4096,
            messages=[{"role": "user", "content": message}]
        ) as stream:
            for text in stream.text_stream:
                yield text

class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        self.model = "gpt-4-turbo"

    def chat(self, message: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": message}]
        )
        return response.choices[0].message.content

    def stream_chat(self, message: str) -> Generator[str, None, None]:
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": message}],
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

class UnifiedAI:
    """統一的 AI 介面，可輕鬆切換 Provider"""

    def __init__(self, claude_key: str = None, openai_key: str = None):
        self.providers = {}
        if claude_key:
            self.providers['claude'] = ClaudeProvider(claude_key)
        if openai_key:
            self.providers['openai'] = OpenAIProvider(openai_key)

        # 預設 provider
        self.default_provider = 'claude' if claude_key else 'openai'

    def chat(self, message: str, provider: str = None) -> str:
        provider = provider or self.default_provider
        return self.providers[provider].chat(message)

    def stream_chat(self, message: str, provider: str = None):
        provider = provider or self.default_provider
        return self.providers[provider].stream_chat(message)

    def compare(self, message: str) -> Dict[str, str]:
        """同時詢問所有 provider 並比較結果"""
        results = {}
        for name, provider in self.providers.items():
            results[name] = provider.chat(message)
        return results


# 使用範例
if __name__ == "__main__":
    ai = UnifiedAI(
        claude_key="sk-ant-api03-xxxxx",
        openai_key="sk-xxxxx"
    )

    # 使用預設 provider
    print(ai.chat("Hello!"))

    # 指定 provider
    print(ai.chat("Hello!", provider="openai"))

    # 比較兩者回應
    results = ai.compare("用一句話解釋什麼是 AI")
    for provider, response in results.items():
        print(f"\n{provider}:\n{response}")
```

---

## 3. 方案 B：使用 Session Token 模擬登入

這種方式使用你的訂閱帳號，不需要額外付 API 費用。

### 3.1 取得 Session Token

#### Claude (claude.ai)

1. 登入 https://claude.ai
2. 打開開發者工具 (F12)
3. 切換到 Application → Cookies
4. 找到並複製以下 Cookie：
   - `sessionKey` 或 `__Secure-next-auth.session-token`

```
Claude Cookie 位置：
Application → Cookies → https://claude.ai
找到：sessionKey
```

#### ChatGPT (chat.openai.com)

1. 登入 https://chat.openai.com
2. 打開開發者工具 (F12)
3. 切換到 Application → Cookies
4. 找到並複製：
   - `__Secure-next-auth.session-token`

### 3.2 Claude Session Token 實作

```python
# claude_session.py
import requests
import json
import uuid
from typing import Generator, Optional

class ClaudeSession:
    """使用 Session Token 存取 Claude"""

    BASE_URL = "https://claude.ai/api"

    def __init__(self, session_key: str):
        """
        初始化 Claude Session

        Args:
            session_key: 從瀏覽器取得的 sessionKey cookie
        """
        self.session = requests.Session()
        self.session.cookies.set("sessionKey", session_key, domain="claude.ai")

        # 設定 Headers 模擬瀏覽器
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        })

        self.organization_id = None
        self.conversation_id = None

    def _get_organization_id(self) -> str:
        """取得組織 ID"""
        if self.organization_id:
            return self.organization_id

        response = self.session.get(f"{self.BASE_URL}/organizations")
        response.raise_for_status()

        orgs = response.json()
        if orgs:
            self.organization_id = orgs[0]["uuid"]

        return self.organization_id

    def create_conversation(self) -> str:
        """建立新對話"""
        org_id = self._get_organization_id()

        response = self.session.post(
            f"{self.BASE_URL}/organizations/{org_id}/chat_conversations",
            json={
                "uuid": str(uuid.uuid4()),
                "name": ""
            }
        )
        response.raise_for_status()

        data = response.json()
        self.conversation_id = data["uuid"]
        return self.conversation_id

    def chat(self, message: str, conversation_id: str = None) -> str:
        """發送訊息"""
        org_id = self._get_organization_id()
        conv_id = conversation_id or self.conversation_id

        if not conv_id:
            conv_id = self.create_conversation()

        response = self.session.post(
            f"{self.BASE_URL}/organizations/{org_id}/chat_conversations/{conv_id}/completion",
            json={
                "prompt": message,
                "timezone": "Asia/Taipei",
                "attachments": [],
                "files": []
            },
            stream=True
        )
        response.raise_for_status()

        # 解析 SSE 回應
        full_response = ""
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if "completion" in data:
                            full_response += data["completion"]
                    except json.JSONDecodeError:
                        pass

        return full_response

    def stream_chat(self, message: str, conversation_id: str = None) -> Generator[str, None, None]:
        """串流回應"""
        org_id = self._get_organization_id()
        conv_id = conversation_id or self.conversation_id

        if not conv_id:
            conv_id = self.create_conversation()

        response = self.session.post(
            f"{self.BASE_URL}/organizations/{org_id}/chat_conversations/{conv_id}/completion",
            json={
                "prompt": message,
                "timezone": "Asia/Taipei",
                "attachments": [],
                "files": []
            },
            stream=True
        )
        response.raise_for_status()

        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if "completion" in data:
                            yield data["completion"]
                    except json.JSONDecodeError:
                        pass


# 使用範例
if __name__ == "__main__":
    # 從瀏覽器取得 sessionKey
    claude = ClaudeSession(session_key="sk-ant-sid01-xxxxx")

    # 建立對話
    claude.create_conversation()

    # 發送訊息
    response = claude.chat("你好！請自我介紹")
    print(response)

    # 串流回應
    for chunk in claude.stream_chat("寫一個 Python Hello World"):
        print(chunk, end="", flush=True)
```

### 3.3 ChatGPT Session Token 實作

```python
# chatgpt_session.py
import requests
import json
import uuid
from typing import Generator

class ChatGPTSession:
    """使用 Session Token 存取 ChatGPT"""

    BASE_URL = "https://chat.openai.com"
    API_URL = "https://chat.openai.com/backend-api"

    def __init__(self, session_token: str):
        """
        初始化 ChatGPT Session

        Args:
            session_token: __Secure-next-auth.session-token cookie
        """
        self.session = requests.Session()
        self.session.cookies.set(
            "__Secure-next-auth.session-token",
            session_token,
            domain="chat.openai.com"
        )

        # 模擬瀏覽器 Headers
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/event-stream",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Referer": "https://chat.openai.com/",
            "Origin": "https://chat.openai.com",
        })

        self.access_token = None
        self.conversation_id = None

    def _get_access_token(self) -> str:
        """取得 Access Token"""
        if self.access_token:
            return self.access_token

        response = self.session.get(f"{self.BASE_URL}/api/auth/session")
        response.raise_for_status()

        data = response.json()
        self.access_token = data.get("accessToken")

        if not self.access_token:
            raise Exception("無法取得 Access Token，請檢查 Session Token 是否有效")

        # 更新 Authorization header
        self.session.headers["Authorization"] = f"Bearer {self.access_token}"

        return self.access_token

    def chat(self, message: str, model: str = "gpt-4") -> str:
        """發送訊息"""
        self._get_access_token()

        message_id = str(uuid.uuid4())
        parent_id = str(uuid.uuid4())

        payload = {
            "action": "next",
            "messages": [
                {
                    "id": message_id,
                    "author": {"role": "user"},
                    "content": {
                        "content_type": "text",
                        "parts": [message]
                    }
                }
            ],
            "parent_message_id": parent_id,
            "model": model,
            "timezone_offset_min": -480,
            "suggestions": [],
            "history_and_training_disabled": False,
            "conversation_mode": {"kind": "primary_assistant"},
            "websocket_request_id": str(uuid.uuid4())
        }

        if self.conversation_id:
            payload["conversation_id"] = self.conversation_id

        response = self.session.post(
            f"{self.API_URL}/conversation",
            json=payload,
            stream=True
        )
        response.raise_for_status()

        # 解析 SSE 回應
        full_response = ""
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        if "message" in data:
                            msg = data["message"]
                            if msg.get("author", {}).get("role") == "assistant":
                                content = msg.get("content", {})
                                if content.get("content_type") == "text":
                                    parts = content.get("parts", [])
                                    if parts:
                                        full_response = parts[0]

                        # 儲存 conversation_id
                        if "conversation_id" in data:
                            self.conversation_id = data["conversation_id"]
                    except json.JSONDecodeError:
                        pass

        return full_response

    def stream_chat(self, message: str, model: str = "gpt-4") -> Generator[str, None, None]:
        """串流回應"""
        self._get_access_token()

        message_id = str(uuid.uuid4())
        parent_id = str(uuid.uuid4())

        payload = {
            "action": "next",
            "messages": [
                {
                    "id": message_id,
                    "author": {"role": "user"},
                    "content": {
                        "content_type": "text",
                        "parts": [message]
                    }
                }
            ],
            "parent_message_id": parent_id,
            "model": model,
            "timezone_offset_min": -480,
            "suggestions": [],
            "history_and_training_disabled": False,
            "conversation_mode": {"kind": "primary_assistant"},
            "websocket_request_id": str(uuid.uuid4())
        }

        if self.conversation_id:
            payload["conversation_id"] = self.conversation_id

        response = self.session.post(
            f"{self.API_URL}/conversation",
            json=payload,
            stream=True
        )
        response.raise_for_status()

        prev_text = ""
        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith("data: ") and line != "data: [DONE]":
                    try:
                        data = json.loads(line[6:])
                        if "message" in data:
                            msg = data["message"]
                            if msg.get("author", {}).get("role") == "assistant":
                                content = msg.get("content", {})
                                if content.get("content_type") == "text":
                                    parts = content.get("parts", [])
                                    if parts:
                                        current_text = parts[0]
                                        # 只 yield 新增的部分
                                        if len(current_text) > len(prev_text):
                                            yield current_text[len(prev_text):]
                                            prev_text = current_text

                        if "conversation_id" in data:
                            self.conversation_id = data["conversation_id"]
                    except json.JSONDecodeError:
                        pass


# 使用範例
if __name__ == "__main__":
    gpt = ChatGPTSession(session_token="eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0...")

    # 發送訊息
    response = gpt.chat("你好！", model="gpt-4")
    print(response)

    # 串流回應
    for chunk in gpt.stream_chat("寫一個快速排序"):
        print(chunk, end="", flush=True)
```

---

## 4. 方案 C：使用瀏覽器自動化

這種方式可以完全繞過 Cloudflare，因為使用真實瀏覽器。

### 4.1 安裝依賴

```bash
pip install playwright
playwright install chromium
```

### 4.2 Playwright 自動化實作

```python
# browser_automation.py
import asyncio
from playwright.async_api import async_playwright, Page, Browser
from typing import AsyncGenerator
import json

class ClaudeBrowser:
    """使用瀏覽器自動化操作 Claude"""

    def __init__(self):
        self.browser: Browser = None
        self.page: Page = None
        self.playwright = None

    async def start(self, headless: bool = True, user_data_dir: str = None):
        """
        啟動瀏覽器

        Args:
            headless: 是否無頭模式
            user_data_dir: 使用者資料目錄（保留登入狀態）
        """
        self.playwright = await async_playwright().start()

        # 使用持久化 context 保留登入狀態
        if user_data_dir:
            self.browser = await self.playwright.chromium.launch_persistent_context(
                user_data_dir,
                headless=headless,
                viewport={"width": 1280, "height": 720},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            )
            self.page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()
        else:
            self.browser = await self.playwright.chromium.launch(headless=headless)
            context = await self.browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            )
            self.page = await context.new_page()

    async def login(self, email: str, password: str):
        """
        登入 Claude

        首次登入後，如果使用 user_data_dir，後續會自動保持登入狀態
        """
        await self.page.goto("https://claude.ai/login")

        # 等待頁面載入
        await self.page.wait_for_load_state("networkidle")

        # 檢查是否已登入
        if "claude.ai/new" in self.page.url or "claude.ai/chat" in self.page.url:
            print("已經登入")
            return

        # 輸入 Email
        await self.page.fill('input[type="email"]', email)
        await self.page.click('button[type="submit"]')

        # 等待密碼輸入框
        await self.page.wait_for_selector('input[type="password"]', timeout=10000)
        await self.page.fill('input[type="password"]', password)
        await self.page.click('button[type="submit"]')

        # 等待登入完成
        await self.page.wait_for_url("**/claude.ai/**", timeout=30000)
        print("登入成功")

    async def chat(self, message: str) -> str:
        """發送訊息並取得回應"""
        # 確保在聊天頁面
        if "claude.ai/new" not in self.page.url and "claude.ai/chat" not in self.page.url:
            await self.page.goto("https://claude.ai/new")
            await self.page.wait_for_load_state("networkidle")

        # 找到輸入框並輸入訊息
        textarea = await self.page.wait_for_selector('div[contenteditable="true"]')
        await textarea.fill(message)

        # 點擊送出按鈕
        send_button = await self.page.wait_for_selector('button[aria-label="Send message"]')
        await send_button.click()

        # 等待回應完成
        # 等待 "Stop" 按鈕消失，表示生成完成
        await self.page.wait_for_selector('button[aria-label="Stop"]', state="hidden", timeout=120000)

        # 取得最後一個回應
        responses = await self.page.query_selector_all('[data-testid="assistant-message"]')
        if responses:
            last_response = responses[-1]
            return await last_response.inner_text()

        return ""

    async def close(self):
        """關閉瀏覽器"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()


class ChatGPTBrowser:
    """使用瀏覽器自動化操作 ChatGPT"""

    def __init__(self):
        self.browser: Browser = None
        self.page: Page = None
        self.playwright = None

    async def start(self, headless: bool = True, user_data_dir: str = None):
        """啟動瀏覽器"""
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

    async def login(self, email: str, password: str):
        """登入 ChatGPT"""
        await self.page.goto("https://chat.openai.com/auth/login")
        await self.page.wait_for_load_state("networkidle")

        # 檢查是否已登入
        if "chat.openai.com/c" in self.page.url or "chat.openai.com/?model" in self.page.url:
            print("已經登入")
            return

        # 點擊 "Log in" 按鈕
        await self.page.click('button:has-text("Log in")')

        # 輸入 Email
        await self.page.wait_for_selector('input[name="username"]')
        await self.page.fill('input[name="username"]', email)
        await self.page.click('button[type="submit"]')

        # 輸入密碼
        await self.page.wait_for_selector('input[name="password"]')
        await self.page.fill('input[name="password"]', password)
        await self.page.click('button[type="submit"]')

        # 等待登入完成
        await self.page.wait_for_url("**/chat.openai.com/**", timeout=30000)
        print("登入成功")

    async def chat(self, message: str) -> str:
        """發送訊息並取得回應"""
        # 確保在聊天頁面
        if "chat.openai.com" not in self.page.url:
            await self.page.goto("https://chat.openai.com/")
            await self.page.wait_for_load_state("networkidle")

        # 找到輸入框
        textarea = await self.page.wait_for_selector('textarea[id="prompt-textarea"]')
        await textarea.fill(message)

        # 點擊送出
        await self.page.keyboard.press("Enter")

        # 等待回應完成（等待 "Stop generating" 按鈕消失）
        try:
            await self.page.wait_for_selector('button:has-text("Stop generating")', timeout=5000)
            await self.page.wait_for_selector('button:has-text("Stop generating")', state="hidden", timeout=120000)
        except:
            pass

        # 取得回應
        await asyncio.sleep(1)  # 確保內容完全載入
        responses = await self.page.query_selector_all('[data-message-author-role="assistant"]')
        if responses:
            last_response = responses[-1]
            return await last_response.inner_text()

        return ""

    async def close(self):
        """關閉瀏覽器"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()


# 使用範例
async def main():
    # Claude 自動化
    claude = ClaudeBrowser()
    await claude.start(
        headless=False,  # 首次登入設為 False 以便手動處理驗證
        user_data_dir="./claude_user_data"  # 保存登入狀態
    )

    # 首次需要登入
    # await claude.login("your_email@example.com", "your_password")

    response = await claude.chat("你好！")
    print(f"Claude: {response}")

    await claude.close()

    # ChatGPT 自動化
    gpt = ChatGPTBrowser()
    await gpt.start(
        headless=False,
        user_data_dir="./chatgpt_user_data"
    )

    response = await gpt.chat("你好！")
    print(f"ChatGPT: {response}")

    await gpt.close()


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 5. 繞過 Cloudflare 的技術

### 5.1 為什麼會遇到 Cloudflare？

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare 檢測原理                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Cloudflare 檢測以下特徵：                                      │
│                                                                 │
│   1. TLS 指紋 (JA3)                                             │
│      - 加密套件順序                                              │
│      - 擴展順序                                                  │
│      - 支援的曲線                                                │
│                                                                 │
│   2. HTTP/2 指紋                                                │
│      - SETTINGS frame 順序                                      │
│      - WINDOW_UPDATE 值                                         │
│      - HEADERS frame 優先級                                     │
│                                                                 │
│   3. 瀏覽器特徵                                                  │
│      - User-Agent                                               │
│      - Headers 順序                                             │
│      - JavaScript 執行結果                                       │
│                                                                 │
│   4. 行為特徵                                                    │
│      - 請求頻率                                                  │
│      - 滑鼠/鍵盤模式                                             │
│      - 頁面停留時間                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 使用 curl_cffi（模擬瀏覽器 TLS 指紋）

```bash
pip install curl_cffi
```

```python
# cloudflare_bypass.py
from curl_cffi import requests

class CloudflareBypass:
    """使用 curl_cffi 繞過 Cloudflare"""

    def __init__(self):
        # 使用 Chrome 的 TLS 指紋
        self.session = requests.Session(impersonate="chrome120")

    def get(self, url: str, **kwargs) -> requests.Response:
        return self.session.get(url, **kwargs)

    def post(self, url: str, **kwargs) -> requests.Response:
        return self.session.post(url, **kwargs)


# 使用範例
if __name__ == "__main__":
    cf = CloudflareBypass()

    # 這個請求會帶有 Chrome 的 TLS 指紋
    response = cf.get("https://claude.ai")
    print(response.status_code)
```

### 5.3 使用 undetected-chromedriver

```bash
pip install undetected-chromedriver
```

```python
# undetected_chrome.py
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

class UndetectedBrowser:
    """使用 undetected-chromedriver 繞過檢測"""

    def __init__(self):
        self.driver = None

    def start(self, headless: bool = False):
        options = uc.ChromeOptions()
        if headless:
            options.add_argument('--headless')

        self.driver = uc.Chrome(options=options)

    def login_claude(self, email: str, password: str):
        self.driver.get("https://claude.ai/login")
        time.sleep(3)

        # 輸入 email
        email_input = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="email"]'))
        )
        email_input.send_keys(email)

        # 點擊繼續
        submit_btn = self.driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        submit_btn.click()

        # 等待密碼框
        time.sleep(2)
        password_input = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="password"]'))
        )
        password_input.send_keys(password)

        # 點擊登入
        submit_btn = self.driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]')
        submit_btn.click()

        # 等待登入完成
        time.sleep(5)

    def chat(self, message: str) -> str:
        # 找到輸入框
        textarea = WebDriverWait(self.driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'div[contenteditable="true"]'))
        )
        textarea.send_keys(message)

        # 送出
        send_btn = self.driver.find_element(By.CSS_SELECTOR, 'button[aria-label="Send message"]')
        send_btn.click()

        # 等待回應
        time.sleep(10)

        # 取得回應
        responses = self.driver.find_elements(By.CSS_SELECTOR, '[data-testid="assistant-message"]')
        if responses:
            return responses[-1].text

        return ""

    def close(self):
        if self.driver:
            self.driver.quit()


# 使用範例
if __name__ == "__main__":
    browser = UndetectedBrowser()
    browser.start(headless=False)

    browser.login_claude("email@example.com", "password")
    response = browser.chat("你好！")
    print(response)

    browser.close()
```

### 5.4 使用 DrissionPage（推薦）

```bash
pip install DrissionPage
```

```python
# drission_page_example.py
from DrissionPage import ChromiumPage, ChromiumOptions

class DrissionBrowser:
    """使用 DrissionPage 繞過 Cloudflare"""

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

        # 檢查是否需要登入
        if "login" in self.page.url:
            if email and password:
                # 自動登入
                self.page.ele('input[type="email"]').input(email)
                self.page.ele('button[type="submit"]').click()
                self.page.wait.load_start()

                self.page.ele('input[type="password"]').input(password)
                self.page.ele('button[type="submit"]').click()
                self.page.wait.load_start()
            else:
                # 等待手動登入
                print("請在瀏覽器中手動登入...")
                self.page.wait.url_change(timeout=120)

    def chat(self, message: str) -> str:
        # 找到輸入框
        textarea = self.page.ele('div[contenteditable="true"]')
        textarea.input(message)

        # 送出
        self.page.ele('button[aria-label="Send message"]').click()

        # 等待回應完成
        self.page.wait.ele_hidden('button[aria-label="Stop"]', timeout=120)

        # 取得回應
        responses = self.page.eles('[data-testid="assistant-message"]')
        if responses:
            return responses[-1].text

        return ""

    def close(self):
        if self.page:
            self.page.quit()


# 使用範例
if __name__ == "__main__":
    browser = DrissionBrowser()
    browser.start(user_data_dir="./drission_user_data")

    browser.login_claude()  # 首次會等待手動登入

    response = browser.chat("你好！")
    print(response)

    browser.close()
```

---

## 6. 完整專案範例

### 6.1 專案結構

```
ai_automation/
├── config.py           # 設定檔
├── providers/
│   ├── __init__.py
│   ├── base.py         # 基礎類別
│   ├── claude_api.py   # Claude API
│   ├── claude_session.py   # Claude Session
│   ├── openai_api.py   # OpenAI API
│   └── openai_session.py   # OpenAI Session
├── utils/
│   ├── __init__.py
│   └── cloudflare.py   # Cloudflare 繞過工具
├── main.py             # 主程式
└── requirements.txt
```

### 6.2 requirements.txt

```
anthropic>=0.18.0
openai>=1.12.0
requests>=2.31.0
curl_cffi>=0.6.0
playwright>=1.41.0
DrissionPage>=4.0.0
python-dotenv>=1.0.0
```

### 6.3 config.py

```python
# config.py
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # API Keys
    CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

    # Session Tokens
    CLAUDE_SESSION_KEY = os.getenv("CLAUDE_SESSION_KEY")
    OPENAI_SESSION_TOKEN = os.getenv("OPENAI_SESSION_TOKEN")

    # 帳號密碼（用於瀏覽器自動化）
    CLAUDE_EMAIL = os.getenv("CLAUDE_EMAIL")
    CLAUDE_PASSWORD = os.getenv("CLAUDE_PASSWORD")
    OPENAI_EMAIL = os.getenv("OPENAI_EMAIL")
    OPENAI_PASSWORD = os.getenv("OPENAI_PASSWORD")

    # 設定
    USE_API = os.getenv("USE_API", "true").lower() == "true"
    HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"
```

### 6.4 main.py

```python
# main.py
import asyncio
from enum import Enum
from typing import Optional
from config import Config

class ProviderType(Enum):
    CLAUDE = "claude"
    OPENAI = "openai"

class AuthMethod(Enum):
    API = "api"
    SESSION = "session"
    BROWSER = "browser"

class AIAutomation:
    """統一的 AI 自動化介面"""

    def __init__(self, auth_method: AuthMethod = AuthMethod.API):
        self.auth_method = auth_method
        self.providers = {}

    async def initialize(self):
        """初始化所有 Provider"""
        if self.auth_method == AuthMethod.API:
            await self._init_api()
        elif self.auth_method == AuthMethod.SESSION:
            await self._init_session()
        else:
            await self._init_browser()

    async def _init_api(self):
        """使用官方 API 初始化"""
        if Config.CLAUDE_API_KEY:
            import anthropic
            self.providers[ProviderType.CLAUDE] = anthropic.Anthropic(
                api_key=Config.CLAUDE_API_KEY
            )

        if Config.OPENAI_API_KEY:
            from openai import OpenAI
            self.providers[ProviderType.OPENAI] = OpenAI(
                api_key=Config.OPENAI_API_KEY
            )

    async def _init_session(self):
        """使用 Session Token 初始化"""
        if Config.CLAUDE_SESSION_KEY:
            from providers.claude_session import ClaudeSession
            self.providers[ProviderType.CLAUDE] = ClaudeSession(
                session_key=Config.CLAUDE_SESSION_KEY
            )

        if Config.OPENAI_SESSION_TOKEN:
            from providers.openai_session import ChatGPTSession
            self.providers[ProviderType.OPENAI] = ChatGPTSession(
                session_token=Config.OPENAI_SESSION_TOKEN
            )

    async def _init_browser(self):
        """使用瀏覽器自動化初始化"""
        from DrissionPage import ChromiumPage, ChromiumOptions

        options = ChromiumOptions()
        if Config.HEADLESS:
            options.headless()

        # Claude
        self.providers[ProviderType.CLAUDE] = {
            "page": ChromiumPage(options),
            "logged_in": False
        }

        # OpenAI
        self.providers[ProviderType.OPENAI] = {
            "page": ChromiumPage(options),
            "logged_in": False
        }

    async def chat(
        self,
        message: str,
        provider: ProviderType = ProviderType.CLAUDE,
        stream: bool = False
    ):
        """發送訊息"""
        if provider not in self.providers:
            raise ValueError(f"Provider {provider.value} 未初始化")

        if self.auth_method == AuthMethod.API:
            return await self._chat_api(message, provider, stream)
        elif self.auth_method == AuthMethod.SESSION:
            return await self._chat_session(message, provider, stream)
        else:
            return await self._chat_browser(message, provider)

    async def _chat_api(self, message: str, provider: ProviderType, stream: bool):
        """使用 API 聊天"""
        client = self.providers[provider]

        if provider == ProviderType.CLAUDE:
            if stream:
                with client.messages.stream(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    messages=[{"role": "user", "content": message}]
                ) as response:
                    for text in response.text_stream:
                        yield text
            else:
                response = client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=4096,
                    messages=[{"role": "user", "content": message}]
                )
                return response.content[0].text

        elif provider == ProviderType.OPENAI:
            if stream:
                response = client.chat.completions.create(
                    model="gpt-4-turbo",
                    messages=[{"role": "user", "content": message}],
                    stream=True
                )
                for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            else:
                response = client.chat.completions.create(
                    model="gpt-4-turbo",
                    messages=[{"role": "user", "content": message}]
                )
                return response.choices[0].message.content

    async def _chat_session(self, message: str, provider: ProviderType, stream: bool):
        """使用 Session Token 聊天"""
        client = self.providers[provider]

        if stream:
            for chunk in client.stream_chat(message):
                yield chunk
        else:
            return client.chat(message)

    async def _chat_browser(self, message: str, provider: ProviderType):
        """使用瀏覽器聊天"""
        browser_data = self.providers[provider]
        page = browser_data["page"]

        if not browser_data["logged_in"]:
            # 需要先登入
            if provider == ProviderType.CLAUDE:
                page.get("https://claude.ai")
            else:
                page.get("https://chat.openai.com")

            print(f"請在瀏覽器中登入 {provider.value}...")
            input("登入完成後按 Enter 繼續...")
            browser_data["logged_in"] = True

        # 發送訊息
        if provider == ProviderType.CLAUDE:
            textarea = page.ele('div[contenteditable="true"]')
            textarea.input(message)
            page.ele('button[aria-label="Send message"]').click()
            page.wait.ele_hidden('button[aria-label="Stop"]', timeout=120)
            responses = page.eles('[data-testid="assistant-message"]')
        else:
            textarea = page.ele('textarea[id="prompt-textarea"]')
            textarea.input(message)
            page.ele('button[data-testid="send-button"]').click()
            page.wait(10)
            responses = page.eles('[data-message-author-role="assistant"]')

        if responses:
            return responses[-1].text
        return ""

    async def close(self):
        """關閉所有資源"""
        if self.auth_method == AuthMethod.BROWSER:
            for provider_data in self.providers.values():
                if isinstance(provider_data, dict) and "page" in provider_data:
                    provider_data["page"].quit()


# 主程式
async def main():
    # 選擇認證方式
    print("選擇認證方式：")
    print("1. API Key（推薦）")
    print("2. Session Token")
    print("3. 瀏覽器自動化")

    choice = input("請輸入選項 (1/2/3): ").strip()

    auth_methods = {
        "1": AuthMethod.API,
        "2": AuthMethod.SESSION,
        "3": AuthMethod.BROWSER
    }

    auth_method = auth_methods.get(choice, AuthMethod.API)

    # 初始化
    ai = AIAutomation(auth_method=auth_method)
    await ai.initialize()

    # 互動迴圈
    print("\n開始對話（輸入 'quit' 退出，輸入 'switch' 切換 Provider）")
    current_provider = ProviderType.CLAUDE

    while True:
        user_input = input(f"\n[{current_provider.value}] You: ").strip()

        if user_input.lower() == "quit":
            break
        elif user_input.lower() == "switch":
            current_provider = (
                ProviderType.OPENAI
                if current_provider == ProviderType.CLAUDE
                else ProviderType.CLAUDE
            )
            print(f"已切換到 {current_provider.value}")
            continue

        try:
            if auth_method == AuthMethod.API:
                # API 模式支援串流
                print(f"\n[{current_provider.value}] AI: ", end="", flush=True)
                async for chunk in ai.chat(user_input, current_provider, stream=True):
                    print(chunk, end="", flush=True)
                print()
            else:
                response = await ai.chat(user_input, current_provider)
                print(f"\n[{current_provider.value}] AI: {response}")
        except Exception as e:
            print(f"\n錯誤: {e}")

    await ai.close()
    print("再見！")


if __name__ == "__main__":
    asyncio.run(main())
```

### 6.5 .env 範例

```bash
# .env

# API Keys（方案 A）
CLAUDE_API_KEY=sk-ant-api03-xxxxx
OPENAI_API_KEY=sk-xxxxx

# Session Tokens（方案 B）
CLAUDE_SESSION_KEY=sk-ant-sid01-xxxxx
OPENAI_SESSION_TOKEN=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0...

# 帳號密碼（方案 C - 瀏覽器自動化）
CLAUDE_EMAIL=your_email@example.com
CLAUDE_PASSWORD=your_password
OPENAI_EMAIL=your_email@example.com
OPENAI_PASSWORD=your_password

# 設定
USE_API=true
HEADLESS=false
```

---

## 7. 常見問題與解決方案

### 7.1 Cloudflare 攔截

**問題**：收到 403 或看到 Cloudflare 驗證頁面

**解決方案**：
```python
# 使用 curl_cffi
from curl_cffi import requests
session = requests.Session(impersonate="chrome120")

# 或使用瀏覽器自動化
from DrissionPage import ChromiumPage
page = ChromiumPage()
```

### 7.2 Session Token 過期

**問題**：Session Token 失效，無法認證

**解決方案**：
```python
class SessionManager:
    def __init__(self):
        self.token = None
        self.expires_at = None

    def is_expired(self) -> bool:
        if not self.expires_at:
            return True
        return datetime.now() > self.expires_at

    async def refresh_token(self):
        # 使用瀏覽器重新登入取得新 Token
        pass

    async def get_valid_token(self) -> str:
        if self.is_expired():
            await self.refresh_token()
        return self.token
```

### 7.3 Rate Limit

**問題**：請求太頻繁被限制

**解決方案**：
```python
import asyncio
from functools import wraps

def rate_limit(calls_per_minute: int):
    """速率限制裝飾器"""
    interval = 60 / calls_per_minute
    last_call = [0]

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            elapsed = asyncio.get_event_loop().time() - last_call[0]
            if elapsed < interval:
                await asyncio.sleep(interval - elapsed)

            last_call[0] = asyncio.get_event_loop().time()
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# 使用
@rate_limit(calls_per_minute=10)
async def chat(message: str):
    pass
```

### 7.4 多帳號輪換

**問題**：單一帳號限制太多

**解決方案**：
```python
class AccountPool:
    def __init__(self, accounts: list):
        self.accounts = accounts
        self.current_index = 0

    def get_next_account(self):
        account = self.accounts[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.accounts)
        return account

    async def chat_with_rotation(self, message: str):
        account = self.get_next_account()
        # 使用該帳號發送訊息
        pass
```

---

## 總結

| 方案 | 優點 | 缺點 | 適用場景 |
|------|------|------|----------|
| **API** | 穩定、簡單、官方支援 | 需另外付費 | 正式專案 |
| **Session** | 使用訂閱額度、較省錢 | 可能失效、需手動更新 | 個人使用 |
| **瀏覽器** | 最穩定繞過檢測 | 資源消耗大、較慢 | 特殊需求 |

**建議**：
1. 正式專案 → 使用官方 API
2. 個人學習/測試 → Session Token + curl_cffi
3. 需要完全模擬人類 → 瀏覽器自動化 (DrissionPage)

---

*文件最後更新：2026-01-19*
