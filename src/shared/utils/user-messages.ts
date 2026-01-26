/**
 * User-Facing Messages Utility
 *
 * Provides localized, user-friendly messages for the extension UI.
 * Supports both Traditional Chinese (default) and English.
 *
 * Features:
 * - Localized error messages
 * - Status messages
 * - Action suggestions
 * - Progress messages
 */

import { ErrorCodes } from './error-handler';

// ============================================================================
// Types
// ============================================================================

export type SupportedLocale = 'zh-TW' | 'en';

export interface LocalizedMessage {
  title: string;
  description: string;
  suggestions?: string[];
}

export interface StatusMessage {
  status: 'idle' | 'loading' | 'success' | 'error' | 'warning';
  message: string;
}

// ============================================================================
// Error Messages
// ============================================================================

const ERROR_MESSAGES_ZH_TW: Record<string, LocalizedMessage> = {
  // Network errors
  [ErrorCodes.NETWORK_OFFLINE]: {
    title: '網路離線',
    description: '無法連線到網路。請檢查您的網路連線後再試一次。',
    suggestions: ['檢查 Wi-Fi 或網路連線', '稍後再試'],
  },
  [ErrorCodes.NETWORK_TIMEOUT]: {
    title: '連線逾時',
    description: '伺服器回應時間過長，請稍後再試。',
    suggestions: ['檢查網路速度', '重新整理頁面後再試'],
  },
  [ErrorCodes.NETWORK_ERROR]: {
    title: '網路錯誤',
    description: '發生網路連線問題，請稍後再試。',
    suggestions: ['檢查網路連線', '重新整理頁面'],
  },

  // Auth errors
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: {
    title: 'API 金鑰無效',
    description: '您的 API 金鑰無效或已過期。請到設定頁面更新您的金鑰。',
    suggestions: ['前往設定頁面檢查 API 金鑰', '確認金鑰是否正確複製'],
  },
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: {
    title: '登入已過期',
    description: '您的登入已過期，請重新登入。',
    suggestions: ['重新登入您的帳號'],
  },
  [ErrorCodes.AUTH_UNAUTHORIZED]: {
    title: '存取被拒',
    description: '您沒有權限使用此功能。請確認您的憑證設定。',
    suggestions: ['檢查 API 金鑰權限', '確認帳號設定'],
  },
  [ErrorCodes.AUTH_RATE_LIMITED]: {
    title: '請求過於頻繁',
    description: '您的請求次數已達上限。請稍候再試。',
    suggestions: ['等待幾分鐘後再試', '考慮升級 API 方案'],
  },

  // Provider errors
  [ErrorCodes.PROVIDER_NOT_CONFIGURED]: {
    title: '翻譯服務未設定',
    description: '請先設定翻譯服務提供者。',
    suggestions: ['前往設定頁面選擇翻譯服務', '設定 API 金鑰'],
  },
  [ErrorCodes.PROVIDER_UNAVAILABLE]: {
    title: '翻譯服務暫時無法使用',
    description: '翻譯服務目前無法使用，請稍後再試。',
    suggestions: ['稍後再試', '嘗試其他翻譯服務'],
  },
  [ErrorCodes.PROVIDER_QUOTA_EXCEEDED]: {
    title: 'API 配額已用完',
    description: '您的 API 使用量已達上限。',
    suggestions: ['檢查 API 用量', '等待配額重置', '升級 API 方案'],
  },
  [ErrorCodes.PROVIDER_INVALID_RESPONSE]: {
    title: '回應格式錯誤',
    description: '翻譯服務回傳了無效的回應。',
    suggestions: ['重試翻譯', '嘗試其他翻譯服務'],
  },
  [ErrorCodes.PROVIDER_TRANSLATION_FAILED]: {
    title: '翻譯失敗',
    description: '無法完成翻譯，請再試一次。',
    suggestions: ['重試翻譯', '檢查網路連線'],
  },

  // Platform errors
  [ErrorCodes.PLATFORM_NOT_SUPPORTED]: {
    title: '不支援此平台',
    description: '目前不支援此影片平台。',
    suggestions: ['在支援的平台上使用此擴充功能'],
  },
  [ErrorCodes.PLATFORM_VIDEO_NOT_FOUND]: {
    title: '找不到影片',
    description: '無法偵測到影片元素。請重新整理頁面。',
    suggestions: ['重新整理頁面', '確認影片已載入'],
  },
  [ErrorCodes.PLATFORM_SUBTITLE_NOT_FOUND]: {
    title: '找不到字幕',
    description: '此影片沒有可用的字幕。',
    suggestions: ['確認影片是否有字幕', '嘗試其他影片'],
  },
  [ErrorCodes.PLATFORM_INJECTION_FAILED]: {
    title: '字幕顯示失敗',
    description: '無法在影片上顯示翻譯字幕。',
    suggestions: ['重新整理頁面', '檢查擴充功能是否有更新'],
  },
  [ErrorCodes.PLATFORM_UPDATED]: {
    title: '平台可能已更新',
    description: '影片平台可能已更新，擴充功能可能需要更新。',
    suggestions: ['檢查擴充功能更新', '回報此問題'],
  },

  // Cache errors
  [ErrorCodes.CACHE_READ_ERROR]: {
    title: '讀取快取失敗',
    description: '無法讀取已儲存的翻譯。',
    suggestions: ['清除快取後重試'],
  },
  [ErrorCodes.CACHE_WRITE_ERROR]: {
    title: '儲存快取失敗',
    description: '無法儲存翻譯結果。',
    suggestions: ['檢查瀏覽器儲存空間'],
  },
  [ErrorCodes.CACHE_QUOTA_EXCEEDED]: {
    title: '儲存空間不足',
    description: '快取儲存空間已滿。',
    suggestions: ['清除部分快取', '刪除舊的翻譯記錄'],
  },

  // Parse errors
  [ErrorCodes.PARSE_INVALID_FORMAT]: {
    title: '字幕格式錯誤',
    description: '無法解析字幕檔案格式。',
    suggestions: ['確認字幕格式是否正確', '嘗試其他字幕來源'],
  },
  [ErrorCodes.PARSE_EMPTY_CONTENT]: {
    title: '字幕內容為空',
    description: '字幕檔案沒有內容。',
    suggestions: ['確認影片是否有字幕'],
  },
  [ErrorCodes.PARSE_ENCODING_ERROR]: {
    title: '編碼錯誤',
    description: '字幕檔案編碼無法辨識。',
    suggestions: ['嘗試不同的字幕來源'],
  },

  // Validation errors
  [ErrorCodes.VALIDATION_REQUIRED_FIELD]: {
    title: '必填欄位缺失',
    description: '缺少必要的欄位，請確認所有必填項目都已填寫。',
    suggestions: ['檢查所有必填欄位'],
  },
  [ErrorCodes.VALIDATION_INVALID_VALUE]: {
    title: '無效的值',
    description: '輸入的值無效，請確認輸入正確。',
    suggestions: ['確認輸入格式是否正確'],
  },

  // Ollama specific
  [ErrorCodes.OLLAMA_NOT_RUNNING]: {
    title: 'Ollama 未啟動',
    description: 'Ollama 服務未執行。請先啟動 Ollama。',
    suggestions: ['執行 "ollama serve" 啟動服務', '確認 Ollama 已安裝'],
  },
  [ErrorCodes.OLLAMA_MODEL_NOT_FOUND]: {
    title: '找不到模型',
    description: '指定的 Ollama 模型尚未下載。',
    suggestions: ['執行 "ollama pull <模型名稱>" 下載模型'],
  },
  [ErrorCodes.OLLAMA_TIMEOUT]: {
    title: 'Ollama 連線逾時',
    description: 'Ollama 連線逾時，請確認服務是否正常執行。',
    suggestions: ['確認 Ollama 服務正在執行', '檢查系統資源'],
  },

  // Generic
  [ErrorCodes.UNKNOWN_ERROR]: {
    title: '發生錯誤',
    description: '發生未知錯誤，請稍後再試。',
    suggestions: ['重新整理頁面', '稍後再試'],
  },
  [ErrorCodes.OPERATION_CANCELLED]: {
    title: '操作已取消',
    description: '翻譯操作已被取消。',
    suggestions: [],
  },
};

