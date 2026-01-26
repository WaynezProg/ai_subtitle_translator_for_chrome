/**
 * Tests for User Messages Utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  setLocale,
  getLocale,
  getErrorMessage,
  getStatusMessage,
  formatProgressMessage,
  getAllErrorMessages,
  getAllStatusMessages,
} from '@shared/utils/user-messages';
import { ErrorCodes } from '@shared/utils/error-handler';

describe('User Messages', () => {
  beforeEach(() => {
    // Reset to default locale
    setLocale('zh-TW');
  });

  describe('setLocale / getLocale', () => {
    it('should set and get locale', () => {
      setLocale('en');
      expect(getLocale()).toBe('en');

      setLocale('zh-TW');
      expect(getLocale()).toBe('zh-TW');
    });
  });

  describe('getErrorMessage', () => {
    it('should return Traditional Chinese message by default', () => {
      const message = getErrorMessage(ErrorCodes.NETWORK_OFFLINE);

      expect(message.title).toBe('網路離線');
      expect(message.description).toContain('網路');
      expect(message.suggestions).toBeDefined();
      expect(message.suggestions!.length).toBeGreaterThan(0);
    });

    it('should return English message when locale is en', () => {
      setLocale('en');
      const message = getErrorMessage(ErrorCodes.NETWORK_OFFLINE);

      expect(message.title).toBe('Offline');
      expect(message.description).toContain('internet');
    });

    it('should override locale with parameter', () => {
      const zhMessage = getErrorMessage(ErrorCodes.NETWORK_OFFLINE, 'zh-TW');
      const enMessage = getErrorMessage(ErrorCodes.NETWORK_OFFLINE, 'en');

      expect(zhMessage.title).toBe('網路離線');
      expect(enMessage.title).toBe('Offline');
    });

    it('should return fallback for unknown error code', () => {
      const message = getErrorMessage('UNKNOWN_CODE');

      expect(message.title).toBeDefined();
      expect(message.description).toBeDefined();
    });

    it('should return appropriate messages for auth errors', () => {
      const message = getErrorMessage(ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(message.title).toContain('API');
      expect(message.suggestions).toBeDefined();
    });

    it('should return appropriate messages for provider errors', () => {
      const message = getErrorMessage(ErrorCodes.PROVIDER_QUOTA_EXCEEDED);

      expect(message.title).toContain('API');
      expect(message.suggestions!.length).toBeGreaterThan(0);
    });

    it('should return appropriate messages for Ollama errors', () => {
      const message = getErrorMessage(ErrorCodes.OLLAMA_NOT_RUNNING);

      expect(message.title).toContain('Ollama');
      expect(message.suggestions).toBeDefined();
    });
  });

  describe('getStatusMessage', () => {
    it('should return Traditional Chinese status message by default', () => {
      const message = getStatusMessage('translating');

      expect(message).toBe('翻譯中...');
    });

    it('should return English status message when locale is en', () => {
      setLocale('en');
      const message = getStatusMessage('translating');

      expect(message).toBe('Translating...');
    });

    it('should replace parameters in message', () => {
      const message = getStatusMessage('translating_chunk', { current: 5, total: 10 });

      expect(message).toContain('5');
      expect(message).toContain('10');
    });

    it('should return key if message not found', () => {
      const message = getStatusMessage('unknown_key');

      expect(message).toBe('unknown_key');
    });

    it('should handle various status messages', () => {
      const statuses = [
        'translation_complete',
        'translation_cached',
        'subtitle_loading',
        'network_offline',
        'loading',
        'success',
      ];

      for (const status of statuses) {
        const message = getStatusMessage(status);
        expect(message).not.toBe(status); // Should be translated
      }
    });
  });

  describe('formatProgressMessage', () => {
    it('should format progress in Traditional Chinese', () => {
      const message = formatProgressMessage(3, 10);

      expect(message).toContain('3');
      expect(message).toContain('10');
    });

    it('should format progress in English', () => {
      const message = formatProgressMessage(3, 10, 'en');

      expect(message).toContain('3');
      expect(message).toContain('10');
      expect(message).toContain('Translating');
    });
  });

  describe('getAllErrorMessages', () => {
    it('should return all error messages for current locale', () => {
      const messages = getAllErrorMessages();

      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(messages[ErrorCodes.NETWORK_OFFLINE]).toBeDefined();
    });

    it('should return all error messages for specified locale', () => {
      const zhMessages = getAllErrorMessages('zh-TW');
      const enMessages = getAllErrorMessages('en');

      expect(zhMessages[ErrorCodes.NETWORK_OFFLINE].title).toBe('網路離線');
      expect(enMessages[ErrorCodes.NETWORK_OFFLINE].title).toBe('Offline');
    });
  });

  describe('getAllStatusMessages', () => {
    it('should return all status messages for current locale', () => {
      const messages = getAllStatusMessages();

      expect(Object.keys(messages).length).toBeGreaterThan(0);
      expect(messages['translating']).toBeDefined();
    });

    it('should return all status messages for specified locale', () => {
      const zhMessages = getAllStatusMessages('zh-TW');
      const enMessages = getAllStatusMessages('en');

      expect(zhMessages['translating']).toBe('翻譯中...');
      expect(enMessages['translating']).toBe('Translating...');
    });
  });
});

describe('Error Message Coverage', () => {
  it('should have messages for all ErrorCodes', () => {
    const allCodes = Object.values(ErrorCodes);
    const zhMessages = getAllErrorMessages('zh-TW');
    const enMessages = getAllErrorMessages('en');

    for (const code of allCodes) {
      expect(zhMessages[code]).toBeDefined();
      expect(enMessages[code]).toBeDefined();
    }
  });

  it('should have suggestions for critical errors', () => {
    const criticalCodes = [
      ErrorCodes.AUTH_INVALID_CREDENTIALS,
      ErrorCodes.PROVIDER_NOT_CONFIGURED,
      ErrorCodes.NETWORK_OFFLINE,
    ];

    for (const code of criticalCodes) {
      const message = getErrorMessage(code);
      expect(message.suggestions).toBeDefined();
      expect(message.suggestions!.length).toBeGreaterThan(0);
    }
  });
});
