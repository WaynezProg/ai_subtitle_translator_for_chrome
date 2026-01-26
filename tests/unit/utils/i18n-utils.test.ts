import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Language utilities
  getLanguageInfo,
  getLanguageName,
  getSupportedLanguages,
  getLanguagesByDirection,
  isRtlLanguage,
  getTextDirection,
  normalizeLanguageCode,
  getBaseLanguageCode,
  languagesMatch,
  // Browser locale detection
  getBrowserLanguage,
  getBrowserLanguages,
  findBestMatchingLanguage,
  // Locale formatting
  formatLocalizedNumber,
  formatLocalizedCurrency,
  formatLocalizedDate,
  formatLocalizedTime,
  formatLocalizedRelativeTime,
  formatLocalizedList,
  // Pluralization
  getPluralCategory,
  getOrdinalCategory,
  pluralize,
  // Translation utilities
  createTranslator,
  interpolate,
  selectByCount,
  // Chrome extension integration
  getExtensionMessage,
  getExtensionLocale,
  // Text direction
  detectTextDirection,
  wrapWithDirection,
  isolateBidiText,
  // Subtitle utilities
  normalizeSubtitleLanguageCode,
  getSubtitleLanguageDisplayName,
  COMMON_SUBTITLE_PAIRS,
  detectLikelyLanguage,
} from '@shared/utils/i18n-utils';

describe('Language Utilities', () => {
  describe('getLanguageInfo', () => {
    it('should return info for exact code', () => {
      const info = getLanguageInfo('en');
      expect(info).not.toBeNull();
      expect(info?.name).toBe('English');
      expect(info?.nativeName).toBe('English');
      expect(info?.direction).toBe('ltr');
    });

    it('should return info for regional code', () => {
      const info = getLanguageInfo('zh-TW');
      expect(info?.name).toBe('Chinese (Traditional)');
      expect(info?.nativeName).toBe('繁體中文');
      expect(info?.region).toBe('TW');
    });

    it('should fall back to base language', () => {
      const info = getLanguageInfo('en-AU');
      expect(info?.code).toBe('en');
    });

    it('should return null for unknown code', () => {
      expect(getLanguageInfo('xyz')).toBeNull();
    });
  });

  describe('getLanguageName', () => {
    it('should return English name by default', () => {
      expect(getLanguageName('ja')).toBe('Japanese');
      expect(getLanguageName('zh-TW')).toBe('Chinese (Traditional)');
    });

    it('should return native name when requested', () => {
      expect(getLanguageName('ja', { native: true })).toBe('日本語');
      expect(getLanguageName('zh-TW', { native: true })).toBe('繁體中文');
    });

    it('should return code for unknown language', () => {
      expect(getLanguageName('xyz')).toBe('xyz');
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return array of languages', () => {
      const languages = getSupportedLanguages();
      expect(languages.length).toBeGreaterThan(50);
      expect(languages.some((l) => l.code === 'en')).toBe(true);
      expect(languages.some((l) => l.code === 'zh-TW')).toBe(true);
    });
  });

  describe('getLanguagesByDirection', () => {
    it('should return LTR languages', () => {
      const ltr = getLanguagesByDirection('ltr');
      expect(ltr.every((l) => l.direction === 'ltr')).toBe(true);
      expect(ltr.some((l) => l.code === 'en')).toBe(true);
    });

    it('should return RTL languages', () => {
      const rtl = getLanguagesByDirection('rtl');
      expect(rtl.every((l) => l.direction === 'rtl')).toBe(true);
      expect(rtl.some((l) => l.code === 'ar')).toBe(true);
      expect(rtl.some((l) => l.code === 'he')).toBe(true);
    });
  });

  describe('isRtlLanguage', () => {
    it('should identify RTL languages', () => {
      expect(isRtlLanguage('ar')).toBe(true);
      expect(isRtlLanguage('he')).toBe(true);
      expect(isRtlLanguage('fa')).toBe(true);
      expect(isRtlLanguage('ur')).toBe(true);
    });

    it('should identify LTR languages', () => {
      expect(isRtlLanguage('en')).toBe(false);
      expect(isRtlLanguage('zh')).toBe(false);
      expect(isRtlLanguage('ja')).toBe(false);
    });
  });

  describe('getTextDirection', () => {
    it('should return correct direction', () => {
      expect(getTextDirection('ar')).toBe('rtl');
      expect(getTextDirection('en')).toBe('ltr');
    });
  });

  describe('normalizeLanguageCode', () => {
    it('should normalize single part codes', () => {
      expect(normalizeLanguageCode('EN')).toBe('en');
      expect(normalizeLanguageCode('JA')).toBe('ja');
    });

    it('should normalize regional codes', () => {
      expect(normalizeLanguageCode('en_us')).toBe('en-US');
      expect(normalizeLanguageCode('zh_tw')).toBe('zh-TW');
      expect(normalizeLanguageCode('EN-GB')).toBe('en-GB');
    });
  });

  describe('getBaseLanguageCode', () => {
    it('should extract base code', () => {
      expect(getBaseLanguageCode('en-US')).toBe('en');
      expect(getBaseLanguageCode('zh-TW')).toBe('zh');
      expect(getBaseLanguageCode('ja')).toBe('ja');
    });
  });

  describe('languagesMatch', () => {
    it('should match same languages', () => {
      expect(languagesMatch('en', 'en')).toBe(true);
      expect(languagesMatch('en-US', 'en-GB')).toBe(true);
      expect(languagesMatch('zh-TW', 'zh-CN')).toBe(true);
    });

    it('should not match different languages', () => {
      expect(languagesMatch('en', 'ja')).toBe(false);
      expect(languagesMatch('zh', 'ko')).toBe(false);
    });

    it('should require exact match in strict mode', () => {
      expect(languagesMatch('en-US', 'en-GB', { strict: true })).toBe(false);
      expect(languagesMatch('en-US', 'en-US', { strict: true })).toBe(true);
    });
  });
});