const ERROR_MESSAGES_EN: Record<string, LocalizedMessage> = {
  // Network errors
  [ErrorCodes.NETWORK_OFFLINE]: {
    title: 'Offline',
    description: 'No internet connection. Please check your network and try again.',
    suggestions: ['Check your Wi-Fi or network connection', 'Try again later'],
  },
  [ErrorCodes.NETWORK_TIMEOUT]: {
    title: 'Connection Timeout',
    description: 'The server took too long to respond. Please try again.',
    suggestions: ['Check your network speed', 'Refresh the page and try again'],
  },
  [ErrorCodes.NETWORK_ERROR]: {
    title: 'Network Error',
    description: 'A network error occurred. Please try again.',
    suggestions: ['Check your network connection', 'Refresh the page'],
  },

  // Auth errors
  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: {
    title: 'Invalid API Key',
    description: 'Your API key is invalid or expired. Please update it in settings.',
    suggestions: ['Check your API key in settings', 'Verify the key was copied correctly'],
  },
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again.',
    suggestions: ['Sign in again'],
  },
  [ErrorCodes.AUTH_UNAUTHORIZED]: {
    title: 'Access Denied',
    description: 'You do not have permission to use this feature.',
    suggestions: ['Check API key permissions', 'Verify account settings'],
  },
  [ErrorCodes.AUTH_RATE_LIMITED]: {
    title: 'Too Many Requests',
    description: 'You have made too many requests. Please wait and try again.',
    suggestions: ['Wait a few minutes before trying again', 'Consider upgrading your API plan'],
  },

  // Provider errors
  [ErrorCodes.PROVIDER_NOT_CONFIGURED]: {
    title: 'Provider Not Configured',
    description: 'Please configure a translation provider first.',
    suggestions: ['Go to settings to select a translation provider', 'Set up your API key'],
  },
  [ErrorCodes.PROVIDER_UNAVAILABLE]: {
    title: 'Service Unavailable',
    description: 'The translation service is temporarily unavailable.',
    suggestions: ['Try again later', 'Try a different translation provider'],
  },
  [ErrorCodes.PROVIDER_QUOTA_EXCEEDED]: {
    title: 'API Quota Exceeded',
    description: 'Your API usage limit has been reached.',
    suggestions: ['Check your API usage', 'Wait for quota reset', 'Upgrade your API plan'],
  },
  [ErrorCodes.PROVIDER_INVALID_RESPONSE]: {
    title: 'Invalid Response',
    description: 'The translation service returned an invalid response.',
    suggestions: ['Retry the translation', 'Try a different provider'],
  },
  [ErrorCodes.PROVIDER_TRANSLATION_FAILED]: {
    title: 'Translation Failed',
    description: 'Could not complete the translation. Please try again.',
    suggestions: ['Retry the translation', 'Check your network connection'],
  },

  // Platform errors
  [ErrorCodes.PLATFORM_NOT_SUPPORTED]: {
    title: 'Platform Not Supported',
    description: 'This video platform is not currently supported.',
    suggestions: ['Use the extension on a supported platform'],
  },
  [ErrorCodes.PLATFORM_VIDEO_NOT_FOUND]: {
    title: 'Video Not Found',
    description: 'Could not detect the video element. Please refresh the page.',
    suggestions: ['Refresh the page', 'Make sure the video is loaded'],
  },
  [ErrorCodes.PLATFORM_SUBTITLE_NOT_FOUND]: {
    title: 'Subtitles Not Found',
    description: 'No subtitles are available for this video.',
    suggestions: ['Check if the video has subtitles', 'Try a different video'],
  },
  [ErrorCodes.PLATFORM_INJECTION_FAILED]: {
    title: 'Display Failed',
    description: 'Could not display translated subtitles on the video.',
    suggestions: ['Refresh the page', 'Check for extension updates'],
  },
  [ErrorCodes.PLATFORM_UPDATED]: {
    title: 'Platform May Have Changed',
    description: 'The video platform may have been updated. Extension update may be required.',
    suggestions: ['Check for extension updates', 'Report this issue'],
  },

  // Cache errors
  [ErrorCodes.CACHE_READ_ERROR]: {
    title: 'Cache Read Error',
    description: 'Could not read cached translations.',
    suggestions: ['Clear cache and try again'],
  },
  [ErrorCodes.CACHE_WRITE_ERROR]: {
    title: 'Cache Write Error',
    description: 'Could not save translation results.',
    suggestions: ['Check browser storage space'],
  },
  [ErrorCodes.CACHE_QUOTA_EXCEEDED]: {
    title: 'Storage Full',
    description: 'Cache storage is full.',
    suggestions: ['Clear some cached translations', 'Delete old translation records'],
  },

  // Parse errors
  [ErrorCodes.PARSE_INVALID_FORMAT]: {
    title: 'Invalid Format',
    description: 'Could not parse the subtitle format.',
    suggestions: ['Check if the subtitle format is correct', 'Try a different subtitle source'],
  },
  [ErrorCodes.PARSE_EMPTY_CONTENT]: {
    title: 'Empty Content',
    description: 'The subtitle file is empty.',
    suggestions: ['Check if the video has subtitles'],
  },
  [ErrorCodes.PARSE_ENCODING_ERROR]: {
    title: 'Encoding Error',
    description: 'Could not recognize the subtitle encoding.',
    suggestions: ['Try a different subtitle source'],
  },

  // Validation errors
  [ErrorCodes.VALIDATION_REQUIRED_FIELD]: {
    title: 'Required Field Missing',
    description: 'A required field is missing. Please ensure all required fields are filled in.',
    suggestions: ['Check all required fields'],
  },
  [ErrorCodes.VALIDATION_INVALID_VALUE]: {
    title: 'Invalid Value',
    description: 'The provided value is invalid. Please verify your input.',
    suggestions: ['Check the input format'],
  },

  // Ollama specific
  [ErrorCodes.OLLAMA_NOT_RUNNING]: {
    title: 'Ollama Not Running',
    description: 'Ollama service is not running. Please start Ollama first.',
    suggestions: ['Run "ollama serve" to start the service', 'Verify Ollama is installed'],
  },
  [ErrorCodes.OLLAMA_MODEL_NOT_FOUND]: {
    title: 'Model Not Found',
    description: 'The specified Ollama model has not been downloaded.',
    suggestions: ['Run "ollama pull <model-name>" to download the model'],
  },
  [ErrorCodes.OLLAMA_TIMEOUT]: {
    title: 'Ollama Timeout',
    description: 'Connection to Ollama timed out.',
    suggestions: ['Verify Ollama service is running', 'Check system resources'],
  },

  // Generic
  [ErrorCodes.UNKNOWN_ERROR]: {
    title: 'Error Occurred',
    description: 'An unexpected error occurred. Please try again.',
    suggestions: ['Refresh the page', 'Try again later'],
  },
  [ErrorCodes.OPERATION_CANCELLED]: {
    title: 'Operation Cancelled',
    description: 'The translation was cancelled.',
    suggestions: [],
  },
};

