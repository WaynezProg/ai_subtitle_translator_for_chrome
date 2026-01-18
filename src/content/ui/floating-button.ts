/**
 * Floating Translate Button Component
 *
 * A more visible floating button that appears on the video player.
 * This provides better discoverability than the control bar button.
 */

// ============================================================================
// Types
// ============================================================================

export interface FloatingButtonOptions {
  /** Button click handler */
  onClick: () => void | Promise<void>;

  /** Platform for styling */
  platform: 'youtube' | 'netflix' | 'disney' | 'prime';

  /** Initial state */
  state?: FloatingButtonState;
}

export type FloatingButtonState =
  | 'idle'           // Ready to translate
  | 'translating'    // Translation in progress
  | 'complete'       // Translation complete
  | 'error'          // Translation failed
  | 'cached'         // Cached translation available
  | 'hidden';        // Manually hidden

export interface FloatingButton {
  /** Mount the button to the player */
  mount(): void;

  /** Unmount and cleanup */
  unmount(): void;

  /** Update button state */
  setState(state: FloatingButtonState): void;

  /** Update progress (0-100) */
  setProgress(percent: number): void;

  /** Show/hide button */
  setVisible(visible: boolean): void;

  /** Check if mounted */
  isMounted(): boolean;

  /** Minimize to small indicator */
  minimize(): void;

  /** Expand from minimized state */
  expand(): void;
}

// ============================================================================
// Constants
// ============================================================================

const BUTTON_ID = 'ai-subtitle-floating-btn';
const CONTAINER_ID = 'ai-subtitle-floating-container';

const STATE_CONFIG: Record<Exclude<FloatingButtonState, 'hidden'>, {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
}> = {
  idle: {
    icon: '🌐',
    label: '翻譯字幕',
    color: '#ffffff',
    bgColor: 'rgba(33, 150, 243, 0.95)',
  },
  translating: {
    icon: '⏳',
    label: '翻譯中...',
    color: '#ffffff',
    bgColor: 'rgba(255, 152, 0, 0.95)',
  },
  complete: {
    icon: '✅',
    label: '翻譯完成',
    color: '#ffffff',
    bgColor: 'rgba(76, 175, 80, 0.95)',
  },
  error: {
    icon: '❌',
    label: '翻譯失敗，點擊重試',
    color: '#ffffff',
    bgColor: 'rgba(244, 67, 54, 0.95)',
  },
  cached: {
    icon: '💾',
    label: '載入已翻譯字幕',
    color: '#ffffff',
    bgColor: 'rgba(156, 39, 176, 0.95)',
  },
};

// ============================================================================
// Styles
// ============================================================================

const FLOATING_STYLES = `
  #${CONTAINER_ID} {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 2147483640;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: auto;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  #${CONTAINER_ID}.minimized {
    top: 8px;
    right: 8px;
  }

  #${BUTTON_ID} {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 24px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #ffffff;
    background: rgba(33, 150, 243, 0.95);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  #${BUTTON_ID}:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.25);
  }

  #${BUTTON_ID}:active {
    transform: scale(0.98);
  }

  #${BUTTON_ID} .floating-icon {
    font-size: 18px;
    line-height: 1;
  }

  #${BUTTON_ID} .floating-label {
    font-size: 14px;
    font-weight: 500;
  }

  #${BUTTON_ID} .floating-progress {
    display: none;
    align-items: center;
    gap: 8px;
    margin-left: 4px;
  }

  #${BUTTON_ID} .floating-progress-bar {
    width: 60px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
  }

  #${BUTTON_ID} .floating-progress-fill {
    height: 100%;
    background: #ffffff;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  #${BUTTON_ID} .floating-progress-text {
    font-size: 12px;
    min-width: 36px;
    text-align: right;
  }

  #${BUTTON_ID}[data-state="translating"] .floating-progress {
    display: flex;
  }

  #${BUTTON_ID}[data-state="translating"] .floating-icon {
    animation: spin 1.5s linear infinite;
  }

  #${BUTTON_ID} .floating-close {
    display: none;
    margin-left: 4px;
    padding: 2px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    color: inherit;
    transition: background 0.2s;
  }

  #${BUTTON_ID}:hover .floating-close {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #${BUTTON_ID} .floating-close:hover {
    background: rgba(255, 255, 255, 0.4);
  }

  /* Minimized state */
  #${CONTAINER_ID}.minimized #${BUTTON_ID} {
    padding: 8px;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    justify-content: center;
  }

  #${CONTAINER_ID}.minimized #${BUTTON_ID} .floating-label,
  #${CONTAINER_ID}.minimized #${BUTTON_ID} .floating-progress,
  #${CONTAINER_ID}.minimized #${BUTTON_ID} .floating-close {
    display: none !important;
  }

  #${CONTAINER_ID}.minimized #${BUTTON_ID} .floating-icon {
    font-size: 20px;
  }

  /* Pulse animation for idle state to attract attention */
  #${BUTTON_ID}[data-state="idle"] {
    animation: attention-pulse 2s ease-in-out 3;
  }

  @keyframes attention-pulse {
    0%, 100% {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    50% {
      box-shadow: 0 4px 12px rgba(33, 150, 243, 0.6), 0 2px 4px rgba(33, 150, 243, 0.4), 0 0 20px rgba(33, 150, 243, 0.4);
    }
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    #${BUTTON_ID} {
      padding: 8px 12px;
      font-size: 12px;
    }

    #${BUTTON_ID} .floating-icon {
      font-size: 16px;
    }

    #${BUTTON_ID} .floating-progress-bar {
      width: 40px;
    }
  }
`;

