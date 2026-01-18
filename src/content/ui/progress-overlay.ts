/**
 * Translation Progress Overlay
 * 
 * Displays translation progress as an overlay on the video player.
 * Shows detailed progress information including chunk progress.
 * 
 * @see FR-025: Progress Display Requirements
 */

import type { JobProgress } from '../../shared/types/translation';

// ============================================================================
// Types
// ============================================================================

export interface ProgressOverlayOptions {
  /** Cancel button click handler */
  onCancel?: () => void | Promise<void>;
}

export interface ProgressOverlay {
  /** Show the overlay */
  show(): void;
  
  /** Hide the overlay */
  hide(): void;
  
  /** Update progress */
  updateProgress(progress: JobProgress): void;
  
  /** Show error state */
  showError(message: string, retryable?: boolean): void;
  
  /** Show completion state */
  showComplete(): void;
  
  /** Destroy and cleanup */
  destroy(): void;
  
  /** Check if visible */
  isVisible(): boolean;
}

// ============================================================================
// Constants
// ============================================================================

const OVERLAY_ID = 'ai-subtitle-progress-overlay';

// ============================================================================
// Styles
// ============================================================================

const OVERLAY_STYLES = `
  #${OVERLAY_ID} {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 2147483646;
    font-family: system-ui, -apple-system, sans-serif;
    color: #fff;
    animation: fadeIn 0.2s ease-out;
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  #${OVERLAY_ID} .progress-container {
    text-align: center;
    max-width: 400px;
    padding: 24px;
  }
  
  #${OVERLAY_ID} .progress-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  
  #${OVERLAY_ID} .progress-title {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  
  #${OVERLAY_ID} .progress-subtitle {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 24px;
  }
  
  #${OVERLAY_ID} .progress-bar-container {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 12px;
  }
  
  #${OVERLAY_ID} .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  
  #${OVERLAY_ID} .progress-stats {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 20px;
  }
  
  #${OVERLAY_ID} .progress-time {
    color: rgba(255, 255, 255, 0.6);
  }
  
  #${OVERLAY_ID} .progress-cancel {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 8px 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }
  
  #${OVERLAY_ID} .progress-cancel:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  #${OVERLAY_ID}.error .progress-icon {
    color: #ff5252;
  }
  
  #${OVERLAY_ID}.complete .progress-icon {
    color: #4CAF50;
  }
  
  #${OVERLAY_ID} .error-message {
    color: #ff8a80;
    margin-bottom: 16px;
  }
  
  #${OVERLAY_ID} .retry-button {
    background: #4CAF50;
    border: none;
    color: #fff;
    padding: 10px 28px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    margin-right: 12px;
    transition: background 0.2s ease;
  }
  
  #${OVERLAY_ID} .retry-button:hover {
    background: #43A047;
  }
`;

// ============================================================================
// Implementation
// ============================================================================

