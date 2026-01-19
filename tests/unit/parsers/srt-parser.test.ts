/**
 * SRT Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseSRT,
  parseSRTTimestamp,
  isValidSRT,
  isSRTFormat,
  SRTParseError,
} from '../../../src/shared/parsers/srt-parser';

describe('SRT Parser', () => {
  describe('parseSRTTimestamp', () => {
    it('should parse HH:MM:SS,mmm format (standard)', () => {
      expect(parseSRTTimestamp('00:01:30,500')).toBe(90500);
      expect(parseSRTTimestamp('01:00:00,000')).toBe(3600000);
      expect(parseSRTTimestamp('00:00:05,123')).toBe(5123);
    });

    it('should parse HH:MM:SS.mmm format (variant with period)', () => {
      expect(parseSRTTimestamp('00:01:30.500')).toBe(90500);
      expect(parseSRTTimestamp('01:00:00.000')).toBe(3600000);
    });

    it('should handle single-digit hours', () => {
      expect(parseSRTTimestamp('1:30:00,000')).toBe(5400000);
    });

    it('should throw on invalid format', () => {
      expect(() => parseSRTTimestamp('invalid')).toThrow(SRTParseError);
      expect(() => parseSRTTimestamp('1:30.5')).toThrow(SRTParseError);
      expect(() => parseSRTTimestamp('00:00:00')).toThrow(SRTParseError);
    });
  });

  describe('parseSRT', () => {
    it('should parse basic SRT', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World

2
00:00:05,000 --> 00:00:08,000
Second cue`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0]).toEqual({
        index: 0,
        startTime: 1000,
        endTime: 4000,
        text: 'Hello World',
      });
      expect(result.cues[1]).toEqual({
        index: 1,
        startTime: 5000,
        endTime: 8000,
        text: 'Second cue',
      });
    });

    it('should handle multi-line cue text', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two
Line three

2
00:00:05,000 --> 00:00:08,000
Single line`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0].text).toBe('Line one\nLine two\nLine three');
      expect(result.cues[1].text).toBe('Single line');
    });

    it('should handle Windows line endings (CRLF)', () => {
      const srt = '1\r\n00:00:01,000 --> 00:00:04,000\r\nHello World\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nSecond cue';

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0].text).toBe('Hello World');
    });

    it('should handle UTF-8 BOM', () => {
      const srt = '\ufeff1\n00:00:01,000 --> 00:00:04,000\nHello World';

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].text).toBe('Hello World');
    });

    it('should handle leading empty lines', () => {
      const srt = `

1
00:00:01,000 --> 00:00:04,000
Hello World`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(1);
    });

    it('should handle period as millisecond separator', () => {
      const srt = `1
00:00:01.000 --> 00:00:04.000
Hello World`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].startTime).toBe(1000);
      expect(result.cues[0].endTime).toBe(4000);
    });

    it('should skip invalid timing lines gracefully', () => {
      const srt = `1
invalid timing
Some text

2
00:00:05,000 --> 00:00:08,000
Valid cue`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].text).toBe('Valid cue');
    });

    it('should handle missing cue index', () => {
      const srt = `00:00:01,000 --> 00:00:04,000
Hello World

00:00:05,000 --> 00:00:08,000
Second cue`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(2);
    });

    it('should return empty cues for empty content', () => {
      const result = parseSRT('');
      expect(result.cues).toHaveLength(0);
    });

    it('should handle bilingual cues (two lines per cue)', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Hello, world!
你好，世界！

2
00:00:05,000 --> 00:00:08,000
Good morning
早安`;

      const result = parseSRT(srt);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0].text).toBe('Hello, world!\n你好，世界！');
      expect(result.cues[1].text).toBe('Good morning\n早安');
    });
  });

  describe('isValidSRT', () => {
    it('should return true for valid SRT', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World`;

      expect(isValidSRT(srt)).toBe(true);
    });

    it('should return false for empty content', () => {
      expect(isValidSRT('')).toBe(false);
    });

    it('should return false for content without valid cues', () => {
      expect(isValidSRT('just some text')).toBe(false);
      expect(isValidSRT('random\nlines\nwithout\ntiming')).toBe(false);
    });

    it('should return true for WebVTT-like content with valid timing', () => {
      // Note: SRT parser will accept WebVTT content if it has valid timing lines
      // Use isSRTFormat() to distinguish SRT from WebVTT
      expect(isValidSRT('WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello')).toBe(true);
    });
  });

  describe('isSRTFormat', () => {
    it('should return true for content that looks like SRT', () => {
      const srt = `1
00:00:01,000 --> 00:00:04,000
Hello World`;

      expect(isSRTFormat(srt)).toBe(true);
    });

    it('should return true with leading whitespace', () => {
      const srt = `
1
00:00:01,000 --> 00:00:04,000
Hello World`;

      expect(isSRTFormat(srt)).toBe(true);
    });

    it('should return false for WebVTT', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello World`;

      expect(isSRTFormat(vtt)).toBe(false);
    });

    it('should return false for random text', () => {
      expect(isSRTFormat('Hello World')).toBe(false);
      expect(isSRTFormat('{"events": []}')).toBe(false);
    });

    it('should handle BOM', () => {
      const srt = `\ufeff1
00:00:01,000 --> 00:00:04,000
Hello World`;

      expect(isSRTFormat(srt)).toBe(true);
    });
  });
});