// ============================================================================
// Implementation
// ============================================================================

export function createFloatingButton(options: FloatingButtonOptions): FloatingButton {
  const { onClick, platform } = options;
  let state: FloatingButtonState = options.state || 'idle';
  let progress = 0;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let mounted = false;
  let isMinimized = false;

  /**
   * Create button elements
   */
  function createElements(): { container: HTMLDivElement; button: HTMLButtonElement } {
    const container = document.createElement('div');
    container.id = CONTAINER_ID;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';

    const config = STATE_CONFIG[state === 'hidden' ? 'idle' : state];
    button.dataset.state = state;
    button.style.background = config.bgColor;
    button.title = config.label;

    button.innerHTML = `
      <span class="floating-icon">${config.icon}</span>
      <span class="floating-label">${config.label}</span>
      <div class="floating-progress">
        <div class="floating-progress-bar">
          <div class="floating-progress-fill" style="width: 0%;"></div>
        </div>
        <span class="floating-progress-text">0%</span>
      </div>
      <button class="floating-close" title="最小化">✕</button>
    `;

    // Main button click
    button.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('floating-close')) {
        e.preventDefault();
        e.stopPropagation();
        toggleMinimize();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // If minimized, expand first
      if (isMinimized) {
        toggleMinimize();
        return;
      }

      void onClick();
    });

    container.appendChild(button);
    return { container, button };
  }

  /**
   * Toggle minimize state
   */
  function toggleMinimize(): void {
    isMinimized = !isMinimized;
    if (container) {
      container.classList.toggle('minimized', isMinimized);
    }
  }

  /**
   * Inject styles
   */
  function injectStyles(): void {
    const styleId = 'ai-subtitle-floating-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = FLOATING_STYLES;
    document.head.appendChild(style);
  }

  /**
   * Find the video player container
   */
  function findPlayerContainer(): HTMLElement | null {
    const selectors: Record<string, string[]> = {
      youtube: ['.html5-video-player', '#movie_player', '.ytd-player'],
      netflix: ['.watch-video--player-view', '.VideoContainer'],
      disney: ['.btm-media-player', '.dss-hls-player'],
      prime: ['.atvwebplayersdk-overlays-container', '.webPlayerContainer'],
    };

    const platformSelectors = selectors[platform] || [];

    for (const selector of platformSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Ensure container has relative/absolute positioning
        const computed = getComputedStyle(element);
        if (computed.position === 'static') {
          (element as HTMLElement).style.position = 'relative';
        }
        return element as HTMLElement;
      }
    }

    // Fallback: find video element and use its parent
    const video = document.querySelector('video');
    if (video && video.parentElement) {
      const parent = video.parentElement;
      const computed = getComputedStyle(parent);
      if (computed.position === 'static') {
        parent.style.position = 'relative';
      }
      return parent;
    }

    return null;
  }

  /**
   * Update button display
   */
  function updateButton(): void {
    if (!button || state === 'hidden') return;

    const config = STATE_CONFIG[state];
    button.dataset.state = state;
    button.style.background = config.bgColor;
    button.title = config.label;

    const icon = button.querySelector('.floating-icon');
    if (icon) {
      icon.textContent = config.icon;
    }

    const label = button.querySelector('.floating-label');
    if (label) {
      label.textContent = state === 'translating' ? '翻譯中' : config.label;
    }

    const progressFill = button.querySelector('.floating-progress-fill') as HTMLElement | null;
    const progressText = button.querySelector('.floating-progress-text');

    if (progressFill && progressText) {
      progressFill.style.width = `${progress}%`;
      progressText.textContent = `${Math.round(progress)}%`;
    }
  }

  return {
    mount(): void {
      if (mounted) return;

      injectStyles();

      const playerContainer = findPlayerContainer();
      if (!playerContainer) {
        console.warn('[FloatingButton] Could not find player container');
        return;
      }

      // Check if already mounted
      const existing = document.getElementById(CONTAINER_ID);
      if (existing) {
        existing.remove();
      }

      const elements = createElements();
      container = elements.container;
      button = elements.button;

      playerContainer.appendChild(container);

      mounted = true;
      console.log('[FloatingButton] Mounted to', platform, 'player');
    },

    unmount(): void {
      if (!mounted) return;

      if (container) {
        container.remove();
        container = null;
        button = null;
      }

      mounted = false;
      console.log('[FloatingButton] Unmounted');
    },

    setState(newState: FloatingButtonState): void {
      state = newState;
      if (newState !== 'translating') {
        progress = 0;
      }

      if (container) {
        container.style.display = state === 'hidden' ? 'none' : 'block';
      }

      updateButton();

      // Auto-minimize after completion
      if (state === 'complete' && !isMinimized) {
        setTimeout(() => {
          if (state === 'complete') {
            isMinimized = true;
            if (container) {
              container.classList.add('minimized');
            }
          }
        }, 3000);
      }
    },

    setProgress(percent: number): void {
      progress = Math.max(0, Math.min(100, percent));
      updateButton();
    },

    setVisible(visible: boolean): void {
      if (container) {
        container.style.display = visible ? 'block' : 'none';
      }
    },

    isMounted(): boolean {
      return mounted;
    },

    minimize(): void {
      if (!isMinimized) {
        isMinimized = true;
        if (container) {
          container.classList.add('minimized');
        }
      }
    },

    expand(): void {
      if (isMinimized) {
        isMinimized = false;
        if (container) {
          container.classList.remove('minimized');
        }
      }
    },
  };
}
