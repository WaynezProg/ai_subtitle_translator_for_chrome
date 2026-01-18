/**
 * Platform Detector
 * 
 * Detects the current streaming platform based on URL patterns.
 * Returns the appropriate adapter for the platform.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/platform-adapter.md
 */

import type { Platform } from '../shared/types/subtitle';
import type { PlatformAdapter } from './adapters/types';
import { YouTubeAdapter } from './adapters/youtube-adapter';
import { NetflixAdapter } from './adapters/netflix-adapter';
import { DisneyAdapter } from './adapters/disney-adapter';
import { PrimeAdapter } from './adapters/prime-adapter';
import { AdapterRegistry } from './adapters/registry';

// ============================================================================
// Types
// ============================================================================

export interface PlatformDetectionResult {
  /** Detected platform */
  platform: Platform | null;
  
  /** Whether this is the main video page or an embed */
  type: 'main' | 'embed' | null;
  
  /** The adapter for this platform */
  adapter: PlatformAdapter | null;
}

// ============================================================================
// URL Patterns
// ============================================================================

const PLATFORM_PATTERNS: Record<Platform, { main: RegExp[]; embed: RegExp[] }> = {
  youtube: {
    main: [
      /^https?:\/\/(?:www\.)?youtube\.com\/watch/,
      /^https?:\/\/youtu\.be\//,
    ],
    embed: [
      /^https?:\/\/(?:www\.)?youtube\.com\/embed\//,
    ],
  },
  netflix: {
    main: [
      /^https?:\/\/(?:www\.)?netflix\.com\/watch\//,
    ],
    embed: [],
  },
  disney: {
    main: [
      /^https?:\/\/(?:www\.)?disneyplus\.com\/video\//,
    ],
    embed: [],
  },
  prime: {
    main: [
      /^https?:\/\/(?:www\.)?primevideo\.com\/detail\//,
      /^https?:\/\/(?:www\.)?amazon\.com\/gp\/video\//,
    ],
    embed: [],
  },
};

// ============================================================================
// Registry Setup
// ============================================================================

const registry = new AdapterRegistry();

// Register YouTube adapter (MVP)
registry.registerAdapter(new YouTubeAdapter());

// Register Netflix adapter (Phase 7)
registry.registerAdapter(new NetflixAdapter());

// Register Disney+ and Prime Video adapters (Phase 8)
registry.registerAdapter(new DisneyAdapter());
registry.registerAdapter(new PrimeAdapter());

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect the current platform from URL
 */
export function detectPlatform(url: string = window.location.href): PlatformDetectionResult {
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS) as [Platform, typeof PLATFORM_PATTERNS[Platform]][]) {
    // Check main patterns
    for (const pattern of patterns.main) {
      if (pattern.test(url)) {
        const adapter = registry.getAdapter(url);
        return { platform, type: 'main', adapter };
      }
    }
    
    // Check embed patterns
    for (const pattern of patterns.embed) {
      if (pattern.test(url)) {
        const adapter = registry.getAdapter(url);
        return { platform, type: 'embed', adapter };
      }
    }
  }
  
  return { platform: null, type: null, adapter: null };
}

/**
 * Check if current page is a supported video platform
 */
export function isSupportedPlatform(url: string = window.location.href): boolean {
  const { platform } = detectPlatform(url);
  return platform !== null;
}

/**
 * Get adapter for current platform
 */
export function getAdapter(url: string = window.location.href): PlatformAdapter | null {
  return registry.getAdapter(url);
}

/**
 * Get the registry for registering new adapters
 */
export function getRegistry(): AdapterRegistry {
  return registry;
}

/**
 * Check if platform is YouTube
 */
export function isYouTube(url: string = window.location.href): boolean {
  const { platform } = detectPlatform(url);
  return platform === 'youtube';
}

/**
 * Check if platform is Netflix
 */
export function isNetflix(url: string = window.location.href): boolean {
  const { platform } = detectPlatform(url);
  return platform === 'netflix';
}

/**
 * Check if platform is Disney+
 */
export function isDisney(url: string = window.location.href): boolean {
  const { platform } = detectPlatform(url);
  return platform === 'disney';
}

/**
 * Check if platform is Prime Video
 */
export function isPrime(url: string = window.location.href): boolean {
  const { platform } = detectPlatform(url);
  return platform === 'prime';
}

/**
 * Extract video ID from URL
 */
export function extractVideoId(url: string = window.location.href): string | null {
  const { adapter } = detectPlatform(url);
  return adapter?.getVideoId() ?? null;
}
