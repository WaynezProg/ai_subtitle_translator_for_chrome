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
// Styles
// ============================================================================

const COMMON_STYLES = `
  .${CONTAINER_CLASS} {
    display: inline-flex;
    align-items: center;
    position: relative;
  }
  
  #${BUTTON_ID} {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    border-radius: 4px;
    position: relative;
  }
  
  #${BUTTON_ID}:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  #${BUTTON_ID}:active {
    transform: scale(0.95);
  }
  
  #${BUTTON_ID} .btn-icon {
    font-size: 20px;
    line-height: 1;
  }
  
  #${BUTTON_ID} .btn-progress {
    position: absolute;
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 3px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
  }
  
  #${BUTTON_ID} .btn-progress-bar {
    height: 100%;
    background: #4CAF50;
    transition: width 0.3s ease;
    border-radius: 2px;
  }
  
  #${BUTTON_ID}[data-state="translating"] {
    animation: pulse 1.5s infinite;
  }
  
  #${BUTTON_ID}[data-state="error"] {
    color: #ff4444;
  }
  
  #${BUTTON_ID}[data-state="complete"],
  #${BUTTON_ID}[data-state="cached"] {
    color: #4CAF50;
  }
  
  #${BUTTON_ID}[data-state="local"] {
    color: #9C27B0;
  }
  
  #${BUTTON_ID} .local-indicator {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 8px;
    height: 8px;
    background: #9C27B0;
    border-radius: 50%;
    border: 1px solid #fff;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const YOUTUBE_STYLES = `
  ${COMMON_STYLES}
  
  .${CONTAINER_CLASS} {
    margin-left: 8px;
  }
  
  #${BUTTON_ID} {
    width: 36px;
    height: 36px;
    color: #fff;
  }
`;

// ============================================================================
// Implementation
// ============================================================================

export function createTranslateButton(options: TranslateButtonOptions): TranslateButton {
  const { onClick, platform } = options;
  let state: TranslateButtonState = options.state || 'idle';
  let progress = 0;
  let isLocalMode = false;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let mounted = false;
  
  /**
   * Create button elements
   */
  function createElements(): { container: HTMLDivElement; button: HTMLButtonElement } {
    const container = document.createElement('div');
    container.className = CONTAINER_CLASS;
    
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.dataset.state = state;
    button.title = STATE_TITLES[state];
    button.innerHTML = `
      <span class="btn-icon">${STATE_ICONS[state]}</span>
      <div class="btn-progress" style="display: none;">
        <div class="btn-progress-bar" style="width: 0%;"></div>
      </div>
      <span class="local-indicator" style="display: none;"></span>
    `;
    
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void onClick();
    });
    
    container.appendChild(button);
    return { container, button };
  }
  
  /**
   * Inject styles
   */
  function injectStyles(): void {
    const styleId = 'ai-subtitle-btn-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = platform === 'youtube' ? YOUTUBE_STYLES : COMMON_STYLES;
    document.head.appendChild(style);
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
      
      injectStyles();
      
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
