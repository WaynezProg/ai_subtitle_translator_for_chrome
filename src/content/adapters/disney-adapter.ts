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
  
  // ============================================================================
  // Public Methods
  // ============================================================================
  
  canHandle(url: string): boolean {
    return this.urlPatterns.some(p => p.pattern.test(url));
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[DisneyAdapter] Initializing...');
    
    // Setup fetch hook to intercept subtitle requests
    this.setupFetchHook();
    
    // Wait for video element
    await this.waitForVideoElement();
    
    this.initialized = true;
    console.log('[DisneyAdapter] Initialized');
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
    console.log('[DisneyAdapter] Fetching subtitle:', track.id);
    
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
    console.log('[DisneyAdapter] Injected', cues.length, 'cues');
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
    console.log('[DisneyAdapter] Destroying...');
    
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
      const url = typeof input === 'string' 
        ? input 
        : input instanceof URL 
          ? input.toString() 
          : input.url;
      
      // Clone the response for inspection
      const response = await self.originalFetch!.call(window, input, init);
      
      // Check for playback/manifest endpoints
      if (self.isPlaybackUrl(url)) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json() as DisneyPlaybackContext;
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
    
    console.log('[DisneyAdapter] Fetch hook installed');
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
    
    console.log('[DisneyAdapter] Extracted', this.subtitleTracks.length, 'subtitle tracks');
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
      
      console.log('[DisneyAdapter] Captured subtitle URL:', language);
    } catch (error) {
      console.warn('[DisneyAdapter] Failed to parse subtitle URL:', error);
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

      const observer = new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video) {
          this.videoElement = video;
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
      this.subtitleOverlay.innerHTML = '';
      return;
    }
    
    // Display cues
    const html = activeCues.map(cue => {
      if (cue.translatedText) {
        return `
          <span class="subtitle-text bilingual">
            <span class="translated">${this.escapeHtml(cue.translatedText)}</span>
            <span class="original">${this.escapeHtml(cue.text)}</span>
          </span>
        `;
      }
      return `<span class="subtitle-text">${this.escapeHtml(cue.text)}</span>`;
    }).join('<br>');
    
    this.subtitleOverlay.innerHTML = html;
  }
  
  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createDisneyAdapter(): DisneyAdapter {
  return new DisneyAdapter();
}
