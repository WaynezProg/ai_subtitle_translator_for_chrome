/**
 * Tests for Number and Math Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  clamp,
  round,
  floor,
  ceil,
  truncate,
  abs,
  sign,
  inRange,
  isPositive,
  isNegative,
  isZero,
  isInteger,
  isFiniteNumber,
  isNaN,
  isEven,
  isOdd,
  lerp,
  inverseLerp,
  mapRange,
  normalize,
  wrap,
  sum,
  mean,
  median,
  mode,
  variance,
  standardDeviation,
  min,
  max,
  range,
  statistics,
  percentile,
  percentage,
  fromPercentage,
  percentageChange,
  percentageDifference,
  formatBytes,
  parseBytes,
  formatNumber,
  formatCurrency,
  formatCompact,
  formatPercent,
  formatOrdinal,
  padStart,
  randomInt,
  randomFloat,
  randomBool,
  randomPick,
  randomId,
  uuid,
  toRadians,
  toDegrees,
  safeParseFloat,
  safeParseInt,
  approximately,
  isApproximatelyEqual,
} from '@shared/utils/number-utils';

// ============================================================================
// Basic Operations Tests
// ============================================================================

describe('Basic Operations', () => {
  describe('clamp', () => {
    it('should clamp value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('round', () => {
    it('should round to decimal places', () => {
      expect(round(3.14159, 2)).toBe(3.14);
      expect(round(3.145, 2)).toBe(3.15);
      expect(round(3.5)).toBe(4);
    });
  });

  describe('floor', () => {
    it('should floor to decimal places', () => {
      expect(floor(3.99, 1)).toBe(3.9);
      expect(floor(3.9)).toBe(3);
    });
  });

  describe('ceil', () => {
    it('should ceil to decimal places', () => {
      expect(ceil(3.11, 1)).toBe(3.2);
      expect(ceil(3.1)).toBe(4);
    });
  });

  describe('truncate', () => {
    it('should truncate decimal places', () => {
      expect(truncate(3.99, 1)).toBe(3.9);
      expect(truncate(-3.99, 1)).toBe(-3.9);
    });
  });

  describe('abs', () => {
    it('should return absolute value', () => {
      expect(abs(-5)).toBe(5);
      expect(abs(5)).toBe(5);
    });
  });

  describe('sign', () => {
    it('should return sign', () => {
      expect(sign(-5)).toBe(-1);
      expect(sign(5)).toBe(1);
      expect(sign(0)).toBe(0);
    });
  });

  describe('inRange', () => {
    it('should check if in range', () => {
      expect(inRange(5, 0, 10)).toBe(true);
      expect(inRange(0, 0, 10)).toBe(true);
      expect(inRange(-1, 0, 10)).toBe(false);
    });
  });

  describe('type checks', () => {
    it('should check positive', () => {
      expect(isPositive(5)).toBe(true);
      expect(isPositive(-5)).toBe(false);
      expect(isPositive(0)).toBe(false);
    });

    it('should check negative', () => {
      expect(isNegative(-5)).toBe(true);
      expect(isNegative(5)).toBe(false);
    });

    it('should check zero', () => {
      expect(isZero(0)).toBe(true);
      expect(isZero(1)).toBe(false);
    });

    it('should check integer', () => {
      expect(isInteger(5)).toBe(true);
      expect(isInteger(5.5)).toBe(false);
    });

    it('should check finite', () => {
      expect(isFiniteNumber(5)).toBe(true);
      expect(isFiniteNumber(Infinity)).toBe(false);
    });

    it('should check NaN', () => {
      expect(isNaN(NaN)).toBe(true);
      expect(isNaN(5)).toBe(false);
    });

    it('should check even/odd', () => {
      expect(isEven(4)).toBe(true);
      expect(isEven(5)).toBe(false);
      expect(isOdd(5)).toBe(true);
      expect(isOdd(4)).toBe(false);
    });
  });
});

// ============================================================================
// Range Operations Tests
// ============================================================================

describe('Range Operations', () => {
  describe('lerp', () => {
    it('should interpolate linearly', () => {
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 1)).toBe(10);
    });

    it('should clamp t value', () => {
      expect(lerp(0, 10, 1.5)).toBe(10);
      expect(lerp(0, 10, -0.5)).toBe(0);
    });
  });

  describe('inverseLerp', () => {
    it('should get t from value', () => {
      expect(inverseLerp(0, 10, 5)).toBe(0.5);
      expect(inverseLerp(0, 10, 0)).toBe(0);
      expect(inverseLerp(0, 10, 10)).toBe(1);
    });
  });

  describe('mapRange', () => {
    it('should map value between ranges', () => {
      expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
      expect(mapRange(0, 0, 10, 100, 200)).toBe(100);
    });
  });

  describe('normalize', () => {
    it('should normalize to 0-1', () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(0, 0, 10)).toBe(0);
    });
  });

  describe('wrap', () => {
    it('should wrap value within range', () => {
      expect(wrap(12, 0, 10)).toBe(2);
      expect(wrap(-2, 0, 10)).toBe(8);
      expect(wrap(5, 0, 10)).toBe(5);
    });
  });
});

// ============================================================================
// Statistical Functions Tests
// ============================================================================

describe('Statistical Functions', () => {
  const numbers = [1, 2, 3, 4, 5];

  describe('sum', () => {
    it('should calculate sum', () => {
      expect(sum(numbers)).toBe(15);
      expect(sum([])).toBe(0);
    });
  });

  describe('mean', () => {
    it('should calculate mean', () => {
      expect(mean(numbers)).toBe(3);
      expect(mean([])).toBe(0);
    });
  });

  describe('median', () => {
    it('should calculate median for odd count', () => {
      expect(median([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should calculate median for even count', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('should handle empty array', () => {
      expect(median([])).toBe(0);
    });
  });

  describe('mode', () => {
    it('should find mode', () => {
      expect(mode([1, 2, 2, 3, 3, 3])).toEqual([3]);
    });

    it('should return multiple modes', () => {
      expect(mode([1, 1, 2, 2])).toEqual([1, 2]);
    });

    it('should handle empty array', () => {
      expect(mode([])).toEqual([]);
    });
  });

  describe('variance', () => {
    it('should calculate variance', () => {
      expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBe(4);
    });

    it('should handle empty array', () => {
      expect(variance([])).toBe(0);
    });
  });

  describe('standardDeviation', () => {
    it('should calculate standard deviation', () => {
      expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    });
  });

  describe('min/max/range', () => {
    it('should find min', () => {
      expect(min(numbers)).toBe(1);
      expect(min([])).toBe(Infinity);
    });

    it('should find max', () => {
      expect(max(numbers)).toBe(5);
      expect(max([])).toBe(-Infinity);
    });

    it('should calculate range', () => {
      expect(range(numbers)).toBe(4);
      expect(range([])).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should calculate comprehensive statistics', () => {
      const stats = statistics([1, 2, 3, 4, 5]);

      expect(stats.count).toBe(5);
      expect(stats.sum).toBe(15);
      expect(stats.mean).toBe(3);
      expect(stats.median).toBe(3);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(5);
      expect(stats.range).toBe(4);
    });
  });

  describe('percentile', () => {
    it('should calculate percentile', () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
      expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
      expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
    });
  });
});

// ============================================================================
// Percentage Calculations Tests
// ============================================================================

describe('Percentage Calculations', () => {
  describe('percentage', () => {
    it('should calculate percentage', () => {
      expect(percentage(25, 100)).toBe(25);
      expect(percentage(1, 4)).toBe(25);
    });

    it('should handle zero total', () => {
      expect(percentage(5, 0)).toBe(0);
    });
  });

  describe('fromPercentage', () => {
    it('should calculate value from percentage', () => {
      expect(fromPercentage(25, 100)).toBe(25);
      expect(fromPercentage(50, 200)).toBe(100);
    });
  });

  describe('percentageChange', () => {
    it('should calculate percentage change', () => {
      expect(percentageChange(100, 125)).toBe(25);
      expect(percentageChange(100, 75)).toBe(-25);
    });

    it('should handle zero old value', () => {
      expect(percentageChange(0, 100)).toBe(Infinity);
      expect(percentageChange(0, 0)).toBe(0);
    });
  });

  describe('percentageDifference', () => {
    it('should calculate percentage difference', () => {
      expect(percentageDifference(100, 100)).toBe(0);
      expect(percentageDifference(0, 0)).toBe(0);
    });
  });
});

// ============================================================================
// Byte Size Formatting Tests
// ============================================================================

describe('Byte Size Formatting', () => {
  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1024)).toBe('1.02 KB');
      expect(formatBytes(1024, { binary: true })).toBe('1 KiB');
      expect(formatBytes(1048576)).toBe('1.05 MB');
    });

    it('should use full names', () => {
      expect(formatBytes(1024, { fullName: true })).toBe('1.02 kilobytes');
    });

    it('should respect decimals', () => {
      expect(formatBytes(1500, { decimals: 0 })).toBe('2 KB');
      expect(formatBytes(1500, { decimals: 3 })).toBe('1.5 KB');
    });
  });

  describe('parseBytes', () => {
    it('should parse byte strings', () => {
      expect(parseBytes('1024 B')).toBe(1024);
      expect(parseBytes('1 KB')).toBe(1024);
      expect(parseBytes('1 MB')).toBe(1048576);
    });
  });
});

// ============================================================================
// Number Formatting Tests
// ============================================================================

describe('Number Formatting', () => {
  describe('formatNumber', () => {
    it('should format with locale', () => {
      expect(formatNumber(1234567.89, { locale: 'en-US' })).toContain('1,234,567');
    });

    it('should respect fraction digits', () => {
      expect(formatNumber(3.14159, { maximumFractionDigits: 2 })).toBe('3.14');
    });
  });

  describe('formatCurrency', () => {
    it('should format as currency', () => {
      const result = formatCurrency(1234.56, 'USD', 'en-US');
      expect(result).toContain('$');
      expect(result).toContain('1,234.56');
    });
  });

  describe('formatCompact', () => {
    it('should format with compact notation', () => {
      expect(formatCompact(1000)).toBe('1K');
      expect(formatCompact(1000000)).toBe('1M');
    });
  });

  describe('formatPercent', () => {
    it('should format as percent', () => {
      expect(formatPercent(50)).toBe('50%');
      expect(formatPercent(33.333, { decimals: 1 })).toBe('33.3%');
    });
  });

  describe('formatOrdinal', () => {
    it('should format ordinals', () => {
      expect(formatOrdinal(1)).toBe('1st');
      expect(formatOrdinal(2)).toBe('2nd');
      expect(formatOrdinal(3)).toBe('3rd');
      expect(formatOrdinal(4)).toBe('4th');
      expect(formatOrdinal(11)).toBe('11th');
      expect(formatOrdinal(21)).toBe('21st');
    });
  });

  describe('padStart', () => {
    it('should pad with zeros', () => {
      expect(padStart(5, 3)).toBe('005');
      expect(padStart(123, 3)).toBe('123');
    });
  });
});

// ============================================================================
// Random Numbers Tests
// ============================================================================

describe('Random Numbers', () => {
  describe('randomInt', () => {
    it('should generate within range', () => {
      for (let i = 0; i < 100; i++) {
        const value = randomInt(0, 10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(10);
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });

  describe('randomFloat', () => {
    it('should generate within range', () => {
      for (let i = 0; i < 100; i++) {
        const value = randomFloat(0, 10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10);
      }
    });
  });

  describe('randomBool', () => {
    it('should generate boolean', () => {
      const result = randomBool();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('randomPick', () => {
    it('should pick from array', () => {
      const array = [1, 2, 3, 4, 5];
      const result = randomPick(array);
      expect(array).toContain(result);
    });

    it('should return undefined for empty array', () => {
      expect(randomPick([])).toBeUndefined();
    });
  });

  describe('randomId', () => {
    it('should generate ID of specified length', () => {
      expect(randomId(8)).toHaveLength(8);
      expect(randomId(16)).toHaveLength(16);
    });
  });

  describe('uuid', () => {
    it('should generate valid UUID format', () => {
      const id = uuid();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });
});

// ============================================================================
// Conversion Tests
// ============================================================================

describe('Conversion', () => {
  describe('toRadians', () => {
    it('should convert degrees to radians', () => {
      expect(toRadians(180)).toBeCloseTo(Math.PI);
      expect(toRadians(90)).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('toDegrees', () => {
    it('should convert radians to degrees', () => {
      expect(toDegrees(Math.PI)).toBeCloseTo(180);
      expect(toDegrees(Math.PI / 2)).toBeCloseTo(90);
    });
  });

  describe('safeParseFloat', () => {
    it('should parse valid floats', () => {
      expect(safeParseFloat('3.14')).toBe(3.14);
    });

    it('should return default for invalid', () => {
      expect(safeParseFloat('invalid')).toBe(0);
      expect(safeParseFloat('invalid', 5)).toBe(5);
    });
  });

  describe('safeParseInt', () => {
    it('should parse valid ints', () => {
      expect(safeParseInt('42')).toBe(42);
    });

    it('should return default for invalid', () => {
      expect(safeParseInt('invalid')).toBe(0);
      expect(safeParseInt('invalid', 10, 5)).toBe(5);
    });
  });
});

// ============================================================================
// Comparison Tests
// ============================================================================

describe('Comparison', () => {
  describe('approximately', () => {
    it('should return 0 for approximately equal', () => {
      expect(approximately(1.0001, 1.0002, 0.001)).toBe(0);
    });

    it('should return difference for not equal', () => {
      expect(approximately(1, 2, 0.001)).toBe(-1);
    });
  });

  describe('isApproximatelyEqual', () => {
    it('should check approximate equality', () => {
      expect(isApproximatelyEqual(0.1 + 0.2, 0.3)).toBe(true);
      expect(isApproximatelyEqual(1, 2)).toBe(false);
    });
  });
});