// ============================================================================
// Status Messages
// ============================================================================

const STATUS_MESSAGES_ZH_TW: Record<string, string> = {
  // Translation status
  translating: '翻譯中...',
  translating_chunk: '翻譯中 ({current}/{total})...',
  translation_complete: '翻譯完成',
  translation_cached: '已從快取載入翻譯',
  translation_cancelled: '翻譯已取消',
  translation_queued: '已加入重試佇列',

  // Subtitle status
  subtitle_loading: '載入字幕中...',
  subtitle_ready: '字幕已就緒',
  subtitle_not_found: '找不到字幕',
  subtitle_uploaded: '字幕上傳成功',

  // Provider status
  provider_connecting: '連線至翻譯服務...',
  provider_connected: '已連線',
  provider_disconnected: '已斷線',

  // Network status
  network_online: '網路已連線',
  network_offline: '網路已離線',
  network_slow: '網路連線緩慢',

  // Cache status
  cache_saved: '已儲存至快取',
  cache_cleared: '快取已清除',

  // General
  loading: '載入中...',
  ready: '就緒',
  error: '發生錯誤',
  retry: '重試中...',
  success: '成功',
};

const STATUS_MESSAGES_EN: Record<string, string> = {
  // Translation status
  translating: 'Translating...',
  translating_chunk: 'Translating ({current}/{total})...',
  translation_complete: 'Translation complete',
  translation_cached: 'Loaded translation from cache',
  translation_cancelled: 'Translation cancelled',
  translation_queued: 'Added to retry queue',

  // Subtitle status
  subtitle_loading: 'Loading subtitles...',
  subtitle_ready: 'Subtitles ready',
  subtitle_not_found: 'Subtitles not found',
  subtitle_uploaded: 'Subtitle uploaded successfully',

  // Provider status
  provider_connecting: 'Connecting to translation service...',
  provider_connected: 'Connected',
  provider_disconnected: 'Disconnected',

  // Network status
  network_online: 'Network connected',
  network_offline: 'Network offline',
  network_slow: 'Slow network connection',

  // Cache status
  cache_saved: 'Saved to cache',
  cache_cleared: 'Cache cleared',

  // General
  loading: 'Loading...',
  ready: 'Ready',
  error: 'Error occurred',
  retry: 'Retrying...',
  success: 'Success',
};

