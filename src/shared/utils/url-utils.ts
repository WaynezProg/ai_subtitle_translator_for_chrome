/**
 * URL and Network Utilities
 *
 * Provides comprehensive URL manipulation and network-related utilities:
 * - URL parsing and building
 * - Query string handling
 * - URL validation and normalization
 * - Domain extraction and matching
 * - Path manipulation
 */

import { createLogger } from './logger';

const logger = createLogger('UrlUtils');

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed URL components
 */
export interface ParsedUrl {
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  searchParams: Map<string, string[]>;
}

/**
 * Query parameters type
 */
export type QueryParams = Record<string, string | number | boolean | null | undefined | (string | number | boolean)[]>;

/**
 * URL builder options
 */
export interface UrlBuilderOptions {
  /** Base URL */
  base?: string;
  /** Path segments to join */
  path?: string | string[];
  /** Query parameters */
  query?: QueryParams;
  /** Hash fragment */
  hash?: string;
  /** Whether to encode path segments */
  encodePath?: boolean;
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Parse a URL string into components
 */
export function parseUrl(url: string): ParsedUrl | null {
  try {
    const parsed = new URL(url);
    const searchParams = new Map<string, string[]>();

    // Group multiple values for same key
    for (const [key, value] of parsed.searchParams) {
      const existing = searchParams.get(key) || [];
      existing.push(value);
      searchParams.set(key, existing);
    }

    return {
      href: parsed.href,
      protocol: parsed.protocol,
      host: parsed.host,
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      origin: parsed.origin,
      searchParams,
    };
  } catch {
    logger.debug('Failed to parse URL', { url });
    return null;
  }
}

/**
 * Try to parse a URL, returning a partial result for invalid URLs
 */
export function tryParseUrl(url: string, baseUrl?: string): ParsedUrl | null {
  // Try direct parsing
  const direct = parseUrl(url);
  if (direct) return direct;

  // Try with base URL
  if (baseUrl) {
    try {
      const parsed = new URL(url, baseUrl);
      return parseUrl(parsed.href);
    } catch {
      // Continue to fallback
    }
  }

  // Try adding protocol
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) {
    const withProtocol = 'https://' + url;
    const result = parseUrl(withProtocol);
    if (result) return result;
  }

  return null;
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build a URL from components
 */
export function buildUrl(options: UrlBuilderOptions): string {
  const { base = '', path, query, hash, encodePath = true } = options;

  let url: URL;

  // Start with base
  try {
    url = new URL(base || 'http://localhost');
  } catch {
    // Try to fix the base
    url = new URL('http://localhost');
    if (base) {
      url.pathname = base.startsWith('/') ? base : '/' + base;
    }
  }

  // Add path
  if (path) {
    const segments = Array.isArray(path) ? path : [path];
    const cleanedSegments = segments
      .filter(Boolean)
      .map((s) => String(s))
      .flatMap((s) => s.split('/').filter(Boolean));

    if (cleanedSegments.length > 0) {
      const encoded = cleanedSegments.map((s) => (encodePath ? encodeURIComponent(s) : s));
      const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
      url.pathname = basePath + '/' + encoded.join('/');
    }
  }

  // Add query parameters
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== null && item !== undefined) {
            url.searchParams.append(key, String(item));
          }
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  // Add hash
  if (hash) {
    url.hash = hash.startsWith('#') ? hash : '#' + hash;
  }

  // Return full URL or just path based on base
  if (!base || base.startsWith('/')) {
    return url.pathname + url.search + url.hash;
  }

  return url.href;
}

/**
 * Join URL parts safely
 */
export function joinUrl(...parts: (string | undefined | null)[]): string {
  const cleanParts = parts.filter(Boolean) as string[];

  if (cleanParts.length === 0) return '';

  // Handle absolute URL in first part
  if (cleanParts[0].includes('://')) {
    const [base, ...rest] = cleanParts;
    if (rest.length === 0) return base;

    const baseUrl = new URL(base);
    const pathParts = rest.flatMap((p) => p.split('/').filter(Boolean));
    baseUrl.pathname = joinPath(baseUrl.pathname, ...pathParts);
    return baseUrl.href;
  }

  // Just join paths
  return joinPath(...cleanParts);
}

/**
 * Join path segments
 */
export function joinPath(...segments: (string | undefined | null)[]): string {
  const cleanSegments = segments
    .filter(Boolean)
    .flatMap((s) => String(s).split('/').filter(Boolean));

  const startsWithSlash =
    segments.length > 0 && typeof segments[0] === 'string' && segments[0].startsWith('/');

  return (startsWithSlash ? '/' : '') + cleanSegments.join('/');
}

