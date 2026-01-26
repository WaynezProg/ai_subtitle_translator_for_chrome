/**
 * Tests for Date and Time Utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toDate,
  startOfDay,
  endOfDay,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addMilliseconds,
  addSeconds,
  addMinutes,
  addHours,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  subtract,
  isSameDay,
  isSameMonth,
  isSameYear,
  isBefore,
  isAfter,
  isBetween,
  isToday,
  isYesterday,
  isTomorrow,
  isPast,
  isFuture,
  isLeapYear,
  differenceInMilliseconds,
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
  differenceInMonths,
  differenceInYears,
  parseDuration,
  durationToMs,
  formatDuration,
  formatTime,
  formatRelativeTime,
  formatRelativeTimeShort,
  toISOString,
  toISODate,
  toISOTime,
  formatDate,
  formatDateShort,
  formatDateLong,
  getDaysInMonth,
  getDaysInYear,
  getDayOfYear,
  getWeekOfYear,
  getQuarter,
  clampDate,
  minDate,
  maxDate,
} from '@shared/utils/date-utils';

// ============================================================================
// Date Creation Tests
// ============================================================================

describe('Date Creation', () => {
  describe('toDate', () => {
    it('should handle Date objects', () => {
      const date = new Date('2024-01-15');
      const result = toDate(date);

      expect(result.getTime()).toBe(date.getTime());
      expect(result).not.toBe(date); // Should be a copy
    });

    it('should handle timestamps', () => {
      const timestamp = 1705276800000;
      const result = toDate(timestamp);

      expect(result.getTime()).toBe(timestamp);
    });

    it('should handle ISO strings', () => {
      const result = toDate('2024-01-15T00:00:00.000Z');

      expect(result.toISOString()).toBe('2024-01-15T00:00:00.000Z');
    });
  });

  describe('startOfDay', () => {
    it('should return start of day', () => {
      const date = new Date('2024-01-15T14:30:45.123Z');
      const result = startOfDay(date);

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('endOfDay', () => {
    it('should return end of day', () => {
      const date = new Date('2024-01-15T14:30:45.123Z');
      const result = endOfDay(date);

      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });
  });

  describe('startOfWeek', () => {
    it('should return start of week (Sunday)', () => {
      const date = new Date('2024-01-17'); // Wednesday
      const result = startOfWeek(date);

      expect(result.getDay()).toBe(0); // Sunday
      expect(result.getDate()).toBe(14);
    });

    it('should handle custom week start', () => {
      const date = new Date('2024-01-17'); // Wednesday
      const result = startOfWeek(date, 1); // Monday

      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(15);
    });
  });

  describe('startOfMonth', () => {
    it('should return first day of month', () => {
      const date = new Date('2024-01-15');
      const result = startOfMonth(date);

      expect(result.getDate()).toBe(1);
    });
  });

  describe('endOfMonth', () => {
    it('should return last day of month', () => {
      const date = new Date('2024-01-15');
      const result = endOfMonth(date);

      expect(result.getDate()).toBe(31);
    });

    it('should handle February in leap year', () => {
      const date = new Date('2024-02-15');
      const result = endOfMonth(date);

      expect(result.getDate()).toBe(29);
    });
  });

  describe('startOfYear', () => {
    it('should return January 1st', () => {
      const date = new Date('2024-06-15');
      const result = startOfYear(date);

      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
    });
  });

  describe('endOfYear', () => {
    it('should return December 31st', () => {
      const date = new Date('2024-06-15');
      const result = endOfYear(date);

      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(31);
    });
  });
});

// ============================================================================
// Date Arithmetic Tests
// ============================================================================

describe('Date Arithmetic', () => {
  const baseDate = new Date('2024-01-15T12:00:00.000Z');

  describe('addMilliseconds', () => {
    it('should add milliseconds', () => {
      expect(addMilliseconds(baseDate, 500).getMilliseconds()).toBe(500);
    });
  });

  describe('addSeconds', () => {
    it('should add seconds', () => {
      expect(addSeconds(baseDate, 30).getSeconds()).toBe(30);
    });
  });

  describe('addMinutes', () => {
    it('should add minutes', () => {
      expect(addMinutes(baseDate, 30).getMinutes()).toBe(30);
    });
  });

  describe('addHours', () => {
    it('should add hours', () => {
      expect(addHours(baseDate, 5).getUTCHours()).toBe(17);
    });
  });

  describe('addDays', () => {
    it('should add days', () => {
      expect(addDays(baseDate, 10).getDate()).toBe(25);
    });

    it('should handle month overflow', () => {
      expect(addDays(baseDate, 20).getMonth()).toBe(1); // February
    });
  });

  describe('addWeeks', () => {
    it('should add weeks', () => {
      expect(addWeeks(baseDate, 2).getDate()).toBe(29);
    });
  });

  describe('addMonths', () => {
    it('should add months', () => {
      expect(addMonths(baseDate, 2).getMonth()).toBe(2); // March
    });

    it('should handle day overflow', () => {
      const jan31 = new Date('2024-01-31');
      const result = addMonths(jan31, 1);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(29); // Feb 29 in leap year
    });
  });

  describe('addYears', () => {
    it('should add years', () => {
      expect(addYears(baseDate, 2).getFullYear()).toBe(2026);
    });
  });

  describe('subtract', () => {
    it('should subtract days', () => {
      expect(subtract(baseDate, 5, 'd').getDate()).toBe(10);
    });

    it('should subtract months', () => {
      expect(subtract(baseDate, 2, 'M').getMonth()).toBe(10); // November
    });
  });
});

// ============================================================================
// Date Comparison Tests
// ============================================================================

describe('Date Comparison', () => {
  describe('isSameDay', () => {
    it('should return true for same day', () => {
      const date1 = new Date('2024-01-15T10:00:00');
      const date2 = new Date('2024-01-15T20:00:00');
      expect(isSameDay(date1, date2)).toBe(true);
    });

    it('should return false for different days', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-16');
      expect(isSameDay(date1, date2)).toBe(false);
    });
  });

  describe('isSameMonth', () => {
    it('should return true for same month', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-01-31');
      expect(isSameMonth(date1, date2)).toBe(true);
    });
  });

  describe('isSameYear', () => {
    it('should return true for same year', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-12-31');
      expect(isSameYear(date1, date2)).toBe(true);
    });
  });

  describe('isBefore', () => {
    it('should return true if before', () => {
      expect(isBefore('2024-01-01', '2024-01-02')).toBe(true);
    });
  });

  describe('isAfter', () => {
    it('should return true if after', () => {
      expect(isAfter('2024-01-02', '2024-01-01')).toBe(true);
    });
  });

  describe('isBetween', () => {
    it('should return true if between inclusive', () => {
      expect(isBetween('2024-01-15', '2024-01-01', '2024-01-31')).toBe(true);
      expect(isBetween('2024-01-01', '2024-01-01', '2024-01-31')).toBe(true);
    });

    it('should handle exclusive mode', () => {
      expect(isBetween('2024-01-01', '2024-01-01', '2024-01-31', false)).toBe(false);
    });
  });

  describe('isToday/isYesterday/isTomorrow', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should detect today', () => {
      expect(isToday(new Date('2024-01-15T10:00:00'))).toBe(true);
      expect(isToday(new Date('2024-01-16'))).toBe(false);
    });

    it('should detect yesterday', () => {
      expect(isYesterday(new Date('2024-01-14'))).toBe(true);
    });

    it('should detect tomorrow', () => {
      expect(isTomorrow(new Date('2024-01-16'))).toBe(true);
    });
  });

  describe('isPast/isFuture', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should detect past', () => {
      expect(isPast(new Date('2024-01-14'))).toBe(true);
      expect(isPast(new Date('2024-01-16'))).toBe(false);
    });

    it('should detect future', () => {
      expect(isFuture(new Date('2024-01-16'))).toBe(true);
      expect(isFuture(new Date('2024-01-14'))).toBe(false);
    });
  });

  describe('isLeapYear', () => {
    it('should detect leap years', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2023)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(1900)).toBe(false);
    });
  });
});

// ============================================================================
// Date Difference Tests
// ============================================================================

describe('Date Difference', () => {
  const date1 = new Date('2024-01-15T12:00:00');
  const date2 = new Date('2024-01-14T12:00:00');

  it('should calculate difference in milliseconds', () => {
    expect(differenceInMilliseconds(date1, date2)).toBe(24 * 60 * 60 * 1000);
  });

  it('should calculate difference in seconds', () => {
    expect(differenceInSeconds(date1, date2)).toBe(24 * 60 * 60);
  });

  it('should calculate difference in minutes', () => {
    expect(differenceInMinutes(date1, date2)).toBe(24 * 60);
  });

  it('should calculate difference in hours', () => {
    expect(differenceInHours(date1, date2)).toBe(24);
  });

  it('should calculate difference in days', () => {
    expect(differenceInDays(date1, date2)).toBe(1);
  });

  it('should calculate difference in weeks', () => {
    const date3 = new Date('2024-01-22T12:00:00');
    expect(differenceInWeeks(date3, date2)).toBe(1);
  });

  it('should calculate difference in months', () => {
    const date3 = new Date('2024-03-15');
    expect(differenceInMonths(date3, date2)).toBe(2);
  });

  it('should calculate difference in years', () => {
    const date3 = new Date('2026-01-15');
    expect(differenceInYears(date3, date2)).toBe(2);
  });
});

// ============================================================================
// Duration Tests
// ============================================================================

describe('Duration', () => {
  describe('parseDuration', () => {
    it('should parse milliseconds to components', () => {
      // 2 days, 3 hours, 4 minutes, 5 seconds, 6 ms
      const ms = 2 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000 + 4 * 60 * 1000 + 5 * 1000 + 6;
      const duration = parseDuration(ms);

      expect(duration.days).toBe(2);
      expect(duration.hours).toBe(3);
      expect(duration.minutes).toBe(4);
      expect(duration.seconds).toBe(5);
      expect(duration.milliseconds).toBe(6);
    });
  });

  describe('durationToMs', () => {
    it('should convert duration to milliseconds', () => {
      const ms = durationToMs({ days: 1, hours: 2, minutes: 30 });
      expect(ms).toBe(24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000 + 30 * 60 * 1000);
    });
  });

  describe('formatDuration', () => {
    it('should format duration in full', () => {
      const ms = 2 * 60 * 60 * 1000 + 30 * 60 * 1000; // 2h 30m
      expect(formatDuration(ms)).toBe('2 hours, 30 minutes');
    });

    it('should format duration compact', () => {
      const ms = 2 * 60 * 60 * 1000 + 30 * 60 * 1000;
      expect(formatDuration(ms, { compact: true })).toBe('2h 30m');
    });

    it('should limit units', () => {
      const ms = 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000 + 30 * 60 * 1000;
      expect(formatDuration(ms, { maxUnits: 1 })).toBe('2 days');
    });
  });

  describe('formatTime', () => {
    it('should format as MM:SS', () => {
      const ms = 5 * 60 * 1000 + 30 * 1000;
      expect(formatTime(ms)).toBe('05:30');
    });

    it('should format as HH:MM:SS', () => {
      const ms = 2 * 60 * 60 * 1000 + 5 * 60 * 1000 + 30 * 1000;
      expect(formatTime(ms, true)).toBe('02:05:30');
    });

    it('should include hours when > 0', () => {
      const ms = 65 * 60 * 1000;
      expect(formatTime(ms)).toBe('01:05:00');
    });
  });
});

// ============================================================================
// Relative Time Tests
// ============================================================================

describe('Relative Time', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatRelativeTime', () => {
    it('should format seconds ago', () => {
      const date = new Date('2024-01-15T11:59:30');
      expect(formatRelativeTime(date)).toContain('30');
    });

    it('should format minutes ago', () => {
      const date = new Date('2024-01-15T11:55:00');
      expect(formatRelativeTime(date)).toContain('5');
    });

    it('should format hours ago', () => {
      const date = new Date('2024-01-15T09:00:00');
      expect(formatRelativeTime(date)).toContain('3');
    });

    it('should format days ago', () => {
      const date = new Date('2024-01-13T12:00:00');
      expect(formatRelativeTime(date)).toContain('2');
    });
  });

  describe('formatRelativeTimeShort', () => {
    it('should format short relative time', () => {
      expect(formatRelativeTimeShort(new Date('2024-01-15T11:00:00'))).toBe('1h');
      expect(formatRelativeTimeShort(new Date('2024-01-13T12:00:00'))).toBe('2d');
      expect(formatRelativeTimeShort(new Date('2024-01-01T12:00:00'))).toBe('2w');
    });
  });
});

// ============================================================================
// Date Formatting Tests
// ============================================================================

describe('Date Formatting', () => {
  const date = new Date('2024-01-15T14:30:45.123Z');

  describe('toISOString', () => {
    it('should return ISO string', () => {
      expect(toISOString(date)).toBe('2024-01-15T14:30:45.123Z');
    });
  });

  describe('toISODate', () => {
    it('should return date only', () => {
      expect(toISODate(date)).toBe('2024-01-15');
    });
  });

  describe('toISOTime', () => {
    it('should return time only', () => {
      expect(toISOTime(date)).toBe('14:30:45');
    });
  });

  describe('formatDate', () => {
    it('should format with options', () => {
      const result = formatDate(date, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        locale: 'en-US',
        timeZone: 'UTC',
      });
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });
  });

  describe('formatDateShort', () => {
    it('should format date in short format', () => {
      const result = formatDateShort(date, { locale: 'en-US', timeZone: 'UTC' });
      expect(result).toContain('Jan');
      expect(result).toContain('15');
    });
  });

  describe('formatDateLong', () => {
    it('should format date in long format', () => {
      const result = formatDateLong(date, { locale: 'en-US', timeZone: 'UTC' });
      expect(result).toContain('January');
      expect(result).toContain('15');
    });
  });
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('Utilities', () => {
  describe('getDaysInMonth', () => {
    it('should return correct days', () => {
      expect(getDaysInMonth(2024, 0)).toBe(31); // January
      expect(getDaysInMonth(2024, 1)).toBe(29); // February (leap year)
      expect(getDaysInMonth(2023, 1)).toBe(28); // February (non-leap)
      expect(getDaysInMonth(2024, 3)).toBe(30); // April
    });
  });

  describe('getDaysInYear', () => {
    it('should return correct days', () => {
      expect(getDaysInYear(2024)).toBe(366);
      expect(getDaysInYear(2023)).toBe(365);
    });
  });

  describe('getDayOfYear', () => {
    it('should return day of year', () => {
      expect(getDayOfYear(new Date('2024-01-01'))).toBe(1);
      expect(getDayOfYear(new Date('2024-12-31'))).toBe(366);
    });
  });

  describe('getWeekOfYear', () => {
    it('should return week number', () => {
      expect(getWeekOfYear(new Date('2024-01-07'))).toBe(2);
    });
  });

  describe('getQuarter', () => {
    it('should return quarter', () => {
      expect(getQuarter(new Date('2024-01-15'))).toBe(1);
      expect(getQuarter(new Date('2024-04-15'))).toBe(2);
      expect(getQuarter(new Date('2024-07-15'))).toBe(3);
      expect(getQuarter(new Date('2024-10-15'))).toBe(4);
    });
  });

  describe('clampDate', () => {
    it('should clamp date', () => {
      const min = new Date('2024-01-01');
      const max = new Date('2024-12-31');

      expect(clampDate('2024-06-15', min, max).getTime()).toBe(new Date('2024-06-15').getTime());
      expect(clampDate('2023-06-15', min, max).getTime()).toBe(min.getTime());
      expect(clampDate('2025-06-15', min, max).getTime()).toBe(max.getTime());
    });
  });

  describe('minDate/maxDate', () => {
    it('should find min date', () => {
      const result = minDate('2024-01-15', '2024-01-01', '2024-01-31');
      expect(toISODate(result)).toBe('2024-01-01');
    });

    it('should find max date', () => {
      const result = maxDate('2024-01-15', '2024-01-01', '2024-01-31');
      expect(toISODate(result)).toBe('2024-01-31');
    });
  });
});
