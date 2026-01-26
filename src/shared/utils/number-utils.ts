/**
 * Number and Math Utilities
 *
 * Provides comprehensive number manipulation functions:
 * - Number formatting and parsing
 * - Range operations
 * - Statistical functions
 * - Percentage calculations
 * - Byte size formatting
 * - Random number generation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Statistics result
 */
export interface Statistics {
  count: number;
  sum: number;
  mean: number;
  median: number;
  mode: number[];
  min: number;
  max: number;
  range: number;
  variance: number;
  standardDeviation: number;
}

/**
 * Number format options
 */
export interface NumberFormatOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
}

// ============================================================================
// Basic Operations
// ============================================================================

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round to specified decimal places
 */
export function round(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Floor to specified decimal places
 */
export function floor(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

/**
 * Ceil to specified decimal places
 */
export function ceil(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

/**
 * Truncate decimal places without rounding
 */
export function truncate(value: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}

/**
 * Get absolute value
 */
export function abs(value: number): number {
  return Math.abs(value);
}

/**
 * Get sign of number (-1, 0, or 1)
 */
export function sign(value: number): number {
  return Math.sign(value);
}

/**
 * Check if number is between min and max (inclusive)
 */
export function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Check if number is positive
 */
export function isPositive(value: number): boolean {
  return value > 0;
}

/**
 * Check if number is negative
 */
export function isNegative(value: number): boolean {
  return value < 0;
}

/**
 * Check if number is zero
 */
export function isZero(value: number): boolean {
  return value === 0;
}

/**
 * Check if number is integer
 */
export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Check if number is finite
 */
export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * Check if value is NaN
 */
export function isNaN(value: number): boolean {
  return Number.isNaN(value);
}

/**
 * Check if number is even
 */
export function isEven(value: number): boolean {
  return value % 2 === 0;
}

/**
 * Check if number is odd
 */
export function isOdd(value: number): boolean {
  return value % 2 !== 0;
}

// ============================================================================
// Range Operations
// ============================================================================

/**
 * Linear interpolation between two values
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Inverse linear interpolation (get t from value)
 */
export function inverseLerp(start: number, end: number, value: number): number {
  if (start === end) return 0;
  return clamp((value - start) / (end - start), 0, 1);
}

/**
 * Map value from one range to another
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  const t = inverseLerp(inMin, inMax, value);
  return lerp(outMin, outMax, t);
}

/**
 * Normalize value to 0-1 range
 */
export function normalize(value: number, min: number, max: number): number {
  return inverseLerp(min, max, value);
}

/**
 * Wrap value within range
 */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) return min;
  return ((((value - min) % range) + range) % range) + min;
}

// ============================================================================
// Statistical Functions
// ============================================================================

/**
 * Calculate sum of numbers
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Calculate mean (average)
 */
export function mean(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return sum(numbers) / numbers.length;
}

/**
 * Calculate median
 */
export function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate mode (most frequent values)
 */
export function mode(numbers: number[]): number[] {
  if (numbers.length === 0) return [];

  const frequency = new Map<number, number>();
  let maxFreq = 0;

  for (const n of numbers) {
    const freq = (frequency.get(n) || 0) + 1;
    frequency.set(n, freq);
    maxFreq = Math.max(maxFreq, freq);
  }

  const modes: number[] = [];
  for (const [value, freq] of frequency) {
    if (freq === maxFreq) {
      modes.push(value);
    }
  }

  return modes.sort((a, b) => a - b);
}

/**
 * Calculate variance
 */
export function variance(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const avg = mean(numbers);
  const squaredDiffs = numbers.map((n) => Math.pow(n - avg, 2));
  return mean(squaredDiffs);
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(numbers: number[]): number {
  return Math.sqrt(variance(numbers));
}

/**
 * Calculate min value
 */
export function min(numbers: number[]): number {
  if (numbers.length === 0) return Infinity;
  return Math.min(...numbers);
}

/**
 * Calculate max value
 */
export function max(numbers: number[]): number {
  if (numbers.length === 0) return -Infinity;
  return Math.max(...numbers);
}

/**
 * Calculate range (max - min)
 */
export function range(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return max(numbers) - min(numbers);
}

/**
 * Calculate comprehensive statistics
 */
export function statistics(numbers: number[]): Statistics {
  if (numbers.length === 0) {
    return {
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      mode: [],
      min: 0,
      max: 0,
      range: 0,
      variance: 0,
      standardDeviation: 0,
    };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const sumValue = sum(numbers);
  const meanValue = sumValue / numbers.length;
  const medianValue = median(numbers);
  const modeValue = mode(numbers);
  const minValue = sorted[0];
  const maxValue = sorted[sorted.length - 1];
  const rangeValue = maxValue - minValue;
  const varianceValue = variance(numbers);
  const stdDevValue = Math.sqrt(varianceValue);

  return {
    count: numbers.length,
    sum: sumValue,
    mean: meanValue,
    median: medianValue,
    mode: modeValue,
    min: minValue,
    max: maxValue,
    range: rangeValue,
    variance: varianceValue,
    standardDeviation: stdDevValue,
  };
}

/**
 * Calculate percentile
 */
export function percentile(numbers: number[], p: number): number {
  if (numbers.length === 0) return 0;
  if (p <= 0) return min(numbers);
  if (p >= 100) return max(numbers);

  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// ============================================================================
// Percentage Calculations
// ============================================================================

/**
 * Calculate percentage
 */
export function percentage(value: number, total: number): number {
  if (total === 0) return 0;
  return (value / total) * 100;
}

/**
 * Calculate value from percentage
 */
export function fromPercentage(percent: number, total: number): number {
  return (percent / 100) * total;
}

/**
 * Calculate percentage change
 */
export function percentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return newValue === 0 ? 0 : Infinity;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
}

/**
 * Calculate percentage difference
 */
export function percentageDifference(value1: number, value2: number): number {
  const avg = (Math.abs(value1) + Math.abs(value2)) / 2;
  if (avg === 0) return 0;
  return (Math.abs(value1 - value2) / avg) * 100;
}

// ============================================================================
// Byte Size Formatting
// ============================================================================

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
const BYTE_UNITS_FULL = ['bytes', 'kilobytes', 'megabytes', 'gigabytes', 'terabytes', 'petabytes', 'exabytes'];

/**
 * Format bytes to human-readable string
 */
export function formatBytes(
  bytes: number,
  options?: {
    decimals?: number;
    binary?: boolean;
    fullName?: boolean;
  }
): string {
  const { decimals = 2, binary = false, fullName = false } = options || {};

  if (bytes === 0) return fullName ? '0 bytes' : '0 B';

  const base = binary ? 1024 : 1000;
  const units = fullName ? BYTE_UNITS_FULL : BYTE_UNITS;
  const absBytes = Math.abs(bytes);

  const exponent = Math.min(
    Math.floor(Math.log(absBytes) / Math.log(base)),
    units.length - 1
  );

  const value = bytes / Math.pow(base, exponent);
  const formattedValue = round(value, decimals);

  const unit = units[exponent];
  // For binary, insert 'i' after first character (e.g., KB -> KiB, MB -> MiB)
  const suffix = binary && !fullName && exponent > 0
    ? unit[0] + 'i' + unit.slice(1)
    : unit;

  return `${formattedValue} ${suffix}`;
}

/**
 * Parse bytes from string
 */
export function parseBytes(str: string): number {
  const match = str.match(/^([\d.]+)\s*([a-z]*)/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  const unitIndex = BYTE_UNITS.findIndex(
    (u) => u === unit || u.charAt(0) === unit.charAt(0)
  );

  if (unitIndex === -1) return value;

  return value * Math.pow(1024, unitIndex);
}

// ============================================================================
// Number Formatting
// ============================================================================

/**
 * Format number with locale
 */
export function formatNumber(value: number, options?: NumberFormatOptions): string {
  const {
    locale = 'en',
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping = true,
  } = options || {};

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  }).format(value);
}

/**
 * Format number as currency
 */
export function formatCurrency(
  value: number,
  currency = 'USD',
  locale = 'en-US'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(value);
}

/**
 * Format number with compact notation (1K, 1M, etc.)
 */
export function formatCompact(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

/**
 * Format percentage
 */
export function formatPercent(
  value: number,
  options?: { locale?: string; decimals?: number }
): string {
  const { locale = 'en', decimals = 0 } = options || {};

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Format ordinal number (1st, 2nd, 3rd, etc.)
 */
export function formatOrdinal(value: number, locale = 'en'): string {
  const pr = new Intl.PluralRules(locale, { type: 'ordinal' });
  const suffixes: Record<string, string> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  };

  const rule = pr.select(value);
  const suffix = suffixes[rule] || 'th';

  return `${value}${suffix}`;
}

/**
 * Pad number with leading zeros
 */
export function padStart(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

// ============================================================================
// Random Numbers
// ============================================================================

/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random float between min and max
 */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Generate random boolean
 */
export function randomBool(probability = 0.5): boolean {
  return Math.random() < probability;
}

/**
 * Pick random item from array
 */
export function randomPick<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[randomInt(0, array.length - 1)];
}

/**
 * Generate random ID
 */
export function randomId(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(0, chars.length - 1));
  }
  return result;
}

/**
 * Generate UUID v4
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return radians * (180 / Math.PI);
}

/**
 * Safe parse float (returns 0 for invalid)
 */
export function safeParseFloat(value: string, defaultValue = 0): number {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Safe parse int (returns 0 for invalid)
 */
export function safeParseInt(value: string, radix = 10, defaultValue = 0): number {
  const parsed = parseInt(value, radix);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// Comparison
// ============================================================================

/**
 * Compare numbers with epsilon tolerance
 */
export function approximately(a: number, b: number, epsilon = 0.0001): number {
  return Math.abs(a - b) < epsilon ? 0 : a - b;
}

/**
 * Check if numbers are approximately equal
 */
export function isApproximatelyEqual(a: number, b: number, epsilon = 0.0001): boolean {
  return Math.abs(a - b) < epsilon;
}