// ============================================================================
// Query String Handling
// ============================================================================

/**
 * Parse query string to object
 */
export function parseQueryString(queryString: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const search = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  if (!search) return result;

  const params = new URLSearchParams(search);

  for (const key of params.keys()) {
    const values = params.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }

  return result;
}

/**
 * Build query string from object
 */
export function buildQueryString(params: QueryParams, options?: { encode?: boolean }): string {
  const { encode = true } = options || {};
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;

    const encodedKey = encode ? encodeURIComponent(key) : key;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined) {
          const encodedValue = encode ? encodeURIComponent(String(item)) : String(item);
          parts.push(`${encodedKey}=${encodedValue}`);
        }
      }
    } else {
      const encodedValue = encode ? encodeURIComponent(String(value)) : String(value);
      parts.push(`${encodedKey}=${encodedValue}`);
    }
  }

  return parts.join('&');
}

/**
 * Add or update query parameters in a URL
 */
export function addQueryParams(url: string, params: QueryParams): string {
  const parsed = tryParseUrl(url);
  if (!parsed) {
    // If can't parse, just append
    const qs = buildQueryString(params);
    if (!qs) return url;

    const separator = url.includes('?') ? '&' : '?';
    return url + separator + qs;
  }

  const newUrl = new URL(parsed.href);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      newUrl.searchParams.delete(key);
    } else if (Array.isArray(value)) {
      newUrl.searchParams.delete(key);
      for (const item of value) {
        if (item !== null && item !== undefined) {
          newUrl.searchParams.append(key, String(item));
        }
      }
    } else {
      newUrl.searchParams.set(key, String(value));
    }
  }

  return newUrl.href;
}

/**
 * Remove query parameters from a URL
 */
export function removeQueryParams(url: string, keys: string[]): string {
  const parsed = tryParseUrl(url);
  if (!parsed) return url;

  const newUrl = new URL(parsed.href);

  for (const key of keys) {
    newUrl.searchParams.delete(key);
  }

  return newUrl.href;
}

/**
 * Get a specific query parameter value
 */
export function getQueryParam(url: string, key: string): string | null {
  const parsed = tryParseUrl(url);
  if (!parsed) return null;

  const values = parsed.searchParams.get(key);
  return values && values.length > 0 ? values[0] : null;
}

/**
 * Get all values for a query parameter
 */
export function getQueryParamAll(url: string, key: string): string[] {
  const parsed = tryParseUrl(url);
  if (!parsed) return [];

  return parsed.searchParams.get(key) || [];
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Check if string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if string is a valid HTTP(S) URL
 */
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if URL is secure (HTTPS)
 */
export function isSecureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if URL is absolute
 */
export function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

/**
 * Check if URL is relative
 */
export function isRelativeUrl(url: string): boolean {
  return !isAbsoluteUrl(url);
}

// ============================================================================
// Domain Handling
// ============================================================================

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  const parsed = tryParseUrl(url);
  return parsed?.hostname || null;
}

/**
 * Extract root domain (without subdomains)
 */
export function extractRootDomain(url: string): string | null {
  const domain = extractDomain(url);
  if (!domain) return null;

  // Handle IP addresses
  if (/^[\d.]+$/.test(domain) || domain.includes(':')) {
    return domain;
  }

  const parts = domain.split('.');
  if (parts.length <= 2) return domain;

  // Handle common TLDs
  const commonSlds = ['co', 'com', 'net', 'org', 'gov', 'edu'];
  const secondLast = parts[parts.length - 2];

  if (commonSlds.includes(secondLast.toLowerCase()) && parts.length > 2) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

/**
 * Check if URL matches a domain pattern
 */
export function matchesDomain(url: string, pattern: string): boolean {
  const domain = extractDomain(url);
  if (!domain) return false;

  const normalizedDomain = domain.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Exact match
  if (normalizedDomain === normalizedPattern) return true;

  // Wildcard match
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return normalizedDomain === suffix || normalizedDomain.endsWith('.' + suffix);
  }

  // Subdomain match
  return normalizedDomain.endsWith('.' + normalizedPattern);
}

/**
 * Check if two URLs have the same origin
 */
export function isSameOrigin(url1: string, url2: string): boolean {
  const parsed1 = tryParseUrl(url1);
  const parsed2 = tryParseUrl(url2);

  if (!parsed1 || !parsed2) return false;

  return parsed1.origin === parsed2.origin;
}

