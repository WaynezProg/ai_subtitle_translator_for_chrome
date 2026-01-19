/**
 * Prime Video Platform Adapter
 * 
 * Handles subtitle interception and rendering for Amazon Prime Video.
 * Uses fetch hook to intercept WebVTT subtitle requests with authorization.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/platform-adapter.md
 * @see FR-004: Prime Video Support
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

// ============================================================================
// Types
// ============================================================================

interface PrimePlaybackManifest {
  catalogMetadata?: {
    catalog?: {
      id?: string;
      title?: string;
    };
  };
  subtitleUrls?: PrimeSubtitleInfo[];
  textTracks?: PrimeTextTrack[];
  forcedNarratives?: PrimeSubtitleInfo[];
}

interface PrimeSubtitleInfo {
  url: string;
  displayName?: string;
  languageCode?: string;
  type?: string;
}

interface PrimeTextTrack {
  displayName: string;
  languageCode: string;
  url: string;
  type: string;
  timedTextTrackId?: string;
}

// ============================================================================
// Prime Video Adapter
// ============================================================================

export class PrimeAdapter implements PlatformAdapter {
  readonly platform: Platform = 'prime';
  
  readonly urlPatterns: URLPattern[] = [
    { pattern: /^https?:\/\/(?:www\.)?primevideo\.com\/detail\//, type: 'main' },
    { pattern: /^https?:\/\/(?:www\.)?primevideo\.com\/[a-z]{2}\/detail\//, type: 'main' },
    { pattern: /^https?:\/\/(?:www\.)?amazon\.com\/gp\/video\/detail\//, type: 'main' },
    { pattern: /^https?:\/\/(?:www\.)?amazon\.com\/[a-z]{2}\/gp\/video\/detail\//, type: 'main' },
    { pattern: /^https?:\/\/(?:www\.)?amazon\.[a-z.]+\/gp\/video\/detail\//, type: 'main' },
  ];
  
  private videoElement: HTMLVideoElement | null = null;
  private subtitleTracks: SubtitleTrack[] = [];
  private eventListeners: Map<VideoEventCallback, () => void> = new Map();
  private subtitleOverlay: HTMLDivElement | null = null;
  private currentCues: Cue[] = [];
  private originalFetch: typeof window.fetch | null = null;
  private originalXHROpen: typeof XMLHttpRequest.prototype.open | null = null;
  private capturedAuthHeaders: Record<string, string> = {};
  private initialized = false;
  
  // ============================================================================
  // Public Methods
  // ============================================================================
  
  canHandle(url: string): boolean {
    return this.urlPatterns.some(p => p.pattern.test(url));
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[PrimeAdapter] Initializing...');
    
    // Setup fetch/XHR hooks to intercept requests
    this.setupFetchHook();
    this.setupXHRHook();
    
    // Wait for video element
    await this.waitForVideoElement();
    
    this.initialized = true;
    console.log('[PrimeAdapter] Initialized');
  }
  
  getVideoId(): string | null {
    // Extract video ID from URL
    // primevideo.com/detail/{asin}
    // amazon.com/gp/video/detail/{asin}
    const match = window.location.pathname.match(/\/detail\/([A-Z0-9]+)/i) ||
                  window.location.pathname.match(/\/([A-Z0-9]{10})/);
    return match ? match[1] : null;
  }
  
  async getSubtitleTracks(): Promise<SubtitleTrack[]> {
    return this.subtitleTracks;
  }
  
  async fetchSubtitle(track: SubtitleTrack): Promise<RawSubtitle> {
    console.log('[PrimeAdapter] Fetching subtitle:', track.id);
    
    try {
      // Include captured authorization headers
      const headers: HeadersInit = {
        ...this.capturedAuthHeaders,
      };
      
      const response = await fetch(track.url, {
        credentials: 'include',
        headers,
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
    console.log('[PrimeAdapter] Injected', cues.length, 'cues');
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
      // Prime Video uses multiple possible selectors
      this.videoElement = document.querySelector('video.webPlayerElement') ||
                          document.querySelector('video[data-video-player]') ||
                          document.querySelector('video');
    }
    return this.videoElement;
  }
  
  onVideoEvent(callback: VideoEventCallback): () => void {
    const video = this.getVideoElement();
    if (!video) {
      return () => {};
    }
    
    const handlers = {
      play: () => callback({ type: 'play' }),
      pause: () => callback({ type: 'pause' }),
      seeked: () => callback({ type: 'seeked', currentTime: video.currentTime }),
      timeupdate: () => callback({ type: 'timeupdate', currentTime: video.currentTime }),
      ended: () => callback({ type: 'ended' }),
      ratechange: () => callback({ type: 'ratechange', playbackRate: video.playbackRate }),
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
    console.log('[PrimeAdapter] Destroying...');
    
    // Restore original fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    
    // Restore original XHR
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = null;
    }
    
    // Cleanup event listeners
    for (const cleanup of this.eventListeners.values()) {
      cleanup();
    }
    this.eventListeners.clear();
    
    // Remove overlay
    this.removeSubtitles();
    
    this.capturedAuthHeaders = {};
    this.initialized = false;
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Setup fetch hook to intercept Prime Video API requests
   */
  private setupFetchHook(): void {
    this.originalFetch = window.fetch;
    const self = this;
    
    window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      let url: string;
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
      
      // Capture authorization headers from API requests
      if (self.isApiRequest(url) && init?.headers) {
        self.captureHeaders(init.headers);
      }
      
      // Clone the response for inspection
      const response = await self.originalFetch!.call(window, input, init);
      
      // Check for playback/manifest endpoints
      if (self.isPlaybackUrl(url)) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json() as PrimePlaybackManifest;
          self.extractSubtitleTracks(data);
        } catch {
          // Ignore parse errors
        }
      }
      
      // Capture direct subtitle URLs
      if (self.isSubtitleUrl(url)) {
        self.captureSubtitleUrl(url);
      }
      
      return response;
    };
    
    console.log('[PrimeAdapter] Fetch hook installed');
  }
  
  /**
   * Setup XHR hook to capture additional requests
   */
  private setupXHRHook(): void {
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    const self = this;
    
    XMLHttpRequest.prototype.open = function(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null
    ) {
      const urlString = url.toString();
      
      // Capture subtitle URLs
      if (self.isSubtitleUrl(urlString)) {
        self.captureSubtitleUrl(urlString);
      }
      
      return self.originalXHROpen!.call(
        this,
        method,
        url,
        async ?? true,
        username ?? null,
        password ?? null
      );
    };
    
    console.log('[PrimeAdapter] XHR hook installed');
  }
  
  /**
   * Check if URL is an API request
   */
  private isApiRequest(url: string): boolean {
    return url.includes('atv-ps') || 
           url.includes('api.amazon') ||
           url.includes('fls-na.amazon');
  }
  
  /**
   * Check if URL is a playback/manifest endpoint
   */
  private isPlaybackUrl(url: string): boolean {
    return url.includes('GetPlaybackResources') || 
           url.includes('playback') ||
           url.includes('manifest');
  }
  
  /**
   * Check if URL is a subtitle file
   */
  private isSubtitleUrl(url: string): boolean {
    return url.includes('.vtt') || 
           url.includes('.srt') ||
           url.includes('TimedText') ||
           url.includes('subtitle');
  }
  
  /**
   * Capture authorization headers from request
   */
  private captureHeaders(headers: HeadersInit): void {
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        if (this.isAuthHeader(key)) {
          this.capturedAuthHeaders[key] = value;
        }
      });
    } else if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        if (this.isAuthHeader(key)) {
          this.capturedAuthHeaders[key] = value;
        }
      }
    } else {
      for (const [key, value] of Object.entries(headers)) {
        if (this.isAuthHeader(key)) {
          this.capturedAuthHeaders[key] = value;
        }
      }
    }
  }
  
  /**
   * Check if header is an authorization header
   */
  private isAuthHeader(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return lowerKey === 'authorization' ||
           lowerKey === 'x-amzn-sessionid' ||
           lowerKey === 'x-requested-with' ||
           lowerKey.startsWith('x-amz-');
  }
  
  /**
   * Extract subtitle tracks from playback manifest
   */
  private extractSubtitleTracks(data: PrimePlaybackManifest): void {
    const tracks: Array<PrimeSubtitleInfo | PrimeTextTrack> = [];
    
    if (data.subtitleUrls) {
      tracks.push(...data.subtitleUrls);
    }
    if (data.textTracks) {
      tracks.push(...data.textTracks);
    }
    
    if (tracks.length === 0) return;
    
    this.subtitleTracks = [];
    
    for (const track of tracks) {
      const url = track.url;
      if (!url) continue;
      
      // Skip forced narratives
      const trackType = 'type' in track ? track.type : '';
      if (trackType === 'forcedNarrative') continue;
      
      const language = 'languageCode' in track ? track.languageCode : 'unknown';
      const label = 'displayName' in track ? track.displayName : this.getLanguageLabel(language || 'unknown');
      const id = 'timedTextTrackId' in track && track.timedTextTrackId 
        ? track.timedTextTrackId 
        : `${language}-${trackType || 'subtitle'}`;
      
      this.subtitleTracks.push({
        id,
        language: language || 'unknown',
        label: label || language || 'Unknown',
        url,
        format: 'webvtt' as SubtitleFormat,
        isAutoGenerated: false,
        isDefault: this.subtitleTracks.length === 0,
      });
    }
    
    console.log('[PrimeAdapter] Extracted', this.subtitleTracks.length, 'subtitle tracks');
  }
  
  /**
   * Capture subtitle URL from request
   */
  private captureSubtitleUrl(url: string): void {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Try to extract language from path or query
      let language = urlObj.searchParams.get('languageCode') || 'unknown';
      if (language === 'unknown') {
        for (const part of pathParts) {
          if (/^[a-z]{2}(-[A-Z]{2})?$/i.test(part)) {
            language = part;
            break;
          }
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
      
      console.log('[PrimeAdapter] Captured subtitle URL:', language);
    } catch (error) {
      console.warn('[PrimeAdapter] Failed to parse subtitle URL:', error);
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
      'hi': 'Hindi',
      'ar': 'Arabic',
    };
    return labels[code] || code;
  }
  
  /**
   * Wait for video element to be available
   */
  private waitForVideoElement(): Promise<HTMLVideoElement> {
    return new Promise((resolve) => {
      const video = this.getVideoElement();
      if (video) {
        resolve(video);
        return;
      }

      const observer = new MutationObserver(() => {
        const video = this.getVideoElement();
        if (video) {
          observer.disconnect();
          resolve(video);
        }
      });

      const startObserving = (): void => {
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
        } else {
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
        observer.disconnect();
        const video = this.getVideoElement();
        if (video) {
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
      this.subtitleOverlay.className = 'ai-subtitle-overlay prime-subtitle-overlay';
      this.subtitleOverlay.setAttribute('data-ai-subtitle', 'true');
      
      // Inject styles
      this.injectStyles(options);
      
      // Find player container
      const playerContainer = document.querySelector('.webPlayerContainer') ||
                             document.querySelector('.atvwebplayersdk-overlays-container') ||
                             document.querySelector('[data-testid="video-player"]') ||
                             document.body;
      
      playerContainer.appendChild(this.subtitleOverlay);
    }
    
    // Update styles based on options
    this.updateOverlayStyles(options);
  }
  
  /**
   * Inject Prime Video-specific styles
   */
  private injectStyles(options: RenderOptions): void {
    const styleId = 'ai-subtitle-prime-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .prime-subtitle-overlay {
        position: absolute;
        left: 0;
        right: 0;
        ${options.position === 'top' ? 'top: 8%;' : 'bottom: 15%;'}
        z-index: 100000;
        text-align: center;
        pointer-events: none;
        font-family: "Amazon Ember", Arial, Helvetica, sans-serif;
      }
      
      .prime-subtitle-overlay .subtitle-text {
        display: inline-block;
        padding: 6px 14px;
        font-size: ${options.fontSize}px;
        color: #fff;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 2px;
        max-width: 80%;
        line-height: 1.4;
      }
      
      .prime-subtitle-overlay .subtitle-text.bilingual {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .prime-subtitle-overlay .subtitle-text .translated {
        font-size: ${options.fontSize}px;
        font-weight: 500;
      }
      
      .prime-subtitle-overlay .subtitle-text .original {
        font-size: ${Math.round(options.fontSize * 0.85)}px;
        opacity: 0.8;
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
      this.subtitleOverlay.style.bottom = '15%';
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

export function createPrimeAdapter(): PrimeAdapter {
  return new PrimeAdapter();
}