export function createProgressOverlay(options: ProgressOverlayOptions = {}): ProgressOverlay {
  const { onCancel } = options;
  
  let overlay: HTMLDivElement | null = null;
  let visible = false;
  let currentProgress: JobProgress | null = null;
  
  /**
   * Inject styles
   */
  function injectStyles(): void {
    const styleId = 'ai-subtitle-progress-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = OVERLAY_STYLES;
    document.head.appendChild(style);
  }
  
  /**
   * Format time remaining
   */
  function formatTimeRemaining(seconds?: number): string {
    if (!seconds || seconds <= 0) return '';
    
    if (seconds < 60) {
      return `約 ${seconds} 秒`;
    }
    
    const minutes = Math.ceil(seconds / 60);
    return `約 ${minutes} 分鐘`;
  }
  
  /**
   * Create overlay element
   */
  function createOverlayElement(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    
    updateOverlayContent(overlay, 'translating');
    
    return overlay;
  }
  
  /**
   * Update overlay content
   */
  function updateOverlayContent(
    el: HTMLElement,
    state: 'translating' | 'error' | 'complete',
    error?: string,
    retryable?: boolean
  ): void {
    el.className = '';
    el.classList.add(state);
    
    const progress = currentProgress;
    const percent = progress 
      ? Math.round((progress.translatedCount / progress.totalCount) * 100)
      : 0;
    
    if (state === 'translating') {
      el.innerHTML = `
        <div class="progress-container">
          <div class="progress-icon">🌐</div>
          <div class="progress-title">正在翻譯字幕...</div>
          <div class="progress-subtitle">
            區塊 ${(progress?.currentChunk ?? 0) + 1} / ${progress?.totalChunks ?? 1}
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${percent}%"></div>
          </div>
          <div class="progress-stats">
            <span>${progress?.translatedCount ?? 0} / ${progress?.totalCount ?? 0} 句</span>
            <span class="progress-time">${formatTimeRemaining(progress?.estimatedTimeRemaining)}</span>
          </div>
          ${onCancel ? '<button class="progress-cancel">取消</button>' : ''}
        </div>
      `;
      
      if (onCancel) {
        const cancelBtn = el.querySelector('.progress-cancel');
        cancelBtn?.addEventListener('click', () => void onCancel());
      }
    } else if (state === 'error') {
      el.innerHTML = `
        <div class="progress-container">
          <div class="progress-icon">❌</div>
          <div class="progress-title">翻譯失敗</div>
          <div class="error-message">${error || '發生未知錯誤'}</div>
          ${retryable ? '<button class="retry-button">重試</button>' : ''}
          <button class="progress-cancel">關閉</button>
        </div>
      `;
      
      const closeBtn = el.querySelector('.progress-cancel');
      closeBtn?.addEventListener('click', () => {
        visible = false;
        el.remove();
      });
    } else if (state === 'complete') {
      el.innerHTML = `
        <div class="progress-container">
          <div class="progress-icon">✅</div>
          <div class="progress-title">翻譯完成！</div>
          <div class="progress-subtitle">
            已翻譯 ${progress?.totalCount ?? 0} 句字幕
          </div>
        </div>
      `;
      
      // Auto-hide after 2 seconds
      setTimeout(() => {
        visible = false;
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s ease';
        setTimeout(() => el.remove(), 300);
      }, 2000);
    }
  }
  
  /**
   * Find video container
   */
  function findVideoContainer(): HTMLElement | null {
    // Try common video containers
    const selectors = [
      '.html5-video-player',           // YouTube
      '.watch-video--player-view',     // Netflix
      '.btm-media-player',             // Disney+
      '.atvwebplayersdk-overlays-container', // Prime
      'video',                         // Fallback
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el instanceof HTMLElement) {
        // For video element, use parent
        if (el.tagName === 'VIDEO') {
          return el.parentElement;
        }
        return el;
      }
    }
    
    return null;
  }
  
  return {
    show(): void {
      if (visible) return;
      
      injectStyles();
      
      const container = findVideoContainer();
      if (!container) {
        console.warn('[ProgressOverlay] Could not find video container');
        return;
      }
      
      // Remove existing overlay
      const existing = document.getElementById(OVERLAY_ID);
      if (existing) existing.remove();
      
      overlay = createOverlayElement();
      
      // Ensure container has position
      if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      
      container.appendChild(overlay);
      visible = true;
      
      console.log('[ProgressOverlay] Shown');
    },
    
    hide(): void {
      if (!visible) return;
      
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      
      visible = false;
      console.log('[ProgressOverlay] Hidden');
    },
    
    updateProgress(progress: JobProgress): void {
      currentProgress = progress;
      
      if (!overlay || !visible) return;
      
      const percent = Math.round((progress.translatedCount / progress.totalCount) * 100);
      
      const progressBar = overlay.querySelector('.progress-bar') as HTMLElement | null;
      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
      
      const subtitle = overlay.querySelector('.progress-subtitle');
      if (subtitle) {
        subtitle.textContent = `區塊 ${progress.currentChunk + 1} / ${progress.totalChunks}`;
      }
      
      const stats = overlay.querySelector('.progress-stats span:first-child');
      if (stats) {
        stats.textContent = `${progress.translatedCount} / ${progress.totalCount} 句`;
      }
      
      const timeEl = overlay.querySelector('.progress-time');
      if (timeEl) {
        timeEl.textContent = formatTimeRemaining(progress.estimatedTimeRemaining);
      }
    },
    
    showError(message: string, retryable = false): void {
      if (!overlay || !visible) return;
      updateOverlayContent(overlay, 'error', message, retryable);
    },
    
    showComplete(): void {
      if (!overlay || !visible) return;
      updateOverlayContent(overlay, 'complete');
    },
    
    destroy(): void {
      this.hide();
      
      const style = document.getElementById('ai-subtitle-progress-styles');
      if (style) style.remove();
    },
    
    isVisible(): boolean {
      return visible;
    },
  };
}
