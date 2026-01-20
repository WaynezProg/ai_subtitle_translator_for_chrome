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
import { encrypt, decrypt, isEncryptedData, type EncryptedData } from '../utils/crypto';

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
  // OAuth tokens require beta=true query param and special headers
  apiBaseUrl: 'https://api.anthropic.com',
  messagesEndpoint: '/v1/messages',
  
  // Required headers for OAuth authentication (discovered from opencode-anthropic-auth)
  // Note: Removed interleaved-thinking to avoid slower responses
  oauthBeta: 'oauth-2025-04-20',
  userAgent: 'claude-cli/2.1.2 (external, cli)',
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
 * 
 * Claude OAuth tokens from the PKCE flow require special headers:
 * - anthropic-beta: oauth-2025-04-20
 * - user-agent: claude-cli/2.1.2 (external, cli)
 * - ?beta=true query parameter
 * 
 * This is based on the opencode-anthropic-auth implementation.
 */
export async function validateClaudeToken(accessToken: string): Promise<boolean> {
  try {
    // Claude OAuth tokens require beta endpoint and special headers
    const url = `${CLAUDE_OAUTH_CONFIG.apiBaseUrl}${CLAUDE_OAUTH_CONFIG.messagesEndpoint}?beta=true`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': CLAUDE_OAUTH_CONFIG.oauthBeta,
        'anthropic-dangerous-direct-browser-access': 'true',
        'user-agent': CLAUDE_OAUTH_CONFIG.userAgent,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    
    console.log('[ClaudeOAuth] Validation response status:', response.status);
    
    // 200 = success, token is valid
    // 400 = bad request but auth succeeded (token valid)
    // 401/403 = unauthorized (token invalid)
    // 429 = rate limited but token is valid
    if (response.ok || response.status === 400 || response.status === 429) {
      return true;
    }
    
    // Log error details for debugging
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[ClaudeOAuth] Validation failed:', response.status, errorText);
    }
    
    return false;
  } catch (error) {
    console.error('[ClaudeOAuth] Token validation error:', error);
    return false;
  }
}

/**
 * Make a translation request using the OAuth token
 * 
 * Uses the beta endpoint with OAuth-specific headers.
 */
export async function translateWithClaudeOAuth(
  accessToken: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string> {
  // OAuth tokens require beta endpoint and special headers
  const url = `${CLAUDE_OAUTH_CONFIG.apiBaseUrl}${CLAUDE_OAUTH_CONFIG.messagesEndpoint}?beta=true`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': CLAUDE_OAUTH_CONFIG.oauthBeta,
      'anthropic-dangerous-direct-browser-access': 'true',
      'user-agent': CLAUDE_OAUTH_CONFIG.userAgent,
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
 * 
 * Following opencode pattern:
 * - If expiresAt is not set, return 'unknown' to indicate validation is needed
 * - This allows the caller to decide whether to validate or refresh
 */
export function isTokenExpired(expiresAt?: string): boolean | 'unknown' {
  // If no expiration time is set, we can't determine expiration locally
  // Return 'unknown' to signal that validation should be attempted
  if (!expiresAt) return 'unknown';
  
  const expirationTime = new Date(expiresAt).getTime();
  
  // Check for invalid date
  if (isNaN(expirationTime)) return 'unknown';
  
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
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!redirectUrl) {
          reject(new Error('OAuth flow cancelled or failed'));
          return;
        }
        
        // Process the callback asynchronously
        const processCallback = async (): Promise<void> => {
          // Parse the redirect URL to get the authorization code
          const url = new URL(redirectUrl);
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error');
          
          if (error) {
            throw new Error(`OAuth error: ${error}`);
          }
          
          if (!code || !state) {
            throw new Error('Missing authorization code or state');
          }
          
          // Exchange the code for tokens
          const tokens = await completeClaudeOAuth(code, state);
          resolve(tokens);
        };
        
        processCallback().catch(reject);
      }
    );
  });
}

// ============================================================================
// Token Storage
// ============================================================================

const TOKEN_STORAGE_KEY = 'claude_oauth_tokens';

/**
 * Encrypted token storage format
 */