// ============================================================================
// URL Normalization
// ============================================================================

/**
 * Normalize a URL for comparison
 */
export function normalizeUrl(url: string, options?: {
  removeTrailingSlash?: boolean;
  removeHash?: boolean;
  removeWww?: boolean;
  sortQueryParams?: boolean;
  lowercase?: boolean;
}): string | null {
  const {
    removeTrailingSlash = true,
    removeHash = false,
    removeWww = false,
    sortQueryParams = true,
    lowercase = true,
  } = options || {};

  const parsed = tryParseUrl(url);
  if (!parsed) return null;

  const newUrl = new URL(parsed.href);

  // Lowercase
  if (lowercase) {
    newUrl.hostname = newUrl.hostname.toLowerCase();
    newUrl.protocol = newUrl.protocol.toLowerCase();
  }

  // Remove www
  if (removeWww && newUrl.hostname.startsWith('www.')) {
    newUrl.hostname = newUrl.hostname.slice(4);
  }

  // Sort query params
  if (sortQueryParams) {
    const entries = Array.from(newUrl.searchParams.entries());
    entries.sort((a, b) => a[0].localeCompare(b[0]));

    newUrl.search = '';
    for (const [key, value] of entries) {
      newUrl.searchParams.append(key, value);
    }
  }

  // Remove hash
  if (removeHash) {
    newUrl.hash = '';
  }

  // Remove trailing slash
  let result = newUrl.href;
  if (removeTrailingSlash && newUrl.pathname.endsWith('/') && newUrl.pathname !== '/') {
    newUrl.pathname = newUrl.pathname.slice(0, -1);
    result = newUrl.href;
  }

  return result;
}

/**
 * Make a relative URL absolute
 */
export function toAbsoluteUrl(url: string, baseUrl: string): string | null {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Make an absolute URL relative to a base
 */
export function toRelativeUrl(url: string, baseUrl: string): string | null {
  const parsedUrl = tryParseUrl(url);
  const parsedBase = tryParseUrl(baseUrl);

  if (!parsedUrl || !parsedBase) return null;

  // Different origins - return absolute
  if (parsedUrl.origin !== parsedBase.origin) {
    return url;
  }

  // Return path + search + hash
  return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
}

// ============================================================================
// Streaming Platform URL Helpers
// ============================================================================

/**
 * Extract video ID from YouTube URL
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // Try query parameter
  const parsed = tryParseUrl(url);
  if (parsed) {
    const videoId = parsed.searchParams.get('v');
    if (videoId && videoId.length > 0 && /^[a-zA-Z0-9_-]{11}$/.test(videoId[0])) {
      return videoId[0];
    }
  }

  return null;
}

/**
 * Extract video ID from Netflix URL
 */
export function extractNetflixVideoId(url: string): string | null {
  const match = url.match(/netflix\.com\/(?:watch|title)\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract video ID from Disney+ URL
 */
export function extractDisneyPlusVideoId(url: string): string | null {
  const match = url.match(/disneyplus\.com\/(?:video|movies|series)\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Extract video ID from Prime Video URL
 */
export function extractPrimeVideoId(url: string): string | null {
  const patterns = [
    /primevideo\.com\/detail\/([a-zA-Z0-9]+)/,
    /amazon\.(?:com|co\.\w+)\/(?:gp\/video|dp)\/([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Detect streaming platform from URL
 */
export function detectStreamingPlatform(
  url: string
): 'youtube' | 'netflix' | 'disney+' | 'primevideo' | null {
  const domain = extractDomain(url)?.toLowerCase();
  if (!domain) return null;

  if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
    return 'youtube';
  }
  if (domain.includes('netflix.com')) {
    return 'netflix';
  }
  if (domain.includes('disneyplus.com')) {
    return 'disney+';
  }
  if (domain.includes('primevideo.com') || domain.includes('amazon.')) {
    return 'primevideo';
  }

  return null;
}

// ============================================================================
// URL Security
// ============================================================================

/**
 * Check if URL is potentially dangerous
 */
export function isDangerousUrl(url: string): boolean {
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];

  const lower = url.toLowerCase().trim();
  return dangerousProtocols.some((proto) => lower.startsWith(proto));
}

/**
 * Sanitize URL for safe use
 */
export function sanitizeUrl(url: string): string | null {
  if (isDangerousUrl(url)) {
    logger.warn('Blocked dangerous URL', { url: url.slice(0, 50) });
    return null;
  }

  // Try to parse and rebuild
  const parsed = tryParseUrl(url);
  if (!parsed) return null;

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  return parsed.href;
}
