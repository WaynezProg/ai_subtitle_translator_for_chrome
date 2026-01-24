/**
 * Disney+ Platform Adapter
 * 
 * Handles subtitle interception and rendering for Disney+.
 * Uses fetch hook to intercept WebVTT subtitle requests.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/platform-adapter.md
 * @see FR-003: Disney+ Support
 * @see FR-006: Subtitle Format Support (WebVTT)
 */

import type { Platform, SubtitleFormat, Cue } from '../../shared/types/subtitle';
import type {
  PlatformAdapter,
  URLPattern,
  SubtitleTrack,
  RawSubtitle,
  RenderOptions,
  VideoEventCallback,
} from './types';
import { AdapterError, DEFAULT_RENDER_OPTIONS } from './types';
import { createLogger } from '../../shared/utils/logger';

const log = createLogger('DisneyAdapter');

// ============================================================================
// Types
// ============================================================================

interface DisneyPlaybackContext {
  playbackUrls?: Array<{
    rel: string;
    href: string;
    templated?: boolean;
  }>;
  subtitles?: DisneySubtitleTrack[];
}

interface DisneySubtitleTrack {
  language: string;
  forced: boolean;
  type: string;
  renditionName?: string;
  url?: string;
  sources?: Array<{ type: string; src: string }>;
}

// ============================================================================
// Disney+ Adapter
// ============================================================================

export class DisneyAdapter implements PlatformAdapter {
  readonly platform: Platform = 'disney';
  