describe('Browser Locale Detection', () => {
  describe('getBrowserLanguage', () => {
    it('should return a language code', () => {
      const lang = getBrowserLanguage();
      expect(typeof lang).toBe('string');
      expect(lang.length).toBeGreaterThan(0);
    });
  });

  describe('getBrowserLanguages', () => {
    it('should return array of languages', () => {
      const languages = getBrowserLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });
  });

  describe('findBestMatchingLanguage', () => {
    const available = ['en', 'es', 'fr', 'zh-TW', 'zh-CN', 'ja'];

    it('should find exact match', () => {
      expect(findBestMatchingLanguage(['zh-TW'], available)).toBe('zh-TW');
      expect(findBestMatchingLanguage(['en'], available)).toBe('en');
    });

    it('should fall back to base language', () => {
      expect(findBestMatchingLanguage(['en-US'], available)).toBe('en');
      expect(findBestMatchingLanguage(['es-MX'], available)).toBe('es');
    });

    it('should respect preference order', () => {
      expect(findBestMatchingLanguage(['ko', 'ja'], available)).toBe('ja');
    });

    it('should return null if no match', () => {
      expect(findBestMatchingLanguage(['ko', 'th'], available)).toBeNull();
    });
  });
});

describe('Locale Formatting', () => {
  describe('formatLocalizedNumber', () => {
    it('should format number for locale', () => {
      expect(formatLocalizedNumber(1234.56, 'en-US')).toBe('1,234.56');
      expect(formatLocalizedNumber(1234.56, 'de-DE')).toMatch(/1\.234,56|1.234,56/);
    });

    it('should respect options', () => {
      const result = formatLocalizedNumber(0.75, 'en-US', { style: 'percent' });
      expect(result).toBe('75%');
    });
  });

  describe('formatLocalizedCurrency', () => {
    it('should format currency', () => {
      const result = formatLocalizedCurrency(99.99, 'USD', 'en-US');
      expect(result).toMatch(/\$99\.99/);
    });
  });

  describe('formatLocalizedDate', () => {
    it('should format date', () => {
      const date = new Date('2024-01-15');
      const result = formatLocalizedDate(date, 'en-US');
      expect(result).toMatch(/1\/15\/2024|Jan.*15.*2024/);
    });
  });

  describe('formatLocalizedTime', () => {
    it('should format time', () => {
      const date = new Date('2024-01-15T14:30:00');
      const result = formatLocalizedTime(date, 'en-US');
      expect(result).toMatch(/2:30|14:30/);
    });
  });

  describe('formatLocalizedRelativeTime', () => {
    it('should format relative time', () => {
      const result = formatLocalizedRelativeTime(-1, 'day', 'en-US');
      expect(result).toMatch(/yesterday|1 day ago/i);
    });
  });

  describe('formatLocalizedList', () => {
    it('should format list', () => {
      const result = formatLocalizedList(['apple', 'banana', 'cherry'], 'en-US');
      expect(result).toMatch(/apple,? banana,? and cherry/i);
    });
  });
});

