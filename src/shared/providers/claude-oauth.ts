/**
 * Claude OAuth Authentication
 * 
 * Implements OAuth 2.0 PKCE flow for Claude Pro subscription authentication.
 * Based on the opencode implementation.
 * 
 * @see https://docs.anthropic.com/en/docs/oauth
 */

import {
  startPKCEFlow,
  completePKCEFlow,
  buildAuthorizationUrl,
} from './oauth-pkce';

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_OAUTH_CONFIG = {
  // OAuth client ID for Claude (from opencode)
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  
  // OAuth endpoints
  authorizationUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  
  // Required scopes
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  
  // API endpoints for using the token
  apiBaseUrl: 'https://api.anthropic.com',
  messagesEndpoint: '/v1/messages',
};

// Redirect URI will be the extension's options page with a callback path
const getRedirectUri = (): string => {
  const extensionId = chrome.runtime.id;
  return `https://${extensionId}.chromiumapp.org/oauth/callback`;
};

// ============================================================================
// Types
// ============================================================================

export interface ClaudeOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

export interface ClaudeUserInfo {
  id: string;
  email?: string;
  name?: string;
}

// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Start the Claude OAuth flow
 * Opens a new window for the user to authenticate with Claude
 */
export async function startClaudeOAuth(): Promise<string> {
  const providerType = 'claude-subscription';
  
  // Generate PKCE challenge
  const { codeChallenge, codeChallengeMethod, state } = await startPKCEFlow(providerType);
  
  // Build authorization URL
  const authUrl = buildAuthorizationUrl(CLAUDE_OAUTH_CONFIG.authorizationUrl, {
    clientId: CLAUDE_OAUTH_CONFIG.clientId,
    redirectUri: getRedirectUri(),
    scope: CLAUDE_OAUTH_CONFIG.scopes.join(' '),
    codeChallenge,
    codeChallengeMethod,
    state,
  });
  
  return authUrl;
}

/**
 * Complete the Claude OAuth flow by exchanging the authorization code for tokens
 */
export async function completeClaudeOAuth(
  authorizationCode: string,
  state: string
): Promise<ClaudeOAuthTokens> {
  const tokens = await completePKCEFlow(
    state,
    authorizationCode,
    CLAUDE_OAUTH_CONFIG.tokenUrl,
    CLAUDE_OAUTH_CONFIG.clientId,
    getRedirectUri()
  );
  
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : undefined;
  
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt,
    scopes: CLAUDE_OAUTH_CONFIG.scopes,
  };
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshClaudeToken(refreshToken: string): Promise<ClaudeOAuthTokens> {
  const response = await fetch(CLAUDE_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLAUDE_OAUTH_CONFIG.clientId,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }
  
  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : undefined;
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt,
    scopes: CLAUDE_OAUTH_CONFIG.scopes,
  };
}

/**
 * Validate the access token by making a test API call
 */
export async function validateClaudeToken(accessToken: string): Promise<boolean> {
  try {
    // Try to make a simple API call to validate the token
    const response = await fetch(`${CLAUDE_OAUTH_CONFIG.apiBaseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
      },
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Make a translation request using the OAuth token
 */
export async function translateWithClaudeOAuth(
  accessToken: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string> {
  const response = await fetch(`${CLAUDE_OAUTH_CONFIG.apiBaseUrl}${CLAUDE_OAUTH_CONFIG.messagesEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    
    if (response.status === 401) {
      throw new Error('TOKEN_EXPIRED');
    }
    
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json() as {
    content: Array<{ type: string; text?: string }>;
  };
  
  // Extract text from response
  const textContent = data.content.find(c => c.type === 'text');
  return textContent?.text || '';
}

/**
 * Check if the token is expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(expiresAt?: string): boolean {
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
export async function launchClaudeOAuthFlow(): Promise<ClaudeOAuthTokens> {
  const authUrl = await startClaudeOAuth();
  
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
          const tokens = await completeClaudeOAuth(code, state);
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

const TOKEN_STORAGE_KEY = 'claude_oauth_tokens';

/**
 * Store OAuth tokens securely
 */
export async function storeClaudeTokens(tokens: ClaudeOAuthTokens): Promise<void> {
  await chrome.storage.local.set({
    [TOKEN_STORAGE_KEY]: tokens,
  });
}

/**
 * Retrieve stored OAuth tokens
 */
export async function getStoredClaudeTokens(): Promise<ClaudeOAuthTokens | null> {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return result[TOKEN_STORAGE_KEY] || null;
}

/**
 * Clear stored OAuth tokens
 */
export async function clearClaudeTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidClaudeToken(): Promise<string | null> {
  const tokens = await getStoredClaudeTokens();
  
  if (!tokens) {
    return null;
  }
  
  // Check if token is expired
  if (isTokenExpired(tokens.expiresAt)) {
    if (!tokens.refreshToken) {
      // No refresh token, need to re-authenticate
      await clearClaudeTokens();
      return null;
    }
    
    try {
      // Refresh the token
      const newTokens = await refreshClaudeToken(tokens.refreshToken);
      await storeClaudeTokens(newTokens);
      return newTokens.accessToken;
    } catch {
      // Refresh failed, clear tokens
      await clearClaudeTokens();
      return null;
    }
  }
  
  return tokens.accessToken;
}
