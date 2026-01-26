/**
 * Tests for URL and Network Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseUrl,
  tryParseUrl,
  buildUrl,
  joinUrl,
  joinPath,
  parseQueryString,
  buildQueryString,
  addQueryParams,
  removeQueryParams,
  getQueryParam,
  getQueryParamAll,
  isValidUrl,
  isHttpUrl,
  isSecureUrl,
  isAbsoluteUrl,
  isRelativeUrl,
  extractDomain,
  extractRootDomain,
  matchesDomain,
  isSameOrigin,
  normalizeUrl,
  toAbsoluteUrl,
  toRelativeUrl,
  extractYouTubeVideoId,
  extractNetflixVideoId,
  extractDisneyPlusVideoId,
  extractPrimeVideoId,
  detectStreamingPlatform,
  isDangerousUrl,
  sanitizeUrl,
} from '@shared/utils/url-utils';

// ============================================================================
// URL Parsing Tests
// ============================================================================

describe('parseUrl', () => {
  it('should parse valid URL', () => {
    const result = parseUrl('https://example.com/path?query=value#hash');

    expect(result).not.toBeNull();
    expect(result?.protocol).toBe('https:');
    expect(result?.hostname).toBe('example.com');
    expect(result?.pathname).toBe('/path');
    expect(result?.search).toBe('?query=value');
    expect(result?.hash).toBe('#hash');
  });

  it('should parse URL with port', () => {
    const result = parseUrl('https://example.com:8080/path');

    expect(result?.port).toBe('8080');
    expect(result?.host).toBe('example.com:8080');
  });

  it('should parse query parameters', () => {
    const result = parseUrl('https://example.com?a=1&b=2&a=3');

    expect(result?.searchParams.get('a')).toEqual(['1', '3']);
    expect(result?.searchParams.get('b')).toEqual(['2']);
  });

  it('should return null for invalid URL', () => {
    expect(parseUrl('not-a-url')).toBeNull();
    expect(parseUrl('')).toBeNull();
  });
});

describe('tryParseUrl', () => {
  it('should parse valid URL', () => {
    const result = tryParseUrl('https://example.com');
    expect(result).not.toBeNull();
  });

  it('should parse with base URL', () => {
    const result = tryParseUrl('/path', 'https://example.com');

    expect(result?.href).toBe('https://example.com/path');
  });

  it('should add protocol for domain-like strings', () => {
    const result = tryParseUrl('example.com');

    expect(result?.href).toBe('https://example.com/');
  });
});

// ============================================================================
// URL Building Tests
// ============================================================================

describe('buildUrl', () => {
  it('should build URL with base', () => {
    const url = buildUrl({ base: 'https://example.com' });
    expect(url).toBe('https://example.com/');
  });

  it('should build URL with path', () => {
    const url = buildUrl({
      base: 'https://example.com',
      path: 'api/users',
    });
    expect(url).toBe('https://example.com/api/users');
  });

  it('should build URL with path array', () => {
    const url = buildUrl({
      base: 'https://example.com',
      path: ['api', 'users', '123'],
    });
    expect(url).toBe('https://example.com/api/users/123');
  });

  it('should build URL with query params', () => {
    const url = buildUrl({
      base: 'https://example.com',
      query: { page: 1, limit: 10 },
    });
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
  });

  it('should build URL with hash', () => {
    const url = buildUrl({
      base: 'https://example.com',
      hash: 'section',
    });
    expect(url).toContain('#section');
  });

  it('should handle array query params', () => {
    const url = buildUrl({
      base: 'https://example.com',
      query: { tags: ['a', 'b'] },
    });
    expect(url).toContain('tags=a');
    expect(url).toContain('tags=b');
  });

  it('should skip null/undefined query values', () => {
    const url = buildUrl({
      base: 'https://example.com',
      query: { a: 1, b: null, c: undefined },
    });
    expect(url).toContain('a=1');
    expect(url).not.toContain('b=');
    expect(url).not.toContain('c=');
  });
});

describe('joinUrl', () => {
  it('should join URL parts', () => {
    expect(joinUrl('https://example.com', 'api', 'users')).toBe('https://example.com/api/users');
  });

  it('should handle trailing slashes', () => {
    expect(joinUrl('https://example.com/', '/api/', '/users')).toBe(
      'https://example.com/api/users'
    );
  });

  it('should handle empty parts', () => {
    expect(joinUrl('https://example.com', '', 'api')).toBe('https://example.com/api');
  });
});

describe('joinPath', () => {
  it('should join path segments', () => {
    expect(joinPath('api', 'users', '123')).toBe('api/users/123');
  });

  it('should preserve leading slash', () => {
    expect(joinPath('/api', 'users')).toBe('/api/users');
  });

  it('should handle multiple slashes', () => {
    expect(joinPath('/api/', '/users/', '/123/')).toBe('/api/users/123');
  });
});

// ============================================================================
// Query String Tests
// ============================================================================

describe('parseQueryString', () => {
  it('should parse query string', () => {
    const result = parseQueryString('a=1&b=2');

    expect(result.a).toBe('1');
    expect(result.b).toBe('2');
  });

  it('should handle leading question mark', () => {
    const result = parseQueryString('?a=1');
    expect(result.a).toBe('1');
  });

  it('should handle multiple values for same key', () => {
    const result = parseQueryString('a=1&a=2');
    expect(result.a).toEqual(['1', '2']);
  });

  it('should return empty object for empty string', () => {
    expect(parseQueryString('')).toEqual({});
    expect(parseQueryString('?')).toEqual({});
  });
});

describe('buildQueryString', () => {
  it('should build query string', () => {
    const result = buildQueryString({ a: 1, b: 'hello' });
    expect(result).toBe('a=1&b=hello');
  });

  it('should encode special characters', () => {
    const result = buildQueryString({ q: 'hello world' });
    expect(result).toBe('q=hello%20world');
  });

  it('should handle array values', () => {
    const result = buildQueryString({ tags: ['a', 'b'] });
    expect(result).toBe('tags=a&tags=b');
  });

  it('should skip null/undefined values', () => {
    const result = buildQueryString({ a: 1, b: null, c: undefined });
    expect(result).toBe('a=1');
  });
});

describe('addQueryParams', () => {
  it('should add query params to URL', () => {
    const result = addQueryParams('https://example.com', { page: 1 });
    expect(result).toContain('page=1');
  });

  it('should update existing params', () => {
    const result = addQueryParams('https://example.com?page=1', { page: 2 });
    expect(result).toContain('page=2');
    expect(result.match(/page=/g)?.length).toBe(1);
  });

  it('should remove params with null value', () => {
    const result = addQueryParams('https://example.com?page=1&limit=10', { page: null });
    expect(result).not.toContain('page=');
    expect(result).toContain('limit=10');
  });
});

describe('removeQueryParams', () => {
  it('should remove specified params', () => {
    const result = removeQueryParams('https://example.com?a=1&b=2&c=3', ['a', 'c']);
    expect(result).not.toContain('a=');
    expect(result).toContain('b=2');
    expect(result).not.toContain('c=');
  });
});

describe('getQueryParam', () => {
  it('should get single param value', () => {
    expect(getQueryParam('https://example.com?page=5', 'page')).toBe('5');
  });

  it('should return null for missing param', () => {
    expect(getQueryParam('https://example.com', 'page')).toBeNull();
  });
});

describe('getQueryParamAll', () => {
  it('should get all values for param', () => {
    const result = getQueryParamAll('https://example.com?tag=a&tag=b', 'tag');
    expect(result).toEqual(['a', 'b']);
  });

  it('should return empty array for missing param', () => {
    expect(getQueryParamAll('https://example.com', 'tag')).toEqual([]);
  });
});

// ============================================================================
// URL Validation Tests
// ============================================================================

describe('isValidUrl', () => {
  it('should return true for valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('isHttpUrl', () => {
  it('should return true for HTTP URLs', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  it('should return false for non-HTTP URLs', () => {
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl('file:///path')).toBe(false);
  });
});

describe('isSecureUrl', () => {
  it('should return true for HTTPS URLs', () => {
    expect(isSecureUrl('https://example.com')).toBe(true);
  });

  it('should return false for non-HTTPS URLs', () => {
    expect(isSecureUrl('http://example.com')).toBe(false);
  });
});

describe('isAbsoluteUrl', () => {
  it('should return true for absolute URLs', () => {
    expect(isAbsoluteUrl('https://example.com')).toBe(true);
    expect(isAbsoluteUrl('mailto:test@example.com')).toBe(true);
  });

  it('should return false for relative URLs', () => {
    expect(isAbsoluteUrl('/path/to/page')).toBe(false);
    expect(isAbsoluteUrl('path/to/page')).toBe(false);
  });
});

describe('isRelativeUrl', () => {
  it('should return true for relative URLs', () => {
    expect(isRelativeUrl('/path')).toBe(true);
    expect(isRelativeUrl('./path')).toBe(true);
  });

  it('should return false for absolute URLs', () => {
    expect(isRelativeUrl('https://example.com')).toBe(false);
  });
});

// ============================================================================
// Domain Handling Tests
// ============================================================================

describe('extractDomain', () => {
  it('should extract domain from URL', () => {
    expect(extractDomain('https://example.com/path')).toBe('example.com');
    expect(extractDomain('https://sub.example.com')).toBe('sub.example.com');
  });

  it('should return null for completely invalid URL', () => {
    expect(extractDomain('')).toBeNull();
    expect(extractDomain('://invalid')).toBeNull();
  });

  it('should handle domain-like strings by adding protocol', () => {
    // tryParseUrl adds https:// to domain-like strings
    expect(extractDomain('example.com')).toBe('example.com');
  });
});

describe('extractRootDomain', () => {
  it('should extract root domain', () => {
    expect(extractRootDomain('https://www.example.com')).toBe('example.com');
    expect(extractRootDomain('https://sub.example.com')).toBe('example.com');
  });

  it('should handle special TLDs', () => {
    expect(extractRootDomain('https://example.co.uk')).toBe('example.co.uk');
  });

  it('should handle IP addresses', () => {
    expect(extractRootDomain('http://192.168.1.1')).toBe('192.168.1.1');
  });
});

describe('matchesDomain', () => {
  it('should match exact domain', () => {
    expect(matchesDomain('https://example.com/path', 'example.com')).toBe(true);
  });

  it('should match subdomain', () => {
    expect(matchesDomain('https://sub.example.com', 'example.com')).toBe(true);
  });

  it('should match wildcard pattern', () => {
    expect(matchesDomain('https://sub.example.com', '*.example.com')).toBe(true);
    expect(matchesDomain('https://example.com', '*.example.com')).toBe(true);
  });

  it('should not match different domains', () => {
    expect(matchesDomain('https://other.com', 'example.com')).toBe(false);
  });
});

describe('isSameOrigin', () => {
  it('should return true for same origin', () => {
    expect(isSameOrigin('https://example.com/path1', 'https://example.com/path2')).toBe(true);
  });

  it('should return false for different origins', () => {
    expect(isSameOrigin('https://example.com', 'https://other.com')).toBe(false);
    expect(isSameOrigin('http://example.com', 'https://example.com')).toBe(false);
  });
});

// ============================================================================
// URL Normalization Tests
// ============================================================================

describe('normalizeUrl', () => {
  it('should remove trailing slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('should remove www', () => {
    expect(normalizeUrl('https://www.example.com', { removeWww: true })).toBe(
      'https://example.com/'
    );
  });

  it('should sort query params', () => {
    const result = normalizeUrl('https://example.com?b=2&a=1');
    expect(result).toBe('https://example.com/?a=1&b=2');
  });

  it('should remove hash', () => {
    expect(normalizeUrl('https://example.com#section', { removeHash: true })).toBe(
      'https://example.com/'
    );
  });

  it('should lowercase hostname', () => {
    expect(normalizeUrl('https://EXAMPLE.COM')).toBe('https://example.com/');
  });
});

describe('toAbsoluteUrl', () => {
  it('should convert relative to absolute', () => {
    expect(toAbsoluteUrl('/path', 'https://example.com')).toBe('https://example.com/path');
  });

  it('should return original if already absolute', () => {
    expect(toAbsoluteUrl('https://other.com', 'https://example.com')).toBe('https://other.com/');
  });
});

describe('toRelativeUrl', () => {
  it('should convert absolute to relative', () => {
    expect(toRelativeUrl('https://example.com/path?q=1', 'https://example.com')).toBe('/path?q=1');
  });

  it('should return absolute for different origins', () => {
    expect(toRelativeUrl('https://other.com/path', 'https://example.com')).toBe(
      'https://other.com/path'
    );
  });
});

// ============================================================================
// Streaming Platform URL Tests
// ============================================================================

describe('extractYouTubeVideoId', () => {
  it('should extract from standard watch URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ'
    );
  });

  it('should extract from short URL', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should extract from embed URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should extract from shorts URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('should return null for invalid URL', () => {
    expect(extractYouTubeVideoId('https://example.com')).toBeNull();
  });
});

describe('extractNetflixVideoId', () => {
  it('should extract from watch URL', () => {
    expect(extractNetflixVideoId('https://www.netflix.com/watch/80057281')).toBe('80057281');
  });

  it('should extract from title URL', () => {
    expect(extractNetflixVideoId('https://www.netflix.com/title/80057281')).toBe('80057281');
  });

  it('should return null for invalid URL', () => {
    expect(extractNetflixVideoId('https://example.com')).toBeNull();
  });
});

describe('extractDisneyPlusVideoId', () => {
  it('should extract from video URL', () => {
    expect(extractDisneyPlusVideoId('https://www.disneyplus.com/video/abc123-def456')).toBe(
      'abc123-def456'
    );
  });

  it('should extract from movies URL', () => {
    expect(extractDisneyPlusVideoId('https://www.disneyplus.com/movies/abc123')).toBe('abc123');
  });
});

describe('extractPrimeVideoId', () => {
  it('should extract from primevideo URL', () => {
    expect(extractPrimeVideoId('https://www.primevideo.com/detail/B0ABC123')).toBe('B0ABC123');
  });

  it('should extract from amazon URL', () => {
    expect(extractPrimeVideoId('https://www.amazon.com/gp/video/B0ABC123')).toBe('B0ABC123');
  });
});

describe('detectStreamingPlatform', () => {
  it('should detect YouTube', () => {
    expect(detectStreamingPlatform('https://www.youtube.com/watch?v=abc')).toBe('youtube');
    expect(detectStreamingPlatform('https://youtu.be/abc')).toBe('youtube');
  });

  it('should detect Netflix', () => {
    expect(detectStreamingPlatform('https://www.netflix.com/watch/123')).toBe('netflix');
  });

  it('should detect Disney+', () => {
    expect(detectStreamingPlatform('https://www.disneyplus.com/video/abc')).toBe('disney+');
  });

  it('should detect Prime Video', () => {
    expect(detectStreamingPlatform('https://www.primevideo.com/detail/abc')).toBe('primevideo');
  });

  it('should return null for unknown platforms', () => {
    expect(detectStreamingPlatform('https://example.com')).toBeNull();
  });
});

// ============================================================================
// URL Security Tests
// ============================================================================

describe('isDangerousUrl', () => {
  it('should detect javascript URLs', () => {
    expect(isDangerousUrl('javascript:alert(1)')).toBe(true);
  });

  it('should detect data URLs', () => {
    expect(isDangerousUrl('data:text/html,<script>alert(1)</script>')).toBe(true);
  });

  it('should detect vbscript URLs', () => {
    expect(isDangerousUrl('vbscript:msgbox(1)')).toBe(true);
  });

  it('should allow safe URLs', () => {
    expect(isDangerousUrl('https://example.com')).toBe(false);
    expect(isDangerousUrl('http://localhost')).toBe(false);
  });
});

describe('sanitizeUrl', () => {
  it('should allow safe URLs', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('should block dangerous URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('should block non-HTTP URLs', () => {
    expect(sanitizeUrl('ftp://example.com')).toBeNull();
    expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
  });

  it('should return null for completely invalid URLs', () => {
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl('://invalid')).toBeNull();
  });

  it('should sanitize domain-like strings by adding https', () => {
    // tryParseUrl adds https:// to domain-like strings
    expect(sanitizeUrl('example.com')).toBe('https://example.com/');
  });
});
