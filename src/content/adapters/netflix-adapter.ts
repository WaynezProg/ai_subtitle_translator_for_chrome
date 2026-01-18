/**
 * Netflix Adapter
 * 
 * Handles subtitle interception and rendering for Netflix.
 * Uses JSON.parse hook to intercept manifest data containing subtitle URLs.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/platform-adapter.md
 * @see FR-002: Netflix Support
 * @see FR-006: Subtitle Format Support (TTML)
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

interface NetflixManifest {
  result?: {
    timedtexttracks?: NetflixTimedTextTrack[];
  };
}

interface NetflixTimedTextTrack {
  trackType: string;
  language: string;
  rawTrackType: string;
  isNoneTrack?: boolean;
  isForcedNarrative?: boolean;
  ttDownloadables?: {
    [format: string]: {
      urls: Array<{ url: string }>;
    };
  };
}

// ============================================================================
// Netflix Adapter
// ============================================================================

export class NetflixAdapter implements PlatformAdapter {
  readonly platform: Platform = 'netflix';
  
  readonly urlPatterns: URLPattern[] = [
    { pattern: /^https?:\/\/(?:www\.)?netflix\.com\/watch\//, type: 'main' },
  ];
  
  private videoElement: HTMLVideoElement | null = null;
  private subtitleTracks: SubtitleTrack[] = [];
  private eventListeners: Map<VideoEventCallback, () => void> = new Map();
  private subtitleOverlay: HTMLDivElement | null = null;
  private currentCues: Cue[] = [];
  private originalJsonParse: typeof JSON.parse | null = null;
  private initialized = false;
  
  // ============================================================================
  // Public Methods
  // ============================================================================
  
  canHandle(url: string): boolean {
    return this.urlPatterns.some(p => p.pattern.test(url));
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('[NetflixAdapter] Initializing...');
    
    // Setup JSON.parse hook to intercept manifest
    this.setupJsonParseHook();
    
    // Wait for video element
    await this.waitForVideoElement();
    
    this.initialized = true;
    console.log('[NetflixAdapter] Initialized');
  }
  
  getVideoId(): string | null {
    // Extract video ID from URL: netflix.com/watch/{videoId}
    const match = window.location.pathname.match(/\/watch\/(\d+)/);
    return match ? match[1] : null;
  }
  
  async getSubtitleTracks(): Promise<SubtitleTrack[]> {
    // Return cached tracks from manifest interception
    return this.subtitleTracks;
  }
  
  async fetchSubtitle(track: SubtitleTrack): Promise<RawSubtitle> {
    console.log('[NetflixAdapter] Fetching subtitle:', track.id);
    
    try {
      const response = await fetch(track.url);
      
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
    console.log('[NetflixAdapter] Injected', cues.length, 'cues');
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
    console.log('[NetflixAdapter] Destroying...');
    
    // Restore original JSON.parse
    if (this.originalJsonParse) {
      JSON.parse = this.originalJsonParse;
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
   * Setup JSON.parse hook to intercept Netflix manifest
   */
  private setupJsonParseHook(): void {
    this.originalJsonParse = JSON.parse;
    const self = this;
    
    JSON.parse = function(text: string, reviver?: (key: string, value: unknown) => unknown): unknown {
      const result = self.originalJsonParse!.call(this, text, reviver);
      
      // Check if this looks like a Netflix manifest with timed text tracks
      if (self.isNetflixManifest(result)) {
        self.extractSubtitleTracks(result as NetflixManifest);
      }
      
      return result;
    };
    
    console.log('[NetflixAdapter] JSON.parse hook installed');
  }
  
  /**
   * Check if parsed JSON is a Netflix manifest
   */
  private isNetflixManifest(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    
    const manifest = data as NetflixManifest;
    return !!(manifest.result?.timedtexttracks);
  }
  
  /**
   * Extract subtitle tracks from manifest
   */
  private extractSubtitleTracks(manifest: NetflixManifest): void {
    const tracks = manifest.result?.timedtexttracks;
    if (!tracks || !Array.isArray(tracks)) return;
    
    this.subtitleTracks = [];
    
    for (const track of tracks) {
      // Skip none tracks and forced narrative
      if (track.isNoneTrack || track.isForcedNarrative) continue;
      
      // Only process SUBTITLES type
      if (track.trackType !== 'SUBTITLES') continue;
      
      // Get TTML URL (Netflix uses TTML primarily)
      const ttmlDownloadable = track.ttDownloadables?.['dfxp-ls-sdh'] || 
                               track.ttDownloadables?.['nflx-cmisc'] ||
                               track.ttDownloadables?.['simplesdh'];
      
      if (!ttmlDownloadable?.urls?.length) continue;
      
      const url = ttmlDownloadable.urls[0]?.url;
      if (!url) continue;
      
      this.subtitleTracks.push({
        id: `${track.language}-${track.rawTrackType}`,
        language: track.language,
        label: this.getLanguageLabel(track.language),
        url,
        format: 'ttml' as SubtitleFormat,
        isAutoGenerated: false,
        isDefault: track.rawTrackType === 'subtitles' || this.subtitleTracks.length === 0,
      });
    }
    
    console.log('[NetflixAdapter] Extracted', this.subtitleTracks.length, 'subtitle tracks');
  }
  
  /**
   * Get human-readable language label
   */
  private getLanguageLabel(code: string): string {
    const labels: Record<string, string> = {
      'en': 'English',
      'zh': 'Chinese',
      'zh-TW': 'Chinese (Traditional)',
      'zh-CN': 'Chinese (Simplified)',
      'ja': 'Japanese',
      'ko': 'Korean',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'pt': 'Portuguese',
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
      this.subtitleOverlay.className = 'ai-subtitle-overlay netflix-subtitle-overlay';
      this.subtitleOverlay.setAttribute('data-ai-subtitle', 'true');
      
      // Inject styles
      this.injectStyles(options);
      
      // Find player container
      const playerContainer = document.querySelector('.watch-video--player-view') ||
                             document.querySelector('.VideoContainer') ||
                             document.body;
      
      playerContainer.appendChild(this.subtitleOverlay);
    }
    
    // Update styles based on options
    this.updateOverlayStyles(options);
  }
  
  /**
   * Inject Netflix-specific styles
   */
  private injectStyles(options: RenderOptions): void {
    const styleId = 'ai-subtitle-netflix-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .netflix-subtitle-overlay {
        position: absolute;
        left: 0;
        right: 0;
        ${options.position === 'top' ? 'top: 10%;' : 'bottom: 10%;'}
        z-index: 100000;
        text-align: center;
        pointer-events: none;
        font-family: Netflix Sans, Helvetica Neue, Segoe UI, Roboto, Ubuntu, sans-serif;
      }
      
      .netflix-subtitle-overlay .subtitle-text {
        display: inline-block;
        padding: 4px 12px;
        font-size: ${options.fontSize}px;
        color: #fff;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.9),
                     -1px -1px 2px rgba(0, 0, 0, 0.5);
        max-width: 80%;
        line-height: 1.4;
      }
      
      .netflix-subtitle-overlay .subtitle-text.bilingual {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .netflix-subtitle-overlay .subtitle-text .original {
        font-size: ${Math.round(options.fontSize * 0.85)}px;
        opacity: 0.8;
      }
      
      .netflix-subtitle-overlay .subtitle-text .translated {
        font-size: ${options.fontSize}px;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Update overlay styles
   */
  private updateOverlayStyles(options: RenderOptions): void {
    if (!this.subtitleOverlay) return;
    
    this.subtitleOverlay.style[options.position === 'top' ? 'top' : 'bottom'] = '10%';
    this.subtitleOverlay.style[options.position === 'top' ? 'bottom' : 'top'] = 'auto';
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
      if (event.type === 'timeupdate') {
        this.updateCurrentSubtitle(event.currentTime);
      } else if (event.type === 'seeked') {
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

export function createNetflixAdapter(): NetflixAdapter {
  return new NetflixAdapter();
}
