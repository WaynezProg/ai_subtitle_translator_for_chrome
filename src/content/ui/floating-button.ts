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
// Implementation
// ============================================================================
// Note: CSS is loaded via manifest.json content_scripts for Trusted Types compliance

export function createFloatingButton(options: FloatingButtonOptions): FloatingButton {
  const { onClick, platform } = options;
  let state: FloatingButtonState = options.state || 'idle';
  let progress = 0;
  let container: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let mounted = false;
  let isMinimized = false;

  /**
   * Create button elements using DOM APIs (no innerHTML for Trusted Types compliance)
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

    // Create icon span
    const iconSpan = document.createElement('span');
    iconSpan.className = 'floating-icon';
    iconSpan.textContent = config.icon;
    button.appendChild(iconSpan);

    // Create label span
    const labelSpan = document.createElement('span');
    labelSpan.className = 'floating-label';
    labelSpan.textContent = config.label;
    button.appendChild(labelSpan);

    // Create progress container
    const progressDiv = document.createElement('div');
    progressDiv.className = 'floating-progress';
    
    const progressBar = document.createElement('div');
    progressBar.className = 'floating-progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'floating-progress-fill';
    progressFill.style.width = '0%';
    progressBar.appendChild(progressFill);
    progressDiv.appendChild(progressBar);
    
    const progressText = document.createElement('span');
    progressText.className = 'floating-progress-text';
    progressText.textContent = '0%';
    progressDiv.appendChild(progressText);
    
    button.appendChild(progressDiv);

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'floating-close';
    closeBtn.title = '最小化';
    closeBtn.textContent = '✕';
    button.appendChild(closeBtn);

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

      // CSS is loaded via manifest.json content_scripts for Trusted Types compliance

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
