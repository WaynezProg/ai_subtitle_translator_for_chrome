/**
 * ChatGPT OAuth Authentication
 * 
 * Implements OAuth 2.0 PKCE flow for ChatGPT Plus subscription authentication.
 * Based on the opencode implementation.
 * 
 * @see https://platform.openai.com/docs/guides/authentication
 */

import {
  startPKCEFlow,
  completePKCEFlow,
  buildAuthorizationUrl,
} from './oauth-pkce';

// ============================================================================
// Constants
// ============================================================================

const CHATGPT_OAUTH_CONFIG = {
  // OAuth client ID for ChatGPT (from opencode)
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  
  // OAuth endpoints (using OpenAI's auth issuer)
  issuer: 'https://auth.openai.com',
  authorizationUrl: 'https://auth.openai.com/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  
  // Required scopes
  scopes: ['openid', 'email', 'profile'],
  
  // API endpoints for using the token
  apiBaseUrl: 'https://chatgpt.com',
  chatEndpoint: '/backend-api/conversation',
};

// Redirect URI will be the extension's callback
const getRedirectUri = (): string => {
  const extensionId = chrome.runtime.id;
  return `https://${extensionId}.chromiumapp.org/oauth/callback`;
};

// ============================================================================
// Types
// ============================================================================

export interface ChatGPTOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

export interface ChatGPTUserInfo {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
}

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Start the ChatGPT OAuth flow
 * Opens a new window for the user to authenticate with ChatGPT
 */
export async function startChatGPTOAuth(): Promise<string> {
  const providerType = 'chatgpt-subscription';
  
  // Generate PKCE challenge
  const { codeChallenge, codeChallengeMethod, state } = await startPKCEFlow(providerType);
  
  // Build authorization URL with additional OpenID Connect parameters
  const url = new URL(CHATGPT_OAUTH_CONFIG.authorizationUrl);
  url.searchParams.set('client_id', CHATGPT_OAUTH_CONFIG.clientId);
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', CHATGPT_OAUTH_CONFIG.scopes.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', codeChallengeMethod);
  url.searchParams.set('state', state);
  url.searchParams.set('audience', 'https://api.openai.com/v1');
  
  return url.toString();
}

/**
 * Complete the ChatGPT OAuth flow by exchanging the authorization code for tokens
 */
export async function completeChatGPTOAuth(
  authorizationCode: string,
  state: string
): Promise<ChatGPTOAuthTokens> {
  const tokens = await completePKCEFlow(
    state,
    authorizationCode,
    CHATGPT_OAUTH_CONFIG.tokenUrl,
    CHATGPT_OAUTH_CONFIG.clientId,
    getRedirectUri()
  );
  
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : undefined;
  
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
    scopes: CHATGPT_OAUTH_CONFIG.scopes,
  };
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshChatGPTToken(refreshToken: string): Promise<ChatGPTOAuthTokens> {
  const response = await fetch(CHATGPT_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CHATGPT_OAUTH_CONFIG.clientId,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }
  
  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };
  
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined;
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    idToken: data.id_token,
    expiresAt,
    scopes: CHATGPT_OAUTH_CONFIG.scopes,
  };
}

/**
 * Validate the access token by making a test API call
 */
export async function validateChatGPTToken(accessToken: string): Promise<boolean> {
  try {
    // Try to make a simple API call to validate the token
    const response = await fetch(`${CHATGPT_OAUTH_CONFIG.apiBaseUrl}/backend-api/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Make a chat request using the OAuth token
 */
export async function chatWithChatGPTOAuth(
  accessToken: string,
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  model: string = 'gpt-4'
): Promise<string> {
  // ChatGPT uses a different API format for conversations
  const response = await fetch(`${CHATGPT_OAUTH_CONFIG.apiBaseUrl}${CHATGPT_OAUTH_CONFIG.chatEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: 'next',
      messages: messages.map((m, i) => ({
        id: crypto.randomUUID(),
        author: { role: m.role },
        content: { content_type: 'text', parts: [m.content] },
        metadata: {},
      })),
      model,
      parent_message_id: crypto.randomUUID(),
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    
    if (response.status === 401) {
      throw new Error('TOKEN_EXPIRED');
    }
    
    throw new Error(`ChatGPT API error: ${response.status} - ${errorText}`);
  }
  
  // ChatGPT returns server-sent events
  const text = await response.text();
  const lines = text.split('\n').filter(line => line.startsWith('data: '));
  
  let fullResponse = '';
  for (const line of lines) {
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    
    try {
      const parsed = JSON.parse(data) as {
        message?: {
          content?: {
            parts?: string[];
          };
        };
      };
      
      if (parsed.message?.content?.parts) {
        fullResponse = parsed.message.content.parts.join('');
      }
    } catch {
      // Skip invalid JSON
    }
  }
  
  return fullResponse;
}

/**
 * Check if the token is expired or about to expire (within 5 minutes)
 */
export function isChatGPTTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  
  const expirationTime = new Date(expiresAt).getTime();
  const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
  
  return Date.now() >= expirationTime - bufferTime;
}

// ============================================================================
// Chrome Extension OAuth Handler
// ============================================================================

/**
 * Launch OAuth flow using chrome.identity.launchWebAuthFlow
 * This is the recommended way to handle OAuth in Chrome extensions
 */
export async function launchChatGPTOAuthFlow(): Promise<ChatGPTOAuthTokens> {
  const authUrl = await startChatGPTOAuth();
  
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true,
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!redirectUrl) {
          reject(new Error('OAuth flow cancelled or failed'));
          return;
        }
        
        try {
          // Parse the redirect URL to get the authorization code
          const url = new URL(redirectUrl);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          
          if (error) {
            reject(new Error(`OAuth error: ${error}`));
            return;
          }
          
          if (!code || !state) {
            reject(new Error('Missing authorization code or state'));
            return;
          }
          
          // Exchange the code for tokens
          const tokens = await completeChatGPTOAuth(code, state);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ============================================================================
// Token Storage
// ============================================================================

const TOKEN_STORAGE_KEY = 'chatgpt_oauth_tokens';

/**
 * Store OAuth tokens securely
 */
export async function storeChatGPTTokens(tokens: ChatGPTOAuthTokens): Promise<void> {
  await chrome.storage.local.set({
    [TOKEN_STORAGE_KEY]: tokens,
  });
}

/**
 * Retrieve stored OAuth tokens
 */
export async function getStoredChatGPTTokens(): Promise<ChatGPTOAuthTokens | null> {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return result[TOKEN_STORAGE_KEY] || null;
}

/**
 * Clear stored OAuth tokens
 */
export async function clearChatGPTTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidChatGPTToken(): Promise<string | null> {
  const tokens = await getStoredChatGPTTokens();
  
  if (!tokens) {
    return null;
  }
  
  // Check if token is expired
  if (isChatGPTTokenExpired(tokens.expiresAt)) {
    if (!tokens.refreshToken) {
      // No refresh token, need to re-authenticate
      await clearChatGPTTokens();
      return null;
    }
    
    try {
      // Refresh the token
      const newTokens = await refreshChatGPTToken(tokens.refreshToken);
      await storeChatGPTTokens(newTokens);
      return newTokens.accessToken;
    } catch {
      // Refresh failed, clear tokens
      await clearChatGPTTokens();
      return null;
    }
  }
  
  return tokens.accessToken;
}
