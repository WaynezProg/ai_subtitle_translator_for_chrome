/**
 * Subtitle Renderer
 * 
 * Renders translated subtitles as an overlay on the video player.
 * Handles time synchronization, styling, and bilingual display.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/platform-adapter.md
 */

import type { Cue } from '../shared/types/subtitle';
import type { RenderOptions } from './adapters/types';
import { DEFAULT_RENDER_OPTIONS } from './adapters/types';

// ============================================================================
// Constants
// ============================================================================

const SUBTITLE_CONTAINER_ID = 'ai-subtitle-translator-container';
const SUBTITLE_TEXT_CLASS = 'ai-subtitle-text';
const SUBTITLE_ORIGINAL_CLASS = 'ai-subtitle-original';
const SUBTITLE_TRANSLATION_CLASS = 'ai-subtitle-translation';

// ============================================================================
// Subtitle Renderer Interface
// ============================================================================

export interface SubtitleRenderer {
  /**
   * Initialize renderer with video element
   */
  attach(video: HTMLVideoElement): void;
  
  /**
   * Set subtitles to render
   */
  setSubtitles(cues: Cue[], options?: Partial<RenderOptions>): void;
  
  /**
   * Update render options without reloading subtitles
   */
  updateOptions(options: Partial<RenderOptions>): void;
  
  /**
   * Show/hide subtitles
   */
  setVisible(visible: boolean): void;
  
  /**
   * Get current visibility state
   */
  isVisible(): boolean;
  
  /**
   * Get current time from video
   */
  getCurrentTime(): number;
  
  /**
   * Clean up and remove from DOM
   */
  detach(): void;
}

// ============================================================================
// Subtitle Renderer Implementation
// ============================================================================

/**
 * Creates a SubtitleRenderer instance
 */