// ============================================================================
// Message Functions
// ============================================================================

let currentLocale: SupportedLocale = 'zh-TW';

/**
 * Set the current locale
 */
export function setLocale(locale: SupportedLocale): void {
  currentLocale = locale;
}

/**
 * Get the current locale
 */
export function getLocale(): SupportedLocale {
  return currentLocale;
}

/**
 * Get localized error message
 */
export function getErrorMessage(code: string, locale?: SupportedLocale): LocalizedMessage {
  const l = locale ?? currentLocale;
  const messages = l === 'zh-TW' ? ERROR_MESSAGES_ZH_TW : ERROR_MESSAGES_EN;

  return (
    messages[code] ?? {
      title: l === 'zh-TW' ? '發生錯誤' : 'Error',
      description: l === 'zh-TW' ? '發生未知錯誤' : 'An unknown error occurred',
      suggestions: [],
    }
  );
}

/**
 * Get localized status message
 */
export function getStatusMessage(
  key: string,
  params?: Record<string, string | number>,
  locale?: SupportedLocale
): string {
  const l = locale ?? currentLocale;
  const messages = l === 'zh-TW' ? STATUS_MESSAGES_ZH_TW : STATUS_MESSAGES_EN;

  let message = messages[key] ?? key;

  // Replace parameters
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replace(`{${k}}`, String(v));
    }
  }

  return message;
}

/**
 * Format translation progress message
 */
export function formatProgressMessage(
  current: number,
  total: number,
  locale?: SupportedLocale
): string {
  return getStatusMessage('translating_chunk', { current, total }, locale);
}

/**
 * Get all error messages for a locale
 */
export function getAllErrorMessages(locale?: SupportedLocale): Record<string, LocalizedMessage> {
  const l = locale ?? currentLocale;
  return l === 'zh-TW' ? { ...ERROR_MESSAGES_ZH_TW } : { ...ERROR_MESSAGES_EN };
}

/**
 * Get all status messages for a locale
 */
export function getAllStatusMessages(locale?: SupportedLocale): Record<string, string> {
  const l = locale ?? currentLocale;
  return l === 'zh-TW' ? { ...STATUS_MESSAGES_ZH_TW } : { ...STATUS_MESSAGES_EN };
}
