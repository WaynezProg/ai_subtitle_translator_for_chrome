/**
 * WebVTT Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseWebVTT,
  parseTimestamp,
  stripWebVTTTags,
  extractSpeaker,
  isValidWebVTT,
  WebVTTParseError
} from '../../../src/shared/parsers/webvtt-parser';

describe('WebVTT Parser', () => {
  describe('parseTimestamp', () => {
    it('should parse HH:MM:SS.mmm format', () => {
      expect(parseTimestamp('00:01:30.500')).toBe(90500);
      expect(parseTimestamp('01:00:00.000')).toBe(3600000);
    });

    it('should parse MM:SS.mmm format', () => {
      expect(parseTimestamp('01:30.500')).toBe(90500);
      expect(parseTimestamp('00:05.000')).toBe(5000);
    });

    it('should throw on invalid format', () => {
      expect(() => parseTimestamp('invalid')).toThrow(WebVTTParseError);
      expect(() => parseTimestamp('1:30.5')).toThrow(WebVTTParseError);
    });
  });

  describe('stripWebVTTTags', () => {
    it('should remove voice tags', () => {
      expect(stripWebVTTTags('<v Speaker>Hello</v>')).toBe('Hello');
    });

    it('should remove inline tags', () => {
      expect(stripWebVTTTags('<b>Bold</b> <i>Italic</i>')).toBe('Bold Italic');
    });

    it('should unescape HTML entities', () => {
      expect(stripWebVTTTags('&amp; &lt; &gt;')).toBe('& < >');
    });
  });

  describe('extractSpeaker', () => {
    it('should extract speaker from voice tag', () => {
      expect(extractSpeaker('<v John>Hello</v>')).toBe('John');
      expect(extractSpeaker('<v Mary Smith>Hi there</v>')).toBe('Mary Smith');
    });

    it('should return undefined if no voice tag', () => {
      expect(extractSpeaker('Hello world')).toBeUndefined();
    });
  });

  describe('parseWebVTT', () => {
    it('should parse basic WebVTT', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello World

00:00:05.000 --> 00:00:08.000
Second cue`;

      const result = parseWebVTT(vtt);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0]).toEqual({
        index: 0,
        startTime: 1000,
        endTime: 4000,
        text: 'Hello World',
        speaker: undefined
      });
    });

    it('should parse WebVTT with cue identifiers', () => {
      const vtt = `WEBVTT

cue-1
00:00:01.000 --> 00:00:04.000
First cue

cue-2
00:00:05.000 --> 00:00:08.000
Second cue`;

      const result = parseWebVTT(vtt);
      expect(result.cues).toHaveLength(2);
    });

    it('should parse multiline cues', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Line one
Line two`;

      const result = parseWebVTT(vtt);
      expect(result.cues[0].text).toBe('Line one\nLine two');
    });

    it('should parse voice spans and extract speaker', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v John>Hello there</v>`;

      const result = parseWebVTT(vtt);
      expect(result.cues[0].speaker).toBe('John');
      expect(result.cues[0].text).toBe('Hello there');
    });

    it('should skip STYLE and REGION blocks', () => {
      const vtt = `WEBVTT

STYLE
::cue { color: white; }

REGION
id:reg1

00:00:01.000 --> 00:00:04.000
Actual cue`;

      const result = parseWebVTT(vtt);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].text).toBe('Actual cue');
    });

    it('should skip NOTE comments', () => {
      const vtt = `WEBVTT

NOTE This is a comment
that spans multiple lines

00:00:01.000 --> 00:00:04.000
Cue after note`;

      const result = parseWebVTT(vtt);
      expect(result.cues).toHaveLength(1);
    });

    it('should throw on missing WEBVTT header', () => {
      expect(() => parseWebVTT('00:00:01.000 --> 00:00:04.000\nHello')).toThrow(WebVTTParseError);
    });

    it('should parse with header metadata', () => {
      const vtt = `WEBVTT - This is a subtitle file

00:00:01.000 --> 00:00:04.000
Hello`;

      const result = parseWebVTT(vtt);
      expect(result.metadata.header).toBe('- This is a subtitle file');
    });
  });

  describe('isValidWebVTT', () => {
    it('should return true for valid WebVTT', () => {
      const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello`;
      expect(isValidWebVTT(vtt)).toBe(true);
    });

    it('should return false for invalid content', () => {
      expect(isValidWebVTT('invalid')).toBe(false);
      expect(isValidWebVTT('')).toBe(false);
    });
  });
});