describe('Pluralization', () => {
  describe('getPluralCategory', () => {
    it('should return correct category for English', () => {
      expect(getPluralCategory(0, 'en')).toBe('other');
      expect(getPluralCategory(1, 'en')).toBe('one');
      expect(getPluralCategory(2, 'en')).toBe('other');
      expect(getPluralCategory(5, 'en')).toBe('other');
    });
  });

  describe('getOrdinalCategory', () => {
    it('should return ordinal category', () => {
      const first = getOrdinalCategory(1, 'en');
      const second = getOrdinalCategory(2, 'en');
      expect(first).toBe('one');
      expect(second).toBe('two');
    });
  });

  describe('pluralize', () => {
    it('should select correct form', () => {
      const forms = {
        one: '1 item',
        other: '{count} items',
      };

      expect(pluralize(1, forms, 'en')).toBe('1 item');
      expect(pluralize(2, forms, 'en')).toBe('{count} items');
      expect(pluralize(0, forms, 'en')).toBe('{count} items');
    });
  });
});

describe('Translation Utilities', () => {
  describe('createTranslator', () => {
    it('should translate simple keys', () => {
      const messages = {
        greeting: 'Hello',
        farewell: 'Goodbye',
      };

      const t = createTranslator(messages);

      expect(t('greeting')).toBe('Hello');
      expect(t('farewell')).toBe('Goodbye');
    });

    it('should handle nested keys', () => {
      const messages = {
        buttons: {
          save: 'Save',
          cancel: 'Cancel',
        },
      };

      const t = createTranslator(messages);

      expect(t('buttons.save')).toBe('Save');
      expect(t('buttons.cancel')).toBe('Cancel');
    });

    it('should interpolate parameters', () => {
      const messages = {
        welcome: 'Welcome, {name}!',
        count: 'You have {count} messages',
      };

      const t = createTranslator(messages);

      expect(t('welcome', { name: 'Alice' })).toBe('Welcome, Alice!');
      expect(t('count', { count: 5 })).toBe('You have 5 messages');
    });

    it('should use fallback messages', () => {
      const messages = { a: 'Message A' };
      const fallback = { b: 'Fallback B' };

      const t = createTranslator(messages, { fallbackMessages: fallback });

      expect(t('a')).toBe('Message A');
      expect(t('b')).toBe('Fallback B');
    });

    it('should use missing key handler', () => {
      const messages = {};
      const t = createTranslator(messages, {
        missingKeyHandler: (key) => `[Missing: ${key}]`,
      });

      expect(t('unknown')).toBe('[Missing: unknown]');
    });

    it('should return key for missing translations', () => {
      const t = createTranslator({});
      expect(t('missing.key')).toBe('missing.key');
    });
  });

  describe('interpolate', () => {
    it('should replace placeholders', () => {
      expect(interpolate('Hello, {name}!', { name: 'World' })).toBe('Hello, World!');
      expect(interpolate('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
    });

    it('should keep unknown placeholders', () => {
      expect(interpolate('Hello, {name}!', {})).toBe('Hello, {name}!');
    });
  });

  describe('selectByCount', () => {
    it('should select by exact count', () => {
      const messages = {
        '=0': 'No items',
        '=1': 'One item',
        other: '{count} items',
      };

      expect(selectByCount(0, messages)).toBe('No items');
      expect(selectByCount(1, messages)).toBe('One item');
    });

    it('should select by plural category', () => {
      const messages = {
        one: 'One item',
        other: 'Many items',
      };

      expect(selectByCount(1, messages, 'en')).toBe('One item');
      expect(selectByCount(5, messages, 'en')).toBe('Many items');
    });
  });
});

describe('Chrome Extension Integration', () => {
  describe('getExtensionMessage', () => {
    it('should return message name when chrome.i18n unavailable', () => {
      expect(getExtensionMessage('test_message')).toBe('test_message');
    });

    it('should use chrome.i18n when available', () => {
      const originalChrome = globalThis.chrome;
      (globalThis as { chrome: typeof chrome }).chrome = {
        ...chrome,
        i18n: {
          getMessage: vi.fn().mockReturnValue('Translated'),
        } as unknown as typeof chrome.i18n,
      };

      expect(getExtensionMessage('test_message')).toBe('Translated');

      (globalThis as { chrome: typeof chrome }).chrome = originalChrome;
    });
  });

  describe('getExtensionLocale', () => {
    it('should return locale', () => {
      const locale = getExtensionLocale();
      expect(typeof locale).toBe('string');
      expect(locale.length).toBeGreaterThan(0);
    });
  });
});

describe('Text Direction', () => {
  describe('detectTextDirection', () => {
    it('should detect LTR text', () => {
      expect(detectTextDirection('Hello World')).toBe('ltr');
      expect(detectTextDirection('Bonjour le monde')).toBe('ltr');
    });

    it('should detect RTL text', () => {
      expect(detectTextDirection('مرحبا')).toBe('rtl');
      expect(detectTextDirection('שלום')).toBe('rtl');
    });

    it('should return auto for mixed text', () => {
      expect(detectTextDirection('Hello مرحبا')).toBe('auto');
    });

    it('should default to LTR for neutral text', () => {
      expect(detectTextDirection('12345')).toBe('ltr');
    });
  });

  describe('wrapWithDirection', () => {
    it('should wrap with LTR marker', () => {
      const wrapped = wrapWithDirection('Hello', 'ltr');
      expect(wrapped).toContain('\u200E'); // LRM
    });

    it('should wrap with RTL marker', () => {
      const wrapped = wrapWithDirection('مرحبا', 'rtl');
      expect(wrapped).toContain('\u200F'); // RLM
    });
  });

  describe('isolateBidiText', () => {
    it('should wrap with isolation markers', () => {
      const isolated = isolateBidiText('Mixed text');
      expect(isolated).toContain('\u2068'); // FSI
      expect(isolated).toContain('\u2069'); // PDI
    });
  });
});

describe('Subtitle Language Utilities', () => {
  describe('normalizeSubtitleLanguageCode', () => {
    it('should convert ISO 639-2 to ISO 639-1', () => {
      expect(normalizeSubtitleLanguageCode('eng')).toBe('en');
      expect(normalizeSubtitleLanguageCode('jpn')).toBe('ja');
      expect(normalizeSubtitleLanguageCode('kor')).toBe('ko');
      expect(normalizeSubtitleLanguageCode('chi')).toBe('zh');
      expect(normalizeSubtitleLanguageCode('zho')).toBe('zh');
    });

    it('should handle common aliases', () => {
      expect(normalizeSubtitleLanguageCode('chs')).toBe('zh-CN');
      expect(normalizeSubtitleLanguageCode('cht')).toBe('zh-TW');
    });

    it('should pass through already normalized codes', () => {
      expect(normalizeSubtitleLanguageCode('en')).toBe('en');
      expect(normalizeSubtitleLanguageCode('en-US')).toBe('en-US');
    });
  });

  describe('getSubtitleLanguageDisplayName', () => {
    it('should return display name', () => {
      expect(getSubtitleLanguageDisplayName('eng')).toBe('English');
      expect(getSubtitleLanguageDisplayName('jpn')).toBe('Japanese');
      expect(getSubtitleLanguageDisplayName('cht')).toBe('Chinese (Traditional)');
    });
  });

  describe('COMMON_SUBTITLE_PAIRS', () => {
    it('should contain common pairs', () => {
      expect(COMMON_SUBTITLE_PAIRS.length).toBeGreaterThan(5);
      expect(COMMON_SUBTITLE_PAIRS.some((p) => p.source === 'en' && p.target === 'zh-TW')).toBe(true);
      expect(COMMON_SUBTITLE_PAIRS.some((p) => p.source === 'en' && p.target === 'ja')).toBe(true);
    });
  });

  describe('detectLikelyLanguage', () => {
    it('should detect Chinese', () => {
      expect(detectLikelyLanguage('你好世界')).toBe('zh');
    });

    it('should detect Japanese', () => {
      expect(detectLikelyLanguage('こんにちは')).toBe('ja');
    });

    it('should detect Korean', () => {
      expect(detectLikelyLanguage('안녕하세요')).toBe('ko');
    });

    it('should detect Arabic', () => {
      expect(detectLikelyLanguage('مرحبا')).toBe('ar');
    });

    it('should detect Hebrew', () => {
      expect(detectLikelyLanguage('שלום')).toBe('he');
    });

    it('should detect Thai', () => {
      expect(detectLikelyLanguage('สวัสดี')).toBe('th');
    });

    it('should detect Russian', () => {
      expect(detectLikelyLanguage('Привет')).toBe('ru');
    });

    it('should detect Greek', () => {
      expect(detectLikelyLanguage('Γειά σου')).toBe('el');
    });

    it('should fall back to English for Latin text', () => {
      expect(detectLikelyLanguage('Hello World')).toBe('en');
    });

    it('should return null for numbers only', () => {
      expect(detectLikelyLanguage('12345')).toBeNull();
    });
  });
});
