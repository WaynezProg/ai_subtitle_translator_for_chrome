/**
 * Tests for Subtitle Download Utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  downloadSubtitleAsSRT,
  downloadOriginalSubtitle,
  downloadTranslatedSubtitle,
  downloadBilingualSubtitle,
} from '@shared/utils/subtitle-download';
import type { Cue } from '@shared/types/subtitle';

// Mock DOM APIs
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockClick = vi.fn();

beforeEach(() => {
  // Mock URL APIs
  global.URL.createObjectURL = mockCreateObjectURL;
  global.URL.revokeObjectURL = mockRevokeObjectURL;

  // Mock document.body
  vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
  vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

  // Mock createElement to return a mock anchor element
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'a') {
      return {
        href: '',
        download: '',
        style: { display: '' },
        click: mockClick,
      } as unknown as HTMLAnchorElement;
    }
    return document.createElement(tag);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to create test cues
function createCue(
  index: number,
  startTime: number,
  endTime: number,
  text: string,
  translatedText?: string
): Cue {
  return { index, startTime, endTime, text, translatedText };
}

describe('downloadSubtitleAsSRT', () => {
  describe('validation', () => {
    it('should return error when cues array is empty', () => {
      const result = downloadSubtitleAsSRT({
        cues: [],
        mode: 'original',
        videoId: 'test-video',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No subtitles available to download');
    });

    it('should return error when cues is undefined', () => {
      const result = downloadSubtitleAsSRT({
        cues: undefined as unknown as Cue[],
        mode: 'original',
        videoId: 'test-video',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No subtitles available to download');
    });

    it('should return error for translated mode without translations', () => {
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
        createCue(1, 1000, 2000, 'World'),
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'translated',
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No translated subtitles available');
    });

    it('should succeed for bilingual mode without translations', () => {
      // Bilingual mode shows original if no translation available
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'bilingual',
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('original mode', () => {
    it('should download original subtitles successfully', () => {
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
        createCue(1, 1000, 2000, 'World'),
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'original',
        videoId: 'test-video',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.filename).toContain('.srt');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it('should use video title in filename when provided', () => {
      const cues: Cue[] = [createCue(0, 0, 1000, 'Hello')];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'original',
        videoTitle: 'My Video Title',
        videoId: 'test-video',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.filename).toContain('My_Video_Title');
    });
  });

  describe('translated mode', () => {
    it('should download translated subtitles successfully', () => {
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello', '你好'),
        createCue(1, 1000, 2000, 'World', '世界'),
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'translated',
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
      });

      expect(result.success).toBe(true);
      expect(result.filename).toBeDefined();
    });

    it('should succeed if at least one cue has translation', () => {
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello', '你好'),
        createCue(1, 1000, 2000, 'World'), // No translation
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'translated',
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
      });

      expect(result.success).toBe(true);
    });

    it('should fail if all translations are empty strings', () => {
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello', ''),
        createCue(1, 1000, 2000, 'World', '   '),
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'translated',
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No translated subtitles available');
    });
  });

  describe('bilingual mode', () => {
    it('should download bilingual subtitles successfully', () => {
      const cues: Cue[] = [
        createCue(0, 0, 1000, 'Hello', '你好'),
        createCue(1, 1000, 2000, 'World', '世界'),
      ];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'bilingual',
        videoId: 'test-video',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle exceptions during download', () => {
      // Mock createElement to throw
      vi.spyOn(document, 'createElement').mockImplementation(() => {
        throw new Error('DOM error');
      });

      const cues: Cue[] = [createCue(0, 0, 1000, 'Hello')];

      const result = downloadSubtitleAsSRT({
        cues,
        mode: 'original',
        videoId: 'test-video',
        sourceLanguage: 'en',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('DOM error');
    });
  });
});

describe('downloadOriginalSubtitle', () => {
  it('should call downloadSubtitleAsSRT with original mode', () => {
    const cues: Cue[] = [createCue(0, 0, 1000, 'Hello')];

    const result = downloadOriginalSubtitle(cues, 'Video Title', 'video-123', 'en');

    expect(result.success).toBe(true);
    expect(result.filename).toContain('en');
  });

  it('should handle undefined video title', () => {
    const cues: Cue[] = [createCue(0, 0, 1000, 'Hello')];

    const result = downloadOriginalSubtitle(cues, undefined, 'video-123', 'en');

    expect(result.success).toBe(true);
  });
});

describe('downloadTranslatedSubtitle', () => {
  it('should call downloadSubtitleAsSRT with translated mode', () => {
    const cues: Cue[] = [createCue(0, 0, 1000, 'Hello', '你好')];

    const result = downloadTranslatedSubtitle(cues, 'Video Title', 'video-123', 'en', 'zh-TW');

    expect(result.success).toBe(true);
  });
});

describe('downloadBilingualSubtitle', () => {
  it('should call downloadSubtitleAsSRT with bilingual mode', () => {
    const cues: Cue[] = [createCue(0, 0, 1000, 'Hello', '你好')];

    const result = downloadBilingualSubtitle(cues, 'Video Title', 'video-123', 'en', 'zh-TW');

    expect(result.success).toBe(true);
  });
});
