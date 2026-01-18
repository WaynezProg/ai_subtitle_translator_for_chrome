/**
 * TTML Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseTTML,
  parseTTMLTimestamp,
  isValidTTML,
  TTMLParseError
} from '../../../src/shared/parsers/ttml-parser';

describe('TTML Parser', () => {
  describe('parseTTMLTimestamp', () => {
    it('should parse HH:MM:SS.mmm format', () => {
      expect(parseTTMLTimestamp('00:01:30.500')).toBe(90500);
      expect(parseTTMLTimestamp('01:00:00.000')).toBe(3600000);
    });

    it('should parse HH:MM:SS format (no milliseconds)', () => {
      expect(parseTTMLTimestamp('00:01:30')).toBe(90000);
    });

    it('should parse HH:MM:SS:FF format (with frames)', () => {
      expect(parseTTMLTimestamp('00:00:01:15', 30)).toBe(1500);
    });

    it('should parse tick format (Xt)', () => {
      expect(parseTTMLTimestamp('10000000t', 30, 10000000)).toBe(1000);
    });

    it('should parse frame format (Xf)', () => {
      expect(parseTTMLTimestamp('30f', 30)).toBe(1000);
    });

    it('should parse milliseconds format (Xms)', () => {
      expect(parseTTMLTimestamp('1500ms')).toBe(1500);
    });

    it('should parse seconds format (Xs)', () => {
      expect(parseTTMLTimestamp('1.5s')).toBe(1500);
    });

    it('should throw on invalid format', () => {
      expect(() => parseTTMLTimestamp('invalid')).toThrow(TTMLParseError);
    });
  });

  describe('parseTTML', () => {
    it('should parse basic TTML', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">Hello World</p>
      <p begin="00:00:05.000" end="00:00:08.000">Second cue</p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0]).toEqual({
        index: 0,
        startTime: 1000,
        endTime: 4000,
        text: 'Hello World',
        speaker: undefined
      });
    });

    it('should parse TTML with duration', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" dur="3s">Hello</p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.cues[0].endTime).toBe(4000); // 1000 + 3000
    });

    it('should parse TTML with nested spans', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">
        <span>Hello </span><span>World</span>
      </p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.cues[0].text).toBe('Hello World');
    });

    it('should handle br elements', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">
        Line one<br/>Line two
      </p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.cues[0].text).toBe('Line one\nLine two');
    });

    it('should extract language metadata', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="en-US">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">Hello</p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.metadata.language).toBe('en-US');
    });

    it('should extract frame rate metadata', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="24">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">Hello</p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.metadata.frameRate).toBe(24);
    });

    it('should throw on missing body element', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
</tt>`;

      expect(() => parseTTML(ttml)).toThrow(TTMLParseError);
    });

    it('should throw on invalid XML', () => {
      expect(() => parseTTML('not xml at all')).toThrow(TTMLParseError);
    });

    it('should skip paragraphs without timing', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p>No timing</p>
      <p begin="00:00:01.000" end="00:00:04.000">Has timing</p>
    </div>
  </body>
</tt>`;

      const result = parseTTML(ttml);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].text).toBe('Has timing');
    });
  });

  describe('isValidTTML', () => {
    it('should return true for valid TTML', () => {
      const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:04.000">Hello</p>
    </div>
  </body>
</tt>`;
      expect(isValidTTML(ttml)).toBe(true);
    });

    it('should return false for invalid content', () => {
      expect(isValidTTML('invalid')).toBe(false);
      expect(isValidTTML('')).toBe(false);
    });
  });
});
