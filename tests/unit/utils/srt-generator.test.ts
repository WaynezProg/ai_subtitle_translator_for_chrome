/**
 * SRT Generator Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generateSRT,
  generateOriginalSRT,
  generateTranslatedSRT,
  generateBilingualSRT,
  formatSRTTimestamp,
  sanitizeFilename,
  generateSubtitleFilename,
} from '../../../src/shared/utils/srt-generator';
import type { Cue } from '../../../src/shared/types/subtitle';

describe('SRT Generator', () => {
  describe('formatSRTTimestamp', () => {
    it('should format milliseconds to SRT timestamp', () => {
      expect(formatSRTTimestamp(0)).toBe('00:00:00,000');
      expect(formatSRTTimestamp(1000)).toBe('00:00:01,000');
      expect(formatSRTTimestamp(90500)).toBe('00:01:30,500');
      expect(formatSRTTimestamp(3600000)).toBe('01:00:00,000');
      expect(formatSRTTimestamp(3661234)).toBe('01:01:01,234');
    });

    it('should handle large values', () => {
      expect(formatSRTTimestamp(36000000)).toBe('10:00:00,000');
    });
  });

  describe('sanitizeFilename', () => {
    it('should replace invalid characters with underscores', () => {
      expect(sanitizeFilename('file/name')).toBe('file_name');
      expect(sanitizeFilename('file\\name')).toBe('file_name');
      expect(sanitizeFilename('file:name')).toBe('file_name');
      expect(sanitizeFilename('file*name')).toBe('file_name');
      expect(sanitizeFilename('file?name')).toBe('file_name');
      expect(sanitizeFilename('file"name')).toBe('file_name');
      expect(sanitizeFilename('file<name')).toBe('file_name');
      expect(sanitizeFilename('file>name')).toBe('file_name');
      expect(sanitizeFilename('file|name')).toBe('file_name');
    });

    it('should collapse consecutive underscores', () => {
      expect(sanitizeFilename('file//name')).toBe('file_name');
      expect(sanitizeFilename('file:*?name')).toBe('file_name');
    });

    it('should trim leading and trailing underscores', () => {
      expect(sanitizeFilename('/filename/')).toBe('filename');
      expect(sanitizeFilename('_filename_')).toBe('filename');
    });

    it('should handle normal filenames unchanged', () => {
      expect(sanitizeFilename('my-video-title')).toBe('my-video-title');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('My Video Title')).toBe('My_Video_Title');
    });
  });

  describe('generateSubtitleFilename', () => {
    it('should generate filename for original mode', () => {
      expect(generateSubtitleFilename('My Video', 'abc123', 'en', undefined, 'original'))
        .toBe('My_Video_en.srt');
    });

    it('should generate filename for translated mode', () => {
      expect(generateSubtitleFilename('My Video', 'abc123', 'en', 'zh-TW', 'translated'))
        .toBe('My_Video_zh-TW.srt');
    });

    it('should generate filename for bilingual mode', () => {
      expect(generateSubtitleFilename('My Video', 'abc123', 'en', 'zh-TW', 'bilingual'))
        .toBe('My_Video_en-zh-TW.srt');
    });

    it('should use videoId when title is undefined', () => {
      expect(generateSubtitleFilename(undefined, 'abc123', 'en', undefined, 'original'))
        .toBe('abc123_en.srt');
    });

    it('should sanitize special characters in title', () => {
      expect(generateSubtitleFilename('My: Video? Title', 'abc123', 'en', undefined, 'original'))
        .toBe('My_Video_Title_en.srt');
    });
  });

  describe('generateSRT', () => {
    const sampleCues: Cue[] = [
      { index: 0, startTime: 1000, endTime: 4000, text: 'Hello World', translatedText: '你好世界' },
      { index: 1, startTime: 5000, endTime: 8000, text: 'Second cue', translatedText: '第二句' },
    ];

    it('should generate original mode SRT', () => {
      const result = generateSRT(sampleCues, { mode: 'original', includeBOM: false, useWindowsLineEndings: false });
      
      expect(result).toContain('1\n');
      expect(result).toContain('00:00:01,000 --> 00:00:04,000');
      expect(result).toContain('Hello World');
      expect(result).toContain('2\n');
      expect(result).toContain('00:00:05,000 --> 00:00:08,000');
      expect(result).toContain('Second cue');
      expect(result).not.toContain('你好世界');
    });

    it('should generate translated mode SRT', () => {
      const result = generateSRT(sampleCues, { mode: 'translated', includeBOM: false, useWindowsLineEndings: false });
      
      expect(result).toContain('你好世界');
      expect(result).toContain('第二句');
      expect(result).not.toContain('Hello World');
    });

    it('should generate bilingual mode SRT', () => {
      const result = generateSRT(sampleCues, { mode: 'bilingual', includeBOM: false, useWindowsLineEndings: false });
      
      expect(result).toContain('Hello World\n你好世界');
      expect(result).toContain('Second cue\n第二句');
    });

    it('should include BOM when requested', () => {
      const result = generateSRT(sampleCues, { mode: 'original', includeBOM: true, useWindowsLineEndings: false });
      
      expect(result.charCodeAt(0)).toBe(0xfeff);
    });

    it('should use Windows line endings when requested', () => {
      const result = generateSRT(sampleCues, { mode: 'original', includeBOM: false, useWindowsLineEndings: true });
      
      expect(result).toContain('\r\n');
      expect(result).not.toMatch(/[^\r]\n/);
    });

    it('should fall back to original text when translated text is missing', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 4000, text: 'Hello World' },
      ];
      
      const result = generateSRT(cues, { mode: 'translated', includeBOM: false, useWindowsLineEndings: false });
      expect(result).toContain('Hello World');
    });

    it('should handle bilingual when translation equals original', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 4000, text: 'Hello', translatedText: 'Hello' },
      ];
      
      const result = generateSRT(cues, { mode: 'bilingual', includeBOM: false, useWindowsLineEndings: false });
      // Should only show once, not duplicated
      expect(result).toContain('Hello');
      expect(result).not.toContain('Hello\nHello');
    });

    it('should handle empty cues array', () => {
      const result = generateSRT([], { mode: 'original', includeBOM: false, useWindowsLineEndings: false });
      expect(result).toBe('');
    });
  });

  describe('Quick helper functions', () => {
    const cues: Cue[] = [
      { index: 0, startTime: 1000, endTime: 4000, text: 'Hello', translatedText: '你好' },
    ];

    it('generateOriginalSRT should work', () => {
      const result = generateOriginalSRT(cues);
      expect(result).toContain('Hello');
    });

    it('generateTranslatedSRT should work', () => {
      const result = generateTranslatedSRT(cues);
      expect(result).toContain('你好');
    });

    it('generateBilingualSRT should work', () => {
      const result = generateBilingualSRT(cues);
      expect(result).toContain('Hello');
      expect(result).toContain('你好');
    });
  });
});