export function createSubtitleRenderer(): SubtitleRenderer {
  let video: HTMLVideoElement | null = null;
  let container: HTMLDivElement | null = null;
  let cues: Cue[] = [];
  let options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };
  let visible = true;
  let animationFrameId: number | null = null;
  let currentCueIndex = -1;
  
  /**
   * Create the subtitle container element
   */
  function createContainer(): HTMLDivElement {
    const existingContainer = document.getElementById(SUBTITLE_CONTAINER_ID);
    if (existingContainer) {
      existingContainer.remove();
    }
    
    const container = document.createElement('div');
    container.id = SUBTITLE_CONTAINER_ID;
    applyContainerStyles(container);
    return container;
  }
  
  /**
   * Apply styles to the container based on options
   */
  function applyContainerStyles(container: HTMLDivElement): void {
    container.style.cssText = `
      position: absolute;
      left: 0;
      right: 0;
      ${options.position === 'bottom' ? 'bottom: 10%' : 'top: 10%'};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 2147483647;
      font-family: ${options.fontFamily};
      font-size: ${options.fontSize}px;
      line-height: 1.4;
      text-align: center;
      transition: opacity 0.1s ease-in-out;
      opacity: ${visible ? '1' : '0'};
    `;
  }
  
  /**
   * Get text style based on background option
   */
  function getTextStyle(): string {
    const baseStyle = `
      max-width: 90%;
      padding: 4px 8px;
      margin: 2px 0;
      color: #ffffff;
      word-wrap: break-word;
      white-space: pre-wrap;
    `;
    
    switch (options.background) {
      case 'none':
        return baseStyle;
      case 'shadow':
        return `${baseStyle}
          text-shadow: 
            -1px -1px 2px rgba(0, 0, 0, 0.9),
            1px -1px 2px rgba(0, 0, 0, 0.9),
            -1px 1px 2px rgba(0, 0, 0, 0.9),
            1px 1px 2px rgba(0, 0, 0, 0.9),
            0 0 4px rgba(0, 0, 0, 0.8);
        `;
      case 'box':
        return `${baseStyle}
          background-color: rgba(0, 0, 0, 0.75);
          border-radius: 4px;
        `;
      default:
        return baseStyle;
    }
  }
  
  /**
   * Find the active cue at the given time
   *
   * Uses intelligent gap handling to prevent subtitle flickering:
   * - Short gaps (≤1000ms): Extend previous cue for up to 500ms
   * - Medium gaps (1000-2000ms): Extend previous cue for up to 300ms
   * - Long gaps (>2000ms): No extension (intentional pause)
   */
  function findActiveCue(time: number): Cue | null {
    // Binary search for efficiency with many cues
    let left = 0;
    let right = cues.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cue = cues[mid];

      if (time >= cue.startTime && time < cue.endTime) {
        return cue;
      }

      if (time < cue.startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    // No exact match found - check for gap handling
    // Find the cue just before the current time
    for (let i = 0; i < cues.length - 1; i++) {
      const currentCue = cues[i];
      const nextCue = cues[i + 1];
      const gapStart = currentCue.endTime;
      const gapEnd = nextCue.startTime;

      // Check if time is in the gap between two cues
      if (time >= gapStart && time < gapEnd) {
        const gapDuration = gapEnd - gapStart;
        const timeIntoGap = time - gapStart;

        // Determine grace period based on gap duration
        let gracePeriod: number;
        if (gapDuration <= 1000) {
          gracePeriod = 500;  // Short gap: extend 500ms
        } else if (gapDuration <= 2000) {
          gracePeriod = 300;  // Medium gap: extend 300ms
        } else {
          gracePeriod = 0;    // Long gap: no extension
        }

        // If within grace period, return the previous cue
        if (gracePeriod > 0 && timeIntoGap <= gracePeriod) {
          return currentCue;
        }
        break;
      }
    }

    return null;
  }
  
  /**
   * Clear all children from a container (Trusted Types compliant)
   */
  function clearChildren(element: HTMLElement): void {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Render a cue to the container
   *
   * Cue structure:
   * - cue.text: Original text
   * - cue.translatedText: Translated text (optional)
   *
   * In bilingual mode, we show both original and translated.
   * In single mode, we show translatedText if available, otherwise original text.
   */
  function renderCue(cue: Cue | null): void {
    if (!container) return;

    // Clear existing content (Trusted Types compliant - no innerHTML)
    clearChildren(container);

    if (!cue) {
      return;
    }
    
    const textStyle = getTextStyle();
    
    // Determine what text to show
    const originalText = cue.text;
    const translatedText = cue.translatedText;
    
    if (options.bilingual && translatedText) {
      // Bilingual mode - show both original and translation
      const originalLine = document.createElement('div');
      originalLine.className = `${SUBTITLE_TEXT_CLASS} ${SUBTITLE_ORIGINAL_CLASS}`;
      originalLine.style.cssText = `${textStyle} font-size: ${options.fontSize * 0.85}px; opacity: 0.85;`;
      originalLine.textContent = originalText;
      
      const translationLine = document.createElement('div');
      translationLine.className = `${SUBTITLE_TEXT_CLASS} ${SUBTITLE_TRANSLATION_CLASS}`;
      translationLine.style.cssText = textStyle;
      translationLine.textContent = translatedText;
      
      if (options.bilingualOrder === 'original-first') {
        container.appendChild(originalLine);
        container.appendChild(translationLine);
      } else {
        container.appendChild(translationLine);
        container.appendChild(originalLine);
      }
    } else {
      // Single line mode - show translation if available, otherwise original
      const textLine = document.createElement('div');
      textLine.className = SUBTITLE_TEXT_CLASS;
      textLine.style.cssText = textStyle;
      textLine.textContent = translatedText || originalText;
      container.appendChild(textLine);
    }
  }
  
  /**
   * Update loop for time synchronization
   */
  function updateLoop(): void {
    if (!video || !container || !visible) {
      animationFrameId = requestAnimationFrame(updateLoop);
      return;
    }
    
    const currentTime = video.currentTime;
    const activeCue = findActiveCue(currentTime);
    const newIndex = activeCue ? cues.indexOf(activeCue) : -1;
    
    // Only re-render if cue changed
    if (newIndex !== currentCueIndex) {
      currentCueIndex = newIndex;
      renderCue(activeCue);
    }
    
    animationFrameId = requestAnimationFrame(updateLoop);
  }
  
  /**
   * Position container relative to video
   */
  function positionContainer(): void {
    if (!video || !container) return;
    
    const parent = video.parentElement;
    
    if (parent && getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    
    // Ensure container is in the video's parent
    if (container.parentElement !== parent) {
      parent?.appendChild(container);
    }
  }
  
  // Return the renderer interface
  return {
    attach(videoElement: HTMLVideoElement): void {
      if (video === videoElement) {
        return;
      }
      
      // Detach from previous video if any
      this.detach();
      
      video = videoElement;
      container = createContainer();
      
      // Position and attach container
      positionContainer();
      
      // Start update loop
      animationFrameId = requestAnimationFrame(updateLoop);
      
      // Listen for video resize
      const resizeObserver = new ResizeObserver(() => {
        positionContainer();
      });
      resizeObserver.observe(video);
      
      console.log('[SubtitleRenderer] Attached to video element');
    },
    
    setSubtitles(newCues: Cue[], newOptions?: Partial<RenderOptions>): void {
      // Sort cues by start time for binary search
      cues = [...newCues].sort((a, b) => a.startTime - b.startTime);
      
      if (newOptions) {
        options = { ...options, ...newOptions };
        if (container) {
          applyContainerStyles(container);
        }
      }
      
      // Reset current cue to force re-render
      currentCueIndex = -1;
      
      console.log(`[SubtitleRenderer] Set ${cues.length} cues`);
    },
    
    updateOptions(newOptions: Partial<RenderOptions>): void {
      options = { ...options, ...newOptions };
      
      if (container) {
        applyContainerStyles(container);
        // Force re-render current cue with new styles
        const prevIndex = currentCueIndex;
        currentCueIndex = -1;
        if (prevIndex >= 0 && prevIndex < cues.length) {
          renderCue(cues[prevIndex]);
          currentCueIndex = prevIndex;
        }
      }
    },
    
    setVisible(isVisible: boolean): void {
      visible = isVisible;
      
      if (container) {
        container.style.opacity = visible ? '1' : '0';
      }
    },
    
    isVisible(): boolean {
      return visible;
    },
    
    getCurrentTime(): number {
      return video?.currentTime ?? 0;
    },
    
    detach(): void {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      if (container) {
        container.remove();
        container = null;
      }
      
      video = null;
      cues = [];
      currentCueIndex = -1;
      
      console.log('[SubtitleRenderer] Detached');
    },
  };
}

// ============================================================================
// Export Default Instance
// ============================================================================

/**
 * Default subtitle renderer instance
 */
export const subtitleRenderer = createSubtitleRenderer();
