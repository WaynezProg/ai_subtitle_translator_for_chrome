/**
 * JSON3 Parser Tests (YouTube format)
 */

import { describe, it, expect } from 'vitest';
import {
  parseJSON3,
  isValidJSON3,
  isJSON3Format,
  JSON3ParseError
} from '../../../src/shared/parsers/json3-parser';

describe('JSON3 Parser', () => {
  describe('parseJSON3', () => {
    it('should parse basic JSON3 format', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Hello World' }]
          },
          {
            tStartMs: 5000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Second cue' }]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0]).toEqual({
        index: 0,
        startTime: 1000,
        endTime: 4000,
        text: 'Hello World'
      });
    });

    it('should combine multiple segments', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [
              { utf8: 'Hello ' },
              { utf8: 'World' }
            ]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues[0].text).toBe('Hello World');
    });

    it('should handle newline characters', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [
              { utf8: 'Line one' },
              { utf8: '\n' },
              { utf8: 'Line two' }
            ]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues[0].text).toBe('Line one\nLine two');
    });

    it('should skip events without segments', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000
            // No segs
          },
          {
            tStartMs: 5000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Has text' }]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].text).toBe('Has text');
    });

    it('should skip events without timing', () => {
      const json = JSON.stringify({
        events: [
          {
            segs: [{ utf8: 'No timing' }]
          },
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Has timing' }]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues).toHaveLength(1);
      expect(result.cues[0].text).toBe('Has timing');
    });

    it('should skip empty text segments', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [{ utf8: '   ' }]
          },
          {
            tStartMs: 5000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Has text' }]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues).toHaveLength(1);
    });

    it('should preserve all cues without merging (to maintain original timing)', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]
          },
          {
            tStartMs: 1500,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]
          },
          {
            tStartMs: 2000,
            dDurationMs: 1000,
            segs: [{ utf8: 'Hello' }]
          }
        ]
      });

      const result = parseJSON3(json);
      // Should preserve all cues to maintain original timing for translation sync
      expect(result.cues).toHaveLength(3);
      expect(result.cues[0].startTime).toBe(1000);
      expect(result.cues[0].endTime).toBe(1500);
      expect(result.cues[1].startTime).toBe(1500);
      expect(result.cues[1].endTime).toBe(2000);
      expect(result.cues[2].startTime).toBe(2000);
      expect(result.cues[2].endTime).toBe(3000);
    });

    it('should use default duration if not specified', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            // No dDurationMs
            segs: [{ utf8: 'Hello' }]
          }
        ]
      });

      const result = parseJSON3(json);
      expect(result.cues[0].endTime).toBe(6000); // 1000 + 5000 default
    });

    it('should report metadata', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Hello' }]
          },
          {
            tStartMs: 5000,
            dDurationMs: 3000,
            segs: [{ utf8: 'World' }]
          }
        ],
        pens: [{}]
      });

      const result = parseJSON3(json);
      expect(result.metadata.eventCount).toBe(2);
      expect(result.metadata.isAutoGenerated).toBe(true);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseJSON3('not json')).toThrow(JSON3ParseError);
    });

    it('should throw on missing events array', () => {
      expect(() => parseJSON3('{}')).toThrow(JSON3ParseError);
      expect(() => parseJSON3('{"events": "not array"}')).toThrow(JSON3ParseError);
    });
  });

  describe('isValidJSON3', () => {
    it('should return true for valid JSON3', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [{ utf8: 'Hello' }]
          }
        ]
      });
      expect(isValidJSON3(json)).toBe(true);
    });

    it('should return false for invalid content', () => {
      expect(isValidJSON3('invalid')).toBe(false);
      expect(isValidJSON3('{}')).toBe(false);
    });
  });

  describe('isJSON3Format', () => {
    it('should return true for JSON with events array', () => {
      expect(isJSON3Format('{"events": []}')).toBe(true);
      expect(isJSON3Format('{"events": [{}]}')).toBe(true);
    });

    it('should return false for non-JSON3 content', () => {
      expect(isJSON3Format('not json')).toBe(false);
      expect(isJSON3Format('{"other": "data"}')).toBe(false);
    });
  });

  describe('ASR (Auto-generated) subtitle handling', () => {
    it('should preserve original timing for ASR subtitles', () => {
      // ASR subtitles have many short, overlapping segments
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 2000,
            segs: [{ utf8: 'Hello', acAsrConf: 0.95 }]
          },
          {
            tStartMs: 1500,  // Overlaps with previous
            dDurationMs: 2000,
            segs: [{ utf8: 'World', acAsrConf: 0.90 }]
          }
        ]
      });

      const result = parseJSON3(json, { isAutoGenerated: true });
      
      // ASR mode should preserve original timing, not adjust
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0].startTime).toBe(1000);
      expect(result.cues[1].startTime).toBe(1500);  // Preserved, not adjusted to 3000
    });

    it('should NOT merge cues for ASR subtitles', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]
          },
          {
            tStartMs: 1500,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]  // Same text
          },
          {
            tStartMs: 2000,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]  // Same text
          }
        ]
      });

      const result = parseJSON3(json, { isAutoGenerated: true });
      
      // ASR mode should NOT merge - each cue is preserved
      expect(result.cues).toHaveLength(3);
    });

    it('should use shorter default duration for ASR', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            // No dDurationMs
            segs: [{ utf8: 'Hello' }]
          }
        ]
      });

      const result = parseJSON3(json, { isAutoGenerated: true });
      
      // ASR uses 2 second default instead of 5 seconds
      expect(result.cues[0].endTime).toBe(3000);  // 1000 + 2000
    });

    it('should detect ASR from acAsrConf in segments', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 1000,
            segs: [{ utf8: 'Hello', acAsrConf: 0.95 }]
          }
        ]
      });

      const result = parseJSON3(json);  // No explicit option
      
      expect(result.metadata.isAutoGenerated).toBe(true);
    });

    it('should detect ASR from pens array', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 1000,
            segs: [{ utf8: 'Hello' }]
          }
        ],
        pens: [{ someStyle: true }]
      });

      const result = parseJSON3(json);
      
      expect(result.metadata.isAutoGenerated).toBe(true);
    });

    it('should preserve original timing for non-ASR subtitles (no merging)', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]
          },
          {
            tStartMs: 1500,
            dDurationMs: 500,
            segs: [{ utf8: 'Hello' }]
          }
        ]
      });

      const result = parseJSON3(json, { isAutoGenerated: false });

      // All subtitles should preserve original timing - no merging
      // This is critical for translation sync
      expect(result.cues).toHaveLength(2);
      expect(result.cues[0].startTime).toBe(1000);
      expect(result.cues[0].endTime).toBe(1500);
      expect(result.cues[1].startTime).toBe(1500);
      expect(result.cues[1].endTime).toBe(2000);
    });

    it('should preserve overlapping times for non-ASR subtitles (no adjustment)', () => {
      const json = JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 2000,
            segs: [{ utf8: 'First' }]
          },
          {
            tStartMs: 1500,  // Overlaps with previous
            dDurationMs: 2000,
            segs: [{ utf8: 'Second' }]
          }
        ]
      });

      const result = parseJSON3(json, { isAutoGenerated: false });

      // All subtitles should preserve original timing - no overlap adjustment
      // This is critical for translation sync - timing must match original
      expect(result.cues[0].startTime).toBe(1000);
      expect(result.cues[1].startTime).toBe(1500);  // Original timing preserved
    });
  });
});