interface EncryptedClaudeTokens {
  accessToken: EncryptedData;
  refreshToken?: EncryptedData;
  expiresAt?: string;
  scopes?: string[];
}

/**
 * Type guard for encrypted tokens
 */
function isEncryptedTokens(tokens: unknown): tokens is EncryptedClaudeTokens {
  if (!tokens || typeof tokens !== 'object') return false;
  const t = tokens as Record<string, unknown>;
  return isEncryptedData(t.accessToken);
}

/**
 * Store OAuth tokens securely with encryption
 * @security Access token and refresh token are encrypted before storage
 */
export async function storeClaudeTokens(tokens: ClaudeOAuthTokens): Promise<void> {
  const encryptedTokens: EncryptedClaudeTokens = {
    accessToken: await encrypt(tokens.accessToken),
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  };
  
  if (tokens.refreshToken) {
    encryptedTokens.refreshToken = await encrypt(tokens.refreshToken);
  }
  
  await chrome.storage.local.set({
    [TOKEN_STORAGE_KEY]: encryptedTokens,
  });
}

/**
 * Retrieve stored OAuth tokens with automatic decryption and migration
 */
export async function getStoredClaudeTokens(): Promise<ClaudeOAuthTokens | null> {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  const stored = result[TOKEN_STORAGE_KEY];
  
  if (!stored) {
    return null;
  }
  
  // Check if tokens are encrypted
  if (isEncryptedTokens(stored)) {
    try {
      const tokens: ClaudeOAuthTokens = {
        accessToken: await decrypt(stored.accessToken),
        expiresAt: stored.expiresAt,
        scopes: stored.scopes,
      };
      
      if (stored.refreshToken) {
        tokens.refreshToken = await decrypt(stored.refreshToken);
      }
      
      return tokens;
    } catch (error) {
      console.error('[ClaudeOAuth] Failed to decrypt tokens:', error);
      return null;
    }
  }
  
  // Legacy unencrypted tokens - migrate
  console.warn('[ClaudeOAuth] Migrating legacy unencrypted tokens');
  const legacyTokens = stored as ClaudeOAuthTokens;
  await storeClaudeTokens(legacyTokens);
  return legacyTokens;
}

/**
 * Clear stored OAuth tokens
 */
export async function clearClaudeTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

/**
 * Get a valid access token, refreshing if necessary
 * 
 * Following opencode pattern (from your research document):
 * - Prioritize local expiration check to avoid unnecessary server validation
 * - If expiresAt is unknown, try to use the token (let API call handle 401/403)
 * - If token is expired, attempt refresh
 * - If API call fails with 401/403, the provider will handle refresh and retry
 */
export async function getValidClaudeToken(): Promise<string | null> {
  const tokens = await getStoredClaudeTokens();
  
  if (!tokens) {
    return null;
  }
  
  // Check if token is expired based on stored expiration time
  const expiredStatus = isTokenExpired(tokens.expiresAt);
  
  // If expiration status is unknown (no expiresAt set), return token directly
  // Let the API call determine if it's valid - provider will handle 401/403 retry
  if (expiredStatus === 'unknown') {
    console.log('[ClaudeOAuth] No expiresAt set, returning token (API call will validate)');
    return tokens.accessToken;
  }
  
  // Token is not expired locally, return it directly
  if (expiredStatus === false) {
    return tokens.accessToken;
  }
  
  // Token is expired, attempt refresh
  console.log('[ClaudeOAuth] Token expired based on expiresAt, attempting refresh...');
  
  if (!tokens.refreshToken) {
    // No refresh token, need to re-authenticate
    console.warn('[ClaudeOAuth] No refresh token available, clearing tokens');
    await clearClaudeTokens();
    return null;
  }
  
  try {
    // Refresh the token
    const newTokens = await refreshClaudeToken(tokens.refreshToken);
    await storeClaudeTokens(newTokens);
    console.log('[ClaudeOAuth] Token refreshed successfully');
    return newTokens.accessToken;
  } catch (error) {
    // Refresh failed, clear tokens
    console.error('[ClaudeOAuth] Token refresh failed:', error);
    await clearClaudeTokens();
    return null;
  }
}
