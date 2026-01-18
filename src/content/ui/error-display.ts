/**
 * Error Display Component
 * 
 * Displays user-friendly error messages as toast notifications.
 * 
 * @see FR-028, FR-030: Error Handling Requirements
 */

import type { ErrorCode } from '../../shared/types/translation';

// ============================================================================
// Types
// ============================================================================

export interface ToastOptions {
  /** Toast message */
  message: string;
  
  /** Toast type */
  type: 'error' | 'warning' | 'success' | 'info';
  
  /** Duration in milliseconds (0 = persistent) */
  duration?: number;
  
  /** Action button text */
  actionText?: string;
  
  /** Action button click handler */
  onAction?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const TOAST_CONTAINER_ID = 'ai-subtitle-toast-container';
const DEFAULT_DURATION = 5000;

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  RATE_LIMITED: '翻譯請求過於頻繁，請稍後再試',
  AUTH_FAILED: '認證失敗，請檢查您的帳號設定',
  AUTH_EXPIRED: '登入已過期，請重新登入',
  API_ERROR: '翻譯服務發生錯誤，請稍後再試',
  NETWORK_ERROR: '網路連線錯誤，請檢查您的網路',
  PARSE_ERROR: '無法解析字幕內容',
  TIMEOUT: '翻譯請求逾時，請稍後再試',
  UNSUPPORTED_FORMAT: '不支援此字幕格式',
  CACHE_ERROR: '快取讀取錯誤',
  CANCELLED: '翻譯已取消',
};

const TYPE_ICONS: Record<ToastOptions['type'], string> = {
  error: '❌',
  warning: '⚠️',
  success: '✅',
  info: 'ℹ️',
};

// ============================================================================
// Styles
// ============================================================================

const TOAST_STYLES = `
  #${TOAST_CONTAINER_ID} {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    font-family: system-ui, -apple-system, sans-serif;
  }
  
  .ai-subtitle-toast {
    background: #323232;
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 280px;
    max-width: 400px;
    animation: toastSlideIn 0.3s ease-out;
  }
  
  @keyframes toastSlideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  
  .ai-subtitle-toast.removing {
    animation: toastSlideOut 0.2s ease-in forwards;
  }
  
  @keyframes toastSlideOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }
  
  .ai-subtitle-toast.error {
    background: #d32f2f;
  }
  
  .ai-subtitle-toast.warning {
    background: #f57c00;
  }
  
  .ai-subtitle-toast.success {
    background: #388e3c;
  }
  
  .ai-subtitle-toast.info {
    background: #1976d2;
  }
  
  .ai-subtitle-toast .toast-icon {
    font-size: 18px;
    flex-shrink: 0;
  }
  
  .ai-subtitle-toast .toast-content {
    flex: 1;
    font-size: 14px;
    line-height: 1.4;
  }
  
  .ai-subtitle-toast .toast-action {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: #fff;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    transition: background 0.2s ease;
  }
  
  .ai-subtitle-toast .toast-action:hover {
    background: rgba(255, 255, 255, 0.3);
  }
  
  .ai-subtitle-toast .toast-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 4px;
    font-size: 16px;
    line-height: 1;
  }
  
  .ai-subtitle-toast .toast-close:hover {
    color: #fff;
  }
`;

// ============================================================================
// Implementation
// ============================================================================

let containerElement: HTMLDivElement | null = null;

/**
 * Initialize toast container
 */
function ensureContainer(): HTMLDivElement {
  if (containerElement && document.body.contains(containerElement)) {
    return containerElement;
  }
  
  // Inject styles
  const styleId = 'ai-subtitle-toast-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = TOAST_STYLES;
    document.head.appendChild(style);
  }
  
  // Create container
  containerElement = document.createElement('div');
  containerElement.id = TOAST_CONTAINER_ID;
  document.body.appendChild(containerElement);
  
  return containerElement;
}

/**
 * Show a toast notification
 */
export function showToast(options: ToastOptions): () => void {
  const container = ensureContainer();
  const { message, type, duration = DEFAULT_DURATION, actionText, onAction } = options;
  
  const toast = document.createElement('div');
  toast.className = `ai-subtitle-toast ${type}`;
  
  toast.innerHTML = `
    <span class="toast-icon">${TYPE_ICONS[type]}</span>
    <span class="toast-content">${message}</span>
    ${actionText ? `<button class="toast-action">${actionText}</button>` : ''}
    <button class="toast-close">×</button>
  `;
  
  // Bind events
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn?.addEventListener('click', () => removeToast(toast));
  
  if (actionText && onAction) {
    const actionBtn = toast.querySelector('.toast-action');
    actionBtn?.addEventListener('click', () => {
      onAction();
      removeToast(toast);
    });
  }
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  if (duration > 0) {
    timeoutId = setTimeout(() => removeToast(toast), duration);
  }
  
  // Return cleanup function
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
    removeToast(toast);
  };
}

/**
 * Remove a toast with animation
 */
function removeToast(toast: HTMLElement): void {
  if (!toast.parentNode) return;
  
  toast.classList.add('removing');
  setTimeout(() => toast.remove(), 200);
}

/**
 * Show an error toast for a given error code
 */
export function showErrorToast(
  code: ErrorCode,
  customMessage?: string,
  options?: Partial<ToastOptions>
): () => void {
  const message = customMessage || ERROR_MESSAGES[code] || '發生未知錯誤';
  
  return showToast({
    message,
    type: 'error',
    duration: 6000,
    ...options,
  });
}

/**
 * Show a success toast
 */
export function showSuccessToast(message: string, duration = 3000): () => void {
  return showToast({
    message,
    type: 'success',
    duration,
  });
}

/**
 * Show an info toast
 */
export function showInfoToast(message: string, duration = 4000): () => void {
  return showToast({
    message,
    type: 'info',
    duration,
  });
}

/**
 * Show a warning toast
 */
export function showWarningToast(message: string, duration = 5000): () => void {
  return showToast({
    message,
    type: 'warning',
    duration,
  });
}

/**
 * Clear all toasts
 */
export function clearAllToasts(): void {
  if (containerElement) {
    containerElement.innerHTML = '';
  }
}
