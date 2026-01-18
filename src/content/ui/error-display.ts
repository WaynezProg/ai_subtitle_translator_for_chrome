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
// Implementation
// ============================================================================
// Note: CSS is loaded via manifest.json content_scripts for Trusted Types compliance

let containerElement: HTMLDivElement | null = null;

/**
 * Initialize toast container
 * CSS is loaded via manifest.json content_scripts for Trusted Types compliance
 */
function ensureContainer(): HTMLDivElement {
  if (containerElement && document.body.contains(containerElement)) {
    return containerElement;
  }
  
  // Create container (CSS is loaded via manifest.json)
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
  
  // Create toast content using DOM APIs (Trusted Types compliance)
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = TYPE_ICONS[type];
  toast.appendChild(iconSpan);
  
  const contentSpan = document.createElement('span');
  contentSpan.className = 'toast-content';
  contentSpan.textContent = message;
  toast.appendChild(contentSpan);
  
  if (actionText) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'toast-action';
    actionBtn.textContent = actionText;
    if (onAction) {
      actionBtn.addEventListener('click', () => {
        onAction();
        removeToast(toast);
      });
    }
    toast.appendChild(actionBtn);
  }
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => removeToast(toast));
  toast.appendChild(closeBtn);
  
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
    while (containerElement.firstChild) {
      containerElement.removeChild(containerElement.firstChild);
    }
  }
}
