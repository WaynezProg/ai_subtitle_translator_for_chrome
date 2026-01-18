/**
 * Translate Button Component
 * 
 * Injects a translate button into the video player controls.
 * Supports different platforms with platform-specific styling.
 * 
 * @see FR-024: Translate Button Requirements
 */

// ============================================================================
// Types
// ============================================================================

export interface TranslateButtonOptions {
  /** Button click handler */
  onClick: () => void | Promise<void>;
  
  /** Platform for styling */
  platform: 'youtube' | 'netflix' | 'disney' | 'prime';
  
  /** Initial state */
  state?: TranslateButtonState;
}

export type TranslateButtonState = 
  | 'idle'           // Ready to translate
  | 'translating'    // Translation in progress
  | 'complete'       // Translation complete
  | 'error'          // Translation failed
  | 'cached'         // Cached translation available
  | 'local';         // Using local Ollama model

export interface TranslateButton {
  /** Mount the button to the player */
  mount(): void;
  
  /** Unmount and cleanup */
  unmount(): void;
  
  /** Update button state */
  setState(state: TranslateButtonState): void;
  
  /** Update progress (0-100) */
  setProgress(percent: number): void;
  
  /** Show/hide button */
  setVisible(visible: boolean): void;
  
  /** Check if mounted */
  isMounted(): boolean;
  
  /** Show/hide local model indicator */
  setLocalMode(isLocal: boolean): void;
}

// ============================================================================
// Constants
// ============================================================================

const BUTTON_ID = 'ai-subtitle-translate-btn';
const CONTAINER_CLASS = 'ai-subtitle-btn-container';

const STATE_ICONS: Record<TranslateButtonState, string> = {
  idle: '🌐',
  translating: '⏳',
  complete: '✅',
  error: '❌',
  cached: '💾',
  local: '🏠',
};

const STATE_TITLES: Record<TranslateButtonState, string> = {
  idle: '翻譯字幕',
  translating: '翻譯中...',
  complete: '翻譯完成',
  error: '翻譯失敗',
  cached: '已有快取翻譯',
  local: '使用本地模型翻譯',
};

// ============================================================================
// Implementation
// ============================================================================
// Note: CSS is loaded via manifest.json content_scripts for Trusted Types compliance

export function createTranslateButton(options: TranslateButtonOptions): TranslateButton {
  const { onClick, platform } = options;
  let state: TranslateButtonState = options.state || 'idle';
  let progress = 0;
  let isLocalMode = false;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let mounted = false;
  
  /**
   * Create button elements using DOM APIs (no innerHTML for Trusted Types compliance)
   */
  function createElements(): { container: HTMLDivElement; button: HTMLButtonElement } {
    const container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.dataset.state = state;
    button.title = STATE_TITLES[state];
    
    // Create icon span
    const iconSpan = document.createElement('span');
    iconSpan.className = 'btn-icon';
    iconSpan.textContent = STATE_ICONS[state];
    button.appendChild(iconSpan);
    
    // Create progress container
    const progressDiv = document.createElement('div');
    progressDiv.className = 'btn-progress';
    progressDiv.style.display = 'none';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'btn-progress-bar';
    progressBar.style.width = '0%';
    progressDiv.appendChild(progressBar);
    
    button.appendChild(progressDiv);
    
    // Create local indicator
    const localIndicator = document.createElement('span');
    localIndicator.className = 'local-indicator';
    localIndicator.style.display = 'none';
    button.appendChild(localIndicator);
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void onClick();
    });
    
    container.appendChild(button);
    return { container, button };
  }
  
  /**
   * Find the player controls container
   */
  function findControlsContainer(): HTMLElement | null {
    switch (platform) {
      case 'youtube':
        // YouTube player controls (right side)
        return document.querySelector('.ytp-right-controls');
      
      case 'netflix':
        // Netflix controls
        return document.querySelector('.PlayerControlsNeo__button-control-row');
      
      case 'disney':
        // Disney+ controls
        return document.querySelector('.btm-media-player-controls');
      
      case 'prime':
        // Prime Video controls
        return document.querySelector('.atvwebplayersdk-control-row-button-controls');
      
      default:
        return null;
    }
  }
  
  /**
   * Update button display
   */
  function updateButton(): void {
    if (!button) return;
    
    button.dataset.state = state;
    button.title = STATE_TITLES[state];
    
    const icon = button.querySelector('.btn-icon');
    if (icon) {
      icon.textContent = STATE_ICONS[state];
    }
    
    const progressBar = button.querySelector('.btn-progress') as HTMLElement | null;
    const progressFill = button.querySelector('.btn-progress-bar') as HTMLElement | null;
    
    if (progressBar && progressFill) {
      if (state === 'translating' && progress > 0) {
        progressBar.style.display = 'block';
        progressFill.style.width = `${progress}%`;
      } else {
        progressBar.style.display = 'none';
      }
    }
    
    // Update local indicator
    const localIndicator = button.querySelector('.local-indicator') as HTMLElement | null;
    if (localIndicator) {
      localIndicator.style.display = isLocalMode ? 'block' : 'none';
    }
  }
  
  return {
    mount(): void {
      if (mounted) return;
      
      // CSS is loaded via manifest.json content_scripts for Trusted Types compliance
      
      const controlsContainer = findControlsContainer();
      if (!controlsContainer) {
        console.warn('[TranslateButton] Could not find player controls');
        return;
      }
      
      // Check if already mounted
      const existing = document.getElementById(BUTTON_ID);
      if (existing) {
        existing.remove();
      }
      
      const elements = createElements();
      container = elements.container;
      button = elements.button;
      
      // Insert at the beginning of controls (left side of right controls)
      if (platform === 'youtube') {
        controlsContainer.insertBefore(container, controlsContainer.firstChild);
      } else {
        controlsContainer.appendChild(container);
      }
      
      mounted = true;
      console.log('[TranslateButton] Mounted');
    },
    
    unmount(): void {
      if (!mounted) return;
      
      if (container) {
        container.remove();
        container = null;
        button = null;
      }
      
      mounted = false;
      console.log('[TranslateButton] Unmounted');
    },
    
    setState(newState: TranslateButtonState): void {
      state = newState;
      if (newState !== 'translating') {
        progress = 0;
      }
      updateButton();
    },
    
    setProgress(percent: number): void {
      progress = Math.max(0, Math.min(100, percent));
      updateButton();
    },
    
    setVisible(visible: boolean): void {
      if (container) {
        container.style.display = visible ? 'inline-flex' : 'none';
      }
    },
    
    isMounted(): boolean {
      return mounted;
    },
    
    setLocalMode(isLocal: boolean): void {
      isLocalMode = isLocal;
      updateButton();
    },
  };
}
