/**
 * OAuth PKCE (Proof Key for Code Exchange) Utilities
 * 
 * Implements RFC 7636 for secure OAuth 2.0 authorization code flow.
 * Used for Claude Pro and ChatGPT Plus subscription authentication.
 * 
 * @see https://datatracker.ietf.org/doc/html/rfc7636
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 */

// ============================================================================
// Types
// ============================================================================

export interface PKCEChallenge {
  /** Random code verifier (43-128 characters) */
  codeVerifier: string;
  
  /** SHA-256 hash of code verifier, base64url encoded */
  codeChallenge: string;
  
  /** Challenge method (always 'S256') */
  codeChallengeMethod: 'S256';
}

export interface PKCEState {
  /** Random state parameter for CSRF protection */
  state: string;
  
  /** Timestamp when state was created */
  createdAt: number;
  
  /** Expiration timestamp (15 minutes from creation) */
  expiresAt: number;
}

export interface StoredPKCE extends PKCEChallenge, PKCEState {
  /** Provider type for this PKCE session */
  providerType: string;
}

// ============================================================================
// Constants
// ============================================================================

const CODE_VERIFIER_LENGTH = 64; // RFC 7636 recommends 43-128 characters
const STATE_LENGTH = 32;
const STATE_EXPIRATION_MS = 15 * 60 * 1000; // 15 minutes

// Allowed characters for code verifier (unreserved URI characters)
const ALLOWED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

const STORAGE_KEY = 'oauth_pkce_session';

// ============================================================================
// PKCE Generation
// ============================================================================

/**
 * Generate a cryptographically random string
 */
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALLOWED_CHARS[array[i] % ALLOWED_CHARS.length];
  }
  return result;
}

/**
 * Compute SHA-256 hash and encode as base64url
 */
async function sha256Base64Url(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert ArrayBuffer to base64
  const hashArray = new Uint8Array(hashBuffer);
  let binary = '';
  for (let i = 0; i < hashArray.length; i++) {
    binary += String.fromCharCode(hashArray[i]);
  }
  const base64 = btoa(binary);
  
  // Convert base64 to base64url
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a PKCE challenge pair
 */
export async function generatePKCEChallenge(): Promise<PKCEChallenge> {
  const codeVerifier = generateRandomString(CODE_VERIFIER_LENGTH);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Generate a state parameter for CSRF protection
 */
export function generateState(): PKCEState {
  const now = Date.now();
  
  return {
    state: generateRandomString(STATE_LENGTH),
    createdAt: now,
    expiresAt: now + STATE_EXPIRATION_MS,
  };
}

// ============================================================================
// PKCE Storage (Secure during OAuth flow)
// ============================================================================

/**
 * Store PKCE parameters securely during OAuth flow
 */
export async function storePKCE(
  providerType: string,
  pkce: PKCEChallenge,
  state: PKCEState
): Promise<void> {
  const stored: StoredPKCE = {
    ...pkce,
    ...state,
    providerType,
  };
  
  await chrome.storage.session.set({
    [STORAGE_KEY]: stored,
  });
}

/**
 * Retrieve stored PKCE parameters
 */
export async function retrievePKCE(): Promise<StoredPKCE | null> {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

/**
 * Clear stored PKCE parameters
 */
export async function clearPKCE(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEY);
}

// ============================================================================
// State Validation
// ============================================================================

/**
 * Validate received state parameter
 */
export async function validateState(receivedState: string): Promise<boolean> {
  const stored = await retrievePKCE();
  
  if (!stored) {
    console.warn('[OAuth PKCE] No stored PKCE session found');
    return false;
  }
  
  // Check if state matches
  if (stored.state !== receivedState) {
    console.warn('[OAuth PKCE] State mismatch - possible CSRF attack');
    return false;
  }
  
  // Check if state has expired
  if (Date.now() > stored.expiresAt) {
    console.warn('[OAuth PKCE] State has expired');
    await clearPKCE();
    return false;
  }
  
  return true;
}

/**
 * Get code verifier for token exchange (after state validation)
 */
export async function getCodeVerifier(): Promise<string | null> {
  const stored = await retrievePKCE();
  return stored?.codeVerifier || null;
}

// ============================================================================
// Full PKCE Flow Helpers
// ============================================================================

/**
 * Start a new PKCE OAuth flow
 * Returns the challenge and state to include in authorization URL
 */
export async function startPKCEFlow(providerType: string): Promise<{
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  state: string;
}> {
  const pkce = await generatePKCEChallenge();
  const state = generateState();
  
  await storePKCE(providerType, pkce, state);
  
  return {
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
    state: state.state,
  };
}

/**
 * Complete PKCE flow by exchanging authorization code for tokens
 * This is called after the OAuth callback
 */
export async function completePKCEFlow(
  receivedState: string,
  authorizationCode: string,
  tokenEndpoint: string,
  clientId: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  // Validate state
  const isValid = await validateState(receivedState);
  if (!isValid) {
    throw new Error('Invalid OAuth state - possible security issue');
  }
  
  // Get code verifier
  const codeVerifier = await getCodeVerifier();
  if (!codeVerifier) {
    throw new Error('Code verifier not found');
  }
  
  // Exchange code for tokens
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  
  // Clear PKCE session
  await clearPKCE();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build an authorization URL with PKCE parameters
 */
export function buildAuthorizationUrl(
  baseUrl: string,
  params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    state: string;
    responseType?: string;
  }
): string {
  const url = new URL(baseUrl);
  
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', params.responseType || 'code');
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', params.codeChallengeMethod);
  url.searchParams.set('state', params.state);
  
  return url.toString();
}
