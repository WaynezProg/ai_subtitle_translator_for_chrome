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
} from './oauth-pkce';
import { encrypt, decrypt, isEncryptedData, type EncryptedData } from '../utils/crypto';

// ============================================================================
// Constants
// ============================================================================

const CHATGPT_OAUTH_CONFIG = {
  // OAuth client ID for ChatGPT (from opencode-openai-codex-auth)
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',

  // OAuth endpoints - IMPORTANT: must include /oauth/ path segment
  issuer: 'https://auth.openai.com',
  authorizationUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',

  // Required scopes for ChatGPT Plus/Pro access
  // offline_access is required for refresh tokens
  scopes: ['openid', 'profile', 'email', 'offline_access'],
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
  
  // Build authorization URL with Codex CLI compatible parameters
  // Reference: opencode-openai-codex-auth/lib/auth/auth.ts
  const url = new URL(CHATGPT_OAUTH_CONFIG.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CHATGPT_OAUTH_CONFIG.clientId);
  url.searchParams.set('redirect_uri', getRedirectUri());
  url.searchParams.set('scope', CHATGPT_OAUTH_CONFIG.scopes.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', codeChallengeMethod);
  url.searchParams.set('state', state);
  // Codex CLI specific parameters that help with the OAuth flow
  url.searchParams.set('id_token_add_organizations', 'true');
  url.searchParams.set('codex_cli_simplified_flow', 'true');
  url.searchParams.set('originator', 'codex_cli_rs');
  
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
  console.log('[ChatGPTOAuth] Attempting token refresh...');
  console.log('[ChatGPTOAuth] Token URL:', CHATGPT_OAUTH_CONFIG.tokenUrl);
  console.log('[ChatGPTOAuth] Client ID:', CHATGPT_OAUTH_CONFIG.clientId);
  console.log('[ChatGPTOAuth] Refresh token (first 20 chars):', refreshToken.substring(0, 20) + '...');
  
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
  
  console.log('[ChatGPTOAuth] Refresh response status:', response.status);
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[ChatGPTOAuth] Refresh failed with status:', response.status);
    console.error('[ChatGPTOAuth] Refresh error response:', error);
    throw new Error(`Token refresh failed (${response.status}): ${error}`);
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
 *
 * ChatGPT OAuth tokens work with ChatGPT backend-api.
 * We validate by checking the /me endpoint which returns user info.
 */
export async function validateChatGPTToken(accessToken: string): Promise<boolean> {
  try {
    // Use ChatGPT backend-api /me endpoint to validate the token
    const response = await fetch('https://chatgpt.com/backend-api/me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log('[ChatGPTOAuth] Validation response status:', response.status);

    // 200 = success, token is valid
    if (response.ok) {
      const data = await response.json() as { id?: string; email?: string };
      console.log('[ChatGPTOAuth] User validated:', data.email || data.id || 'unknown');
      return true;
    }

    // 401/403 = token is invalid or expired
    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text();
      console.warn('[ChatGPTOAuth] Validation failed:', response.status, errorText);
      return false;
    }

    // 429 = rate limited but token is valid
    if (response.status === 429) {
      console.warn('[ChatGPTOAuth] Rate limited, but token is valid');
      return true;
    }

    // Other errors might be temporary
    const errorText = await response.text();
    console.warn('[ChatGPTOAuth] Validation error:', response.status, errorText);
    return false;
  } catch (error) {
    console.error('[ChatGPTOAuth] Token validation error:', error);
    return false;
  }
}

/**
 * Check if the token is expired or about to expire (within 5 minutes)
 * 
 * Following opencode pattern:
 * - If expiresAt is not set, return 'unknown' to indicate validation is needed
 * - This allows the caller to decide whether to validate or refresh
 */
export function isChatGPTTokenExpired(expiresAt?: string): boolean | 'unknown' {
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
export async function launchChatGPTOAuthFlow(): Promise<ChatGPTOAuthTokens> {
  const authUrl = await startChatGPTOAuth();
  
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
          const tokens = await completeChatGPTOAuth(code, state);
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

const TOKEN_STORAGE_KEY = 'chatgpt_oauth_tokens';

/**
 * Encrypted token storage format
 */
interface EncryptedChatGPTTokens {
  accessToken: EncryptedData;
  refreshToken?: EncryptedData;
  idToken?: EncryptedData;
  expiresAt?: string;
  scopes?: string[];
}

/**
 * Type guard for encrypted tokens
 */
function isEncryptedTokens(tokens: unknown): tokens is EncryptedChatGPTTokens {
  if (!tokens || typeof tokens !== 'object') return false;
  const t = tokens as Record<string, unknown>;
  return isEncryptedData(t.accessToken);
}

/**
 * Store OAuth tokens securely with encryption
 * @security Access token, refresh token, and ID token are encrypted before storage
 */
export async function storeChatGPTTokens(tokens: ChatGPTOAuthTokens): Promise<void> {
  const encryptedTokens: EncryptedChatGPTTokens = {
    accessToken: await encrypt(tokens.accessToken),
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  };
  
  if (tokens.refreshToken) {
    encryptedTokens.refreshToken = await encrypt(tokens.refreshToken);
  }
  
  if (tokens.idToken) {
    encryptedTokens.idToken = await encrypt(tokens.idToken);
  }
  
  await chrome.storage.local.set({
    [TOKEN_STORAGE_KEY]: encryptedTokens,
  });
}

/**
 * Retrieve stored OAuth tokens with automatic decryption and migration
 */
export async function getStoredChatGPTTokens(): Promise<ChatGPTOAuthTokens | null> {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  const stored = result[TOKEN_STORAGE_KEY];
  
  if (!stored) {
    return null;
  }
  
  // Check if tokens are encrypted
  if (isEncryptedTokens(stored)) {
    try {
      const tokens: ChatGPTOAuthTokens = {
        accessToken: await decrypt(stored.accessToken),
        expiresAt: stored.expiresAt,
        scopes: stored.scopes,
      };
      
      if (stored.refreshToken) {
        tokens.refreshToken = await decrypt(stored.refreshToken);
      }
      
      if (stored.idToken) {
        tokens.idToken = await decrypt(stored.idToken);
      }
      
      return tokens;
    } catch (error) {
      console.error('[ChatGPTOAuth] Failed to decrypt tokens:', error);
      return null;
    }
  }
  
  // Legacy unencrypted tokens - migrate
  console.warn('[ChatGPTOAuth] Migrating legacy unencrypted tokens');
  const legacyTokens = stored as ChatGPTOAuthTokens;
  await storeChatGPTTokens(legacyTokens);
  return legacyTokens;
}

/**
 * Clear stored OAuth tokens
 */
export async function clearChatGPTTokens(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

/**
 * Get a valid access token, refreshing if necessary
 * 
 * Reference: opencode-openai-codex-auth pattern
 * - Prioritize local expiration check to avoid unnecessary server validation
 * - Server validation adds latency and may fail even with valid tokens
 * - If expiresAt is unknown, return token directly (let API call validate)
 * - If API call fails with 401/403, the provider will handle refresh and retry
 */
export async function getValidChatGPTToken(): Promise<string | null> {
  console.log('[ChatGPTOAuth] getValidChatGPTToken called...');
  const tokens = await getStoredChatGPTTokens();
  
  if (!tokens) {
    console.warn('[ChatGPTOAuth] No tokens stored in chrome.storage');
    return null;
  }
  
  console.log('[ChatGPTOAuth] Found stored tokens:', {
    hasAccessToken: !!tokens.accessToken,
    hasRefreshToken: !!tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    accessTokenPrefix: tokens.accessToken?.substring(0, 20) + '...',
  });
  
  // Check if token is expired based on stored expiration time
  const expiredStatus = isChatGPTTokenExpired(tokens.expiresAt);
  console.log('[ChatGPTOAuth] Token expiration status:', expiredStatus);
  
  // If expiration status is unknown (no expiresAt set), return token directly
  // Let the API call determine if it's valid - provider will handle 401/403 retry
  if (expiredStatus === 'unknown') {
    console.log('[ChatGPTOAuth] No expiresAt set, returning token (API call will validate)');
    return tokens.accessToken;
  }
  
  // Token is not expired locally, return it directly
  if (expiredStatus === false) {
    console.log('[ChatGPTOAuth] Token not expired, returning directly');
    return tokens.accessToken;
  }
  
  // Token is expired, attempt refresh
  console.log('[ChatGPTOAuth] Token expired based on expiresAt, attempting refresh...');
  return await tryRefreshToken(tokens);
}

/**
 * Try to refresh the token, return null if failed
 */
async function tryRefreshToken(tokens: ChatGPTOAuthTokens): Promise<string | null> {
  if (!tokens.refreshToken) {
    // No refresh token, need to re-authenticate
    console.warn('[ChatGPTOAuth] No refresh token available, clearing tokens');
    await clearChatGPTTokens();
    return null;
  }
  
  try {
    // Refresh the token
    const newTokens = await refreshChatGPTToken(tokens.refreshToken);
    await storeChatGPTTokens(newTokens);
    console.log('[ChatGPTOAuth] Token refreshed successfully');
    return newTokens.accessToken;
  } catch (error) {
    // Refresh failed, clear tokens
    console.error('[ChatGPTOAuth] Token refresh failed:', error);
    await clearChatGPTTokens();
    return null;
  }
}
