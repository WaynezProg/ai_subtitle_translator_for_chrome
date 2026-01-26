/**
 * Translation Progress Overlay
 * 
 * Displays translation progress as an overlay on the video player.
 * Shows detailed progress information including chunk progress.
 * 
 * @see FR-025: Progress Display Requirements
 */

import type { JobProgress } from '../../shared/types/translation';
import { createLogger } from '../../shared/utils/logger';

const log = createLogger('ProgressOverlay');

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
// Implementation
// ============================================================================
// Note: CSS is loaded via manifest.json content_scripts for Trusted Types compliance

export function createProgressOverlay(options: ProgressOverlayOptions = {}): ProgressOverlay {
  const { onCancel } = options;
  
  let overlay: HTMLDivElement | null = null;
  let visible = false;
  let currentProgress: JobProgress | null = null;
  
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
    
    // Clear existing content
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
    
    // Create container
    const container = document.createElement('div');
    container.className = 'progress-container';
    
    if (state === 'translating') {
      const icon = document.createElement('div');
      icon.className = 'progress-icon';
      icon.textContent = '🌐';
      container.appendChild(icon);
      
      const title = document.createElement('div');
      title.className = 'progress-title';
      title.textContent = '正在翻譯字幕...';
      container.appendChild(title);
      
      const subtitle = document.createElement('div');
      subtitle.className = 'progress-subtitle';
      subtitle.textContent = `區塊 ${(progress?.currentChunk ?? 0) + 1} / ${progress?.totalChunks ?? 1}`;
      container.appendChild(subtitle);
      
      const barContainer = document.createElement('div');
      barContainer.className = 'progress-bar-container';
      const bar = document.createElement('div');
      bar.className = 'progress-bar';
      bar.style.width = `${percent}%`;
      barContainer.appendChild(bar);
      container.appendChild(barContainer);
      
      const stats = document.createElement('div');
      stats.className = 'progress-stats';
      const countSpan = document.createElement('span');
      countSpan.textContent = `${progress?.translatedCount ?? 0} / ${progress?.totalCount ?? 0} 句`;
      stats.appendChild(countSpan);
      const timeSpan = document.createElement('span');
      timeSpan.className = 'progress-time';
      timeSpan.textContent = formatTimeRemaining(progress?.estimatedTimeRemaining);
      stats.appendChild(timeSpan);
      container.appendChild(stats);
      
      if (onCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'progress-cancel';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => void onCancel());
        container.appendChild(cancelBtn);
      }
    } else if (state === 'error') {
      const icon = document.createElement('div');
      icon.className = 'progress-icon';
      icon.textContent = '❌';
      container.appendChild(icon);
      
      const title = document.createElement('div');
      title.className = 'progress-title';
      title.textContent = '翻譯失敗';
      container.appendChild(title);
      
      const errorMsg = document.createElement('div');
      errorMsg.className = 'error-message';
      errorMsg.textContent = error || '發生未知錯誤';
      container.appendChild(errorMsg);
      
      if (retryable) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-button';
        retryBtn.textContent = '重試';
        container.appendChild(retryBtn);
      }
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'progress-cancel';
      closeBtn.textContent = '關閉';
      closeBtn.addEventListener('click', () => {
        visible = false;
        el.remove();
      });
      container.appendChild(closeBtn);
    } else if (state === 'complete') {
      const icon = document.createElement('div');
      icon.className = 'progress-icon';
      icon.textContent = '✅';
      container.appendChild(icon);
      
      const title = document.createElement('div');
      title.className = 'progress-title';
      title.textContent = '翻譯完成！';
      container.appendChild(title);
      
      const subtitle = document.createElement('div');
      subtitle.className = 'progress-subtitle';
      subtitle.textContent = `已翻譯 ${progress?.totalCount ?? 0} 句字幕`;
      container.appendChild(subtitle);
      
      // Auto-hide after 2 seconds
      setTimeout(() => {
        visible = false;
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.3s ease';
        setTimeout(() => el.remove(), 300);
      }, 2000);
    }
    
    el.appendChild(container);
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
      
      // CSS is loaded via manifest.json content_scripts for Trusted Types compliance
      
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

      log.debug('Shown');
    },

    hide(): void {
      if (!visible) return;

      if (overlay) {
        overlay.remove();
        overlay = null;
      }

      visible = false;
      log.debug('Hidden');
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