  readonly urlPatterns: URLPattern[] = [
    { pattern: /^https?:\/\/(?:www\.)?disneyplus\.com\/video\//, type: 'main' },
    { pattern: /^https?:\/\/(?:www\.)?disneyplus\.com\/[a-z]{2}-[a-z]{2}\/video\//, type: 'main' },
  ];
  
  private videoElement: HTMLVideoElement | null = null;
  private subtitleTracks: SubtitleTrack[] = [];
  private eventListeners: Map<VideoEventCallback, () => void> = new Map();
  private subtitleOverlay: HTMLDivElement | null = null;
  private currentCues: Cue[] = [];
  private originalFetch: typeof window.fetch | null = null;
  private initialized = false;
  private videoObserver: MutationObserver | null = null;
  
  // ============================================================================
  // Public Methods
  // ============================================================================
  
  canHandle(url: string): boolean {
    return this.urlPatterns.some(p => p.pattern.test(url));
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    log.info('Initializing...');
    
    // Setup fetch hook to intercept subtitle requests
    this.setupFetchHook();
    
    // Wait for video element
    await this.waitForVideoElement();
    
    this.initialized = true;
    log.info('Initialized');
  }
  
  getVideoId(): string | null {
    // Extract video ID from URL: disneyplus.com/video/{videoId}
    // or disneyplus.com/{locale}/video/{videoId}
    const match = window.location.pathname.match(/\/video\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }
  
  async getSubtitleTracks(): Promise<SubtitleTrack[]> {
    return this.subtitleTracks;
  }
  
  async fetchSubtitle(track: SubtitleTrack): Promise<RawSubtitle> {
    log.debug('Fetching subtitle', { trackId: track.id });
    
    try {
      const response = await fetch(track.url, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new AdapterError(
          'SUBTITLE_FETCH_FAILED',
          `Failed to fetch subtitle: ${response.status}`,
          this.platform
        );
      }
      
      const content = await response.text();
      
      return {
        content,
        format: track.format,
        metadata: {
          language: track.language,
          trackId: track.id,
        },
      };
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      
      throw new AdapterError(
        'SUBTITLE_FETCH_FAILED',
        `Failed to fetch subtitle: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.platform
      );
    }
  }
  
  injectSubtitles(cues: Cue[], options: RenderOptions = DEFAULT_RENDER_OPTIONS): void {
    this.currentCues = cues;
    this.createOrUpdateOverlay(options);
    this.setupTimeSync();
    log.debug('Injected cues', { count: cues.length });
  }
  
  removeSubtitles(): void {
    if (this.subtitleOverlay) {
      this.subtitleOverlay.remove();
      this.subtitleOverlay = null;
    }
    this.currentCues = [];
  }
  
  getVideoElement(): HTMLVideoElement | null {
    if (!this.videoElement) {
      this.videoElement = document.querySelector('video');
    }
    return this.videoElement;
  }
  
  onVideoEvent(callback: VideoEventCallback): () => void {
    const video = this.getVideoElement();
    if (!video) {
      return () => {};
    }
    
    const handlers: Record<string, () => void> = {
      play: (): void => callback({ type: 'play' }),
      pause: (): void => callback({ type: 'pause' }),
      seeked: (): void => callback({ type: 'seeked', currentTime: video.currentTime }),
      timeupdate: (): void => callback({ type: 'timeupdate', currentTime: video.currentTime }),
      ended: (): void => callback({ type: 'ended' }),
      ratechange: (): void => callback({ type: 'ratechange', playbackRate: video.playbackRate }),
    };
    
    for (const [event, handler] of Object.entries(handlers)) {
      video.addEventListener(event, handler);
    }
    
    const cleanup = (): void => {
      for (const [event, handler] of Object.entries(handlers)) {
        video.removeEventListener(event, handler);
      }
      this.eventListeners.delete(callback);
    };
    
    this.eventListeners.set(callback, cleanup);
    return cleanup;
  }
  
  destroy(): void {
    log.info('Destroying...');

    // Disconnect video observer if still active
    if (this.videoObserver) {
      this.videoObserver.disconnect();
      this.videoObserver = null;
    }

    // Restore original fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    // Cleanup event listeners
    for (const cleanup of this.eventListeners.values()) {
      cleanup();
    }
    this.eventListeners.clear();

    // Remove overlay
    this.removeSubtitles();

    this.initialized = false;
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Setup fetch hook to intercept Disney+ API requests
   */
  private setupFetchHook(): void {
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      // Safety check: if originalFetch is gone, try to use the current window.fetch
      const fetchFn = self.originalFetch || window.fetch;

      let url: string;
      try {
        if (typeof input === 'string') {
          url = input;
        } else if (input instanceof URL) {
          url = input.toString();
        } else if (input instanceof Request) {
          url = input.url;
        } else {
          // Fallback for unexpected types
          url = String(input);
        }
      } catch {
        // If URL extraction fails, just pass through to original fetch
        return fetchFn.call(window, input, init);
      }

      // Clone the response for inspection
      const response = await fetchFn.call(window, input, init);

      // Check for playback/manifest endpoints (wrap in try-catch)
      if (self.isPlaybackUrl(url)) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json() as DisneyPlaybackContext;
          self.extractSubtitleTracks(data);
        } catch {
          // Ignore parse errors
        }
      }

      // Capture direct subtitle URLs (wrap in try-catch)
      try {
        if (self.isSubtitleUrl(url)) {
          self.captureSubtitleUrl(url);
        }
      } catch (error) {
        log.warn('Failed to capture subtitle URL', { error: String(error) });
      }

      return response;
    };

    log.debug('Fetch hook installed');
  }
  
  /**
   * Check if URL is a playback/manifest endpoint
   */
  private isPlaybackUrl(url: string): boolean {
    return url.includes('/playback/') || 
           url.includes('/media/') ||
           url.includes('playback-orchestrator');
  }
  
  /**
   * Check if URL is a subtitle file
   */
  private isSubtitleUrl(url: string): boolean {
    return url.includes('.vtt') || 
           url.includes('subtitle') ||
           url.includes('text-track');
  }
  
  /**
   * Extract subtitle tracks from playback context
   */
  private extractSubtitleTracks(data: DisneyPlaybackContext): void {
    if (!data.subtitles || !Array.isArray(data.subtitles)) return;
    
    this.subtitleTracks = [];
    
    for (const track of data.subtitles) {
      // Skip forced subtitles
      if (track.forced) continue;
      
      // Get URL from sources or direct url property
      let url = track.url;
      if (!url && track.sources?.length) {
        const vttSource = track.sources.find(s => s.type.includes('vtt') || s.type.includes('webvtt'));
        url = vttSource?.src || track.sources[0]?.src;
      }
      
      if (!url) continue;
      
      this.subtitleTracks.push({
        id: `${track.language}-${track.type}`,
        language: track.language,
        label: track.renditionName || this.getLanguageLabel(track.language),
        url,
        format: 'webvtt' as SubtitleFormat,
        isAutoGenerated: false,
        isDefault: track.type === 'normal' || this.subtitleTracks.length === 0,
      });
    }
    
    log.debug('Extracted subtitle tracks', { count: this.subtitleTracks.length });
  }
  
  /**
   * Capture subtitle URL from request
   */
  private captureSubtitleUrl(url: string): void {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Try to extract language from path
      let language = 'unknown';
      for (const part of pathParts) {
        if (/^[a-z]{2}(-[A-Z]{2})?$/.test(part)) {
          language = part;
          break;
        }
      }
      
      const id = `captured-${language}-${Date.now()}`;
      
      // Check if we already have this track
      const exists = this.subtitleTracks.some(t => t.url === url);
      if (exists) return;
      
      this.subtitleTracks.push({
        id,
        language,
        label: this.getLanguageLabel(language),
        url,
        format: 'webvtt' as SubtitleFormat,
        isAutoGenerated: false,
        isDefault: this.subtitleTracks.length === 0,
      });
      
      log.debug('Captured subtitle URL', { language });
    } catch (error) {
      log.warn('Failed to parse subtitle URL', error instanceof Error ? { error: error.message } : { error });
    }
  }
  
  /**
   * Get human-readable language label
   */
  private getLanguageLabel(code: string): string {
    const labels: Record<string, string> = {
      'en': 'English',
      'en-US': 'English (US)',
      'en-GB': 'English (UK)',
      'zh': 'Chinese',
      'zh-TW': 'Chinese (Traditional)',
      'zh-CN': 'Chinese (Simplified)',
      'zh-Hant': 'Chinese (Traditional)',
      'zh-Hans': 'Chinese (Simplified)',
      'ja': 'Japanese',
      'ko': 'Korean',
      'es': 'Spanish',
      'es-ES': 'Spanish (Spain)',
      'es-419': 'Spanish (Latin America)',
      'fr': 'French',
      'de': 'German',
      'pt': 'Portuguese',
      'pt-BR': 'Portuguese (Brazil)',
      'it': 'Italian',
      'ru': 'Russian',
    };
    return labels[code] || code;
  }
  
  /**
   * Wait for video element to be available
   */
  private waitForVideoElement(): Promise<HTMLVideoElement> {
    return new Promise((resolve) => {
      const video = document.querySelector('video');
      if (video) {
        this.videoElement = video;
        resolve(video);
        return;
      }

      // Store observer reference for cleanup
      this.videoObserver = new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video) {
          this.videoElement = video;
          this.videoObserver?.disconnect();
          this.videoObserver = null;
          resolve(video);
        }
      });

      const startObserving = (): void => {
        if (document.body && this.videoObserver) {
          this.videoObserver.observe(document.body, {
            childList: true,
            subtree: true,
          });
        } else if (this.videoObserver) {
          setTimeout(startObserving, 10);
        }
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
      } else {
        startObserving();
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        this.videoObserver?.disconnect();
        this.videoObserver = null;
        const video = document.querySelector('video');
        if (video) {
          this.videoElement = video;
          resolve(video);
        }
      }, 30000);
    });
  }
  
  /**
   * Create or update subtitle overlay
   */
  private createOrUpdateOverlay(options: RenderOptions): void {
    if (!this.subtitleOverlay) {
      this.subtitleOverlay = document.createElement('div');
      this.subtitleOverlay.className = 'ai-subtitle-overlay disney-subtitle-overlay';
      this.subtitleOverlay.setAttribute('data-ai-subtitle', 'true');
      
      // Inject styles
      this.injectStyles(options);
      
      // Find player container
      const playerContainer = document.querySelector('.btm-media-player') ||
                             document.querySelector('[data-testid="video-player"]') ||
                             document.querySelector('.video-player') ||
                             document.body;
      
      playerContainer.appendChild(this.subtitleOverlay);
    }
    
    // Update styles based on options
    this.updateOverlayStyles(options);
  }
  
  /**
   * Inject Disney+-specific styles
   */
  private injectStyles(options: RenderOptions): void {
    const styleId = 'ai-subtitle-disney-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .disney-subtitle-overlay {
        position: absolute;
        left: 0;
        right: 0;
        ${options.position === 'top' ? 'top: 8%;' : 'bottom: 12%;'}
        z-index: 100000;
        text-align: center;
        pointer-events: none;
        font-family: Avenir, Avenir Next, Helvetica Neue, Helvetica, sans-serif;
      }
      
      .disney-subtitle-overlay .subtitle-text {
        display: inline-block;
        padding: 6px 16px;
        font-size: ${options.fontSize}px;
        color: #f9f9f9;
        text-shadow: 
          2px 2px 4px rgba(0, 0, 0, 0.9),
          -1px -1px 2px rgba(0, 0, 0, 0.6);
        max-width: 85%;
        line-height: 1.5;
        letter-spacing: 0.02em;
      }
      
      .disney-subtitle-overlay .subtitle-text.bilingual {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      
      .disney-subtitle-overlay .subtitle-text .translated {
        font-size: ${options.fontSize}px;
        font-weight: 500;
      }
      
      .disney-subtitle-overlay .subtitle-text .original {
        font-size: ${Math.round(options.fontSize * 0.85)}px;
        opacity: 0.75;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Update overlay styles
   */
  private updateOverlayStyles(options: RenderOptions): void {
    if (!this.subtitleOverlay) return;
    
    if (options.position === 'top') {
      this.subtitleOverlay.style.top = '8%';
      this.subtitleOverlay.style.bottom = 'auto';
    } else {
      this.subtitleOverlay.style.bottom = '12%';
      this.subtitleOverlay.style.top = 'auto';
    }
  }
  
  /**
   * Setup time synchronization
   */
  private setupTimeSync(): void {
    const video = this.getVideoElement();
    if (!video) return;
    
    // Initial update
    this.updateCurrentSubtitle(video.currentTime);
    
    // Listen for time updates
    this.onVideoEvent((event) => {
      if (event.type === 'timeupdate' || event.type === 'seeked') {
        this.updateCurrentSubtitle(event.currentTime);
      }
    });
  }
  
  /**
   * Update displayed subtitle based on current time
   */
  private updateCurrentSubtitle(currentTime: number): void {
    if (!this.subtitleOverlay) return;
    
    // Find active cues
    const currentTimeMs = currentTime * 1000;
    const activeCues = this.currentCues.filter(
      cue => currentTimeMs >= cue.startTime && currentTimeMs < cue.endTime
    );
    
    if (activeCues.length === 0) {
      this.clearOverlay();
      return;
    }

    // Clear and rebuild using DOM APIs (Trusted Types compliant)
    this.clearOverlay();

    activeCues.forEach((cue, index) => {
      if (index > 0) {
        this.subtitleOverlay!.appendChild(document.createElement('br'));
      }

      const span = document.createElement('span');
      span.className = cue.translatedText ? 'subtitle-text bilingual' : 'subtitle-text';

      if (cue.translatedText) {
        const translatedSpan = document.createElement('span');
        translatedSpan.className = 'translated';
        translatedSpan.textContent = cue.translatedText;
        span.appendChild(translatedSpan);

        const originalSpan = document.createElement('span');
        originalSpan.className = 'original';
        originalSpan.textContent = cue.text;
        span.appendChild(originalSpan);
      } else {
        span.textContent = cue.text;
      }

      this.subtitleOverlay!.appendChild(span);
    });
  }

  /**
   * Clear overlay content (Trusted Types compliant)
   */
  private clearOverlay(): void {
    if (!this.subtitleOverlay) return;
    while (this.subtitleOverlay.firstChild) {
      this.subtitleOverlay.removeChild(this.subtitleOverlay.firstChild);
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDisneyAdapter(): DisneyAdapter {
  return new DisneyAdapter();
}
