/**
 * Date and Time Utilities
 *
 * Provides comprehensive date/time manipulation functions:
 * - Date formatting and parsing
 * - Date arithmetic
 * - Time zone handling
 * - Duration formatting
 * - Relative time display
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Duration in components
 */
export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

/**
 * Date format options
 */
export interface DateFormatOptions {
  locale?: string;
  timeZone?: string;
}

/**
 * Relative time thresholds
 */
export interface RelativeTimeThresholds {
  seconds?: number; // Max seconds before showing minutes
  minutes?: number; // Max minutes before showing hours
  hours?: number; // Max hours before showing days
  days?: number; // Max days before showing weeks
  weeks?: number; // Max weeks before showing months
  months?: number; // Max months before showing years
}

// ============================================================================
// Date Creation
// ============================================================================

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Create date from various inputs
 */
export function toDate(input: Date | number | string): Date {
  if (input instanceof Date) {
    return new Date(input.getTime());
  }
  return new Date(input);
}

/**
 * Get start of day
 */
export function startOfDay(date: Date | number | string): Date {
  const d = toDate(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date | number | string): Date {
  const d = toDate(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Get start of week (Sunday)
 */
export function startOfWeek(date: Date | number | string, weekStartsOn = 0): Date {
  const d = toDate(date);
  const day = d.getDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  d.setDate(d.getDate() - diff);
  return startOfDay(d);
}

/**
 * Get start of month
 */
export function startOfMonth(date: Date | number | string): Date {
  const d = toDate(date);
  d.setDate(1);
  return startOfDay(d);
}

/**
 * Get end of month
 */
export function endOfMonth(date: Date | number | string): Date {
  const d = toDate(date);
  d.setMonth(d.getMonth() + 1, 0);
  return endOfDay(d);
}

/**
 * Get start of year
 */
export function startOfYear(date: Date | number | string): Date {
  const d = toDate(date);
  d.setMonth(0, 1);
  return startOfDay(d);
}

/**
 * Get end of year
 */
export function endOfYear(date: Date | number | string): Date {
  const d = toDate(date);
  d.setMonth(11, 31);
  return endOfDay(d);
}

// ============================================================================
// Date Arithmetic
// ============================================================================

/**
 * Add milliseconds to date
 */
export function addMilliseconds(date: Date | number | string, amount: number): Date {
  return new Date(toDate(date).getTime() + amount);
}

/**
 * Add seconds to date
 */
export function addSeconds(date: Date | number | string, amount: number): Date {
  return addMilliseconds(date, amount * 1000);
}

/**
 * Add minutes to date
 */
export function addMinutes(date: Date | number | string, amount: number): Date {
  return addMilliseconds(date, amount * 60 * 1000);
}

/**
 * Add hours to date
 */
export function addHours(date: Date | number | string, amount: number): Date {
  return addMilliseconds(date, amount * 60 * 60 * 1000);
}

/**
 * Add days to date
 */
export function addDays(date: Date | number | string, amount: number): Date {
  const d = toDate(date);
  d.setDate(d.getDate() + amount);
  return d;
}

/**
 * Add weeks to date
 */
export function addWeeks(date: Date | number | string, amount: number): Date {
  return addDays(date, amount * 7);
}

/**
 * Add months to date
 */
export function addMonths(date: Date | number | string, amount: number): Date {
  const d = toDate(date);
  const dayOfMonth = d.getDate();
  d.setMonth(d.getMonth() + amount);

  // Handle month overflow (e.g., Jan 31 + 1 month should be Feb 28/29)
  if (d.getDate() !== dayOfMonth) {
    d.setDate(0); // Set to last day of previous month
  }

  return d;
}

/**
 * Add years to date
 */
export function addYears(date: Date | number | string, amount: number): Date {
  return addMonths(date, amount * 12);
}

/**
 * Subtract duration from date
 */
export function subtract(
  date: Date | number | string,
  amount: number,
  unit: 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y'
): Date {
  const multiplier = -1;
  switch (unit) {
    case 'ms':
      return addMilliseconds(date, amount * multiplier);
    case 's':
      return addSeconds(date, amount * multiplier);
    case 'm':
      return addMinutes(date, amount * multiplier);
    case 'h':
      return addHours(date, amount * multiplier);
    case 'd':
      return addDays(date, amount * multiplier);
    case 'w':
      return addWeeks(date, amount * multiplier);
    case 'M':
      return addMonths(date, amount * multiplier);
    case 'y':
      return addYears(date, amount * multiplier);
    default:
      return toDate(date);
  }
}

// ============================================================================
// Date Comparison
// ============================================================================

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date | number | string, date2: Date | number | string): boolean {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Check if two dates are the same month
 */
export function isSameMonth(date1: Date | number | string, date2: Date | number | string): boolean {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
}

/**
 * Check if two dates are the same year
 */
export function isSameYear(date1: Date | number | string, date2: Date | number | string): boolean {
  return toDate(date1).getFullYear() === toDate(date2).getFullYear();
}

/**
 * Check if date is before another
 */
export function isBefore(date: Date | number | string, dateToCompare: Date | number | string): boolean {
  return toDate(date).getTime() < toDate(dateToCompare).getTime();
}

/**
 * Check if date is after another
 */
export function isAfter(date: Date | number | string, dateToCompare: Date | number | string): boolean {
  return toDate(date).getTime() > toDate(dateToCompare).getTime();
}

/**
 * Check if date is between two dates
 */
export function isBetween(
  date: Date | number | string,
  start: Date | number | string,
  end: Date | number | string,
  inclusive = true
): boolean {
  const time = toDate(date).getTime();
  const startTime = toDate(start).getTime();
  const endTime = toDate(end).getTime();

  if (inclusive) {
    return time >= startTime && time <= endTime;
  }
  return time > startTime && time < endTime;
}

/**
 * Check if date is today
 */
export function isToday(date: Date | number | string): boolean {
  return isSameDay(date, new Date());
}

/**
 * Check if date is yesterday
 */
export function isYesterday(date: Date | number | string): boolean {
  return isSameDay(date, addDays(new Date(), -1));
}

/**
 * Check if date is tomorrow
 */
export function isTomorrow(date: Date | number | string): boolean {
  return isSameDay(date, addDays(new Date(), 1));
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date | number | string): boolean {
  return toDate(date).getTime() < Date.now();
}

/**
 * Check if date is in the future
 */
export function isFuture(date: Date | number | string): boolean {
  return toDate(date).getTime() > Date.now();
}

/**
 * Check if year is a leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// ============================================================================
// Date Difference
// ============================================================================

/**
 * Get difference in milliseconds
 */
export function differenceInMilliseconds(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return toDate(date1).getTime() - toDate(date2).getTime();
}

/**
 * Get difference in seconds
 */
export function differenceInSeconds(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return Math.floor(differenceInMilliseconds(date1, date2) / 1000);
}

/**
 * Get difference in minutes
 */
export function differenceInMinutes(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return Math.floor(differenceInMilliseconds(date1, date2) / (1000 * 60));
}

/**
 * Get difference in hours
 */
export function differenceInHours(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return Math.floor(differenceInMilliseconds(date1, date2) / (1000 * 60 * 60));
}

/**
 * Get difference in days
 */
export function differenceInDays(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return Math.floor(differenceInMilliseconds(date1, date2) / (1000 * 60 * 60 * 24));
}

/**
 * Get difference in weeks
 */
export function differenceInWeeks(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return Math.floor(differenceInDays(date1, date2) / 7);
}

/**
 * Get difference in months (approximate)
 */
export function differenceInMonths(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  return (d1.getFullYear() - d2.getFullYear()) * 12 + (d1.getMonth() - d2.getMonth());
}

/**
 * Get difference in years
 */
export function differenceInYears(
  date1: Date | number | string,
  date2: Date | number | string
): number {
  return toDate(date1).getFullYear() - toDate(date2).getFullYear();
}

// ============================================================================
// Duration
// ============================================================================

/**
 * Parse milliseconds to duration components
 */
export function parseDuration(ms: number): Duration {
  const absMs = Math.abs(ms);

  const days = Math.floor(absMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((absMs % (1000 * 60)) / 1000);
  const milliseconds = absMs % 1000;

  return { days, hours, minutes, seconds, milliseconds };
}

/**
 * Convert duration to milliseconds
 */
export function durationToMs(duration: Partial<Duration>): number {
  return (
    (duration.days || 0) * 24 * 60 * 60 * 1000 +
    (duration.hours || 0) * 60 * 60 * 1000 +
    (duration.minutes || 0) * 60 * 1000 +
    (duration.seconds || 0) * 1000 +
    (duration.milliseconds || 0)
  );
}

/**
 * Format duration as human-readable string
 */
export function formatDuration(
  ms: number,
  options?: {
    compact?: boolean;
    maxUnits?: number;
    includeMs?: boolean;
  }
): string {
  const { compact = false, maxUnits = 2, includeMs = false } = options || {};
  const duration = parseDuration(ms);

  const parts: string[] = [];

  if (duration.days > 0) {
    parts.push(compact ? `${duration.days}d` : `${duration.days} day${duration.days !== 1 ? 's' : ''}`);
  }
  if (duration.hours > 0) {
    parts.push(compact ? `${duration.hours}h` : `${duration.hours} hour${duration.hours !== 1 ? 's' : ''}`);
  }
  if (duration.minutes > 0) {
    parts.push(compact ? `${duration.minutes}m` : `${duration.minutes} minute${duration.minutes !== 1 ? 's' : ''}`);
  }
  if (duration.seconds > 0 || parts.length === 0) {
    parts.push(compact ? `${duration.seconds}s` : `${duration.seconds} second${duration.seconds !== 1 ? 's' : ''}`);
  }
  if (includeMs && duration.milliseconds > 0) {
    parts.push(compact ? `${duration.milliseconds}ms` : `${duration.milliseconds} millisecond${duration.milliseconds !== 1 ? 's' : ''}`);
  }

  return parts.slice(0, maxUnits).join(compact ? ' ' : ', ');
}

/**
 * Format milliseconds as MM:SS or HH:MM:SS
 */
export function formatTime(ms: number, includeHours = false): string {
  const duration = parseDuration(ms);
  const totalHours = duration.days * 24 + duration.hours;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (includeHours || totalHours > 0) {
    return `${pad(totalHours)}:${pad(duration.minutes)}:${pad(duration.seconds)}`;
  }

  return `${pad(duration.minutes)}:${pad(duration.seconds)}`;
}

// ============================================================================
// Relative Time
// ============================================================================

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(
  date: Date | number | string,
  baseDate: Date | number | string = new Date(),
  options?: {
    thresholds?: RelativeTimeThresholds;
    locale?: string;
  }
): string {
  const { thresholds, locale = 'en' } = options || {};
  const defaults: RelativeTimeThresholds = {
    seconds: 60,
    minutes: 60,
    hours: 24,
    days: 7,
    weeks: 4,
    months: 12,
    ...thresholds,
  };

  const diff = differenceInMilliseconds(date, baseDate);
  const absDiff = Math.abs(diff);
  const isPastDate = diff < 0;

  const seconds = Math.floor(absDiff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let value: number;
  let unit: Intl.RelativeTimeFormatUnit;

  if (seconds < defaults.seconds!) {
    value = seconds;
    unit = 'second';
  } else if (minutes < defaults.minutes!) {
    value = minutes;
    unit = 'minute';
  } else if (hours < defaults.hours!) {
    value = hours;
    unit = 'hour';
  } else if (days < defaults.days!) {
    value = days;
    unit = 'day';
  } else if (weeks < defaults.weeks!) {
    value = weeks;
    unit = 'week';
  } else if (months < defaults.months!) {
    value = months;
    unit = 'month';
  } else {
    value = years;
    unit = 'year';
  }

  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return rtf.format(isPastDate ? -value : value, unit);
  } catch {
    // Fallback for environments without Intl.RelativeTimeFormat
    const suffix = isPastDate ? 'ago' : 'from now';
    const plural = value !== 1 ? 's' : '';
    return `${value} ${unit}${plural} ${suffix}`;
  }
}

/**
 * Get short relative time (e.g., "2h", "3d")
 */
export function formatRelativeTimeShort(
  date: Date | number | string,
  baseDate: Date | number | string = new Date()
): string {
  const diff = Math.abs(differenceInMilliseconds(date, baseDate));

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// ============================================================================
// Date Formatting
// ============================================================================

/**
 * Format date as ISO string
 */
export function toISOString(date: Date | number | string): string {
  return toDate(date).toISOString();
}

/**
 * Format date as ISO date only (YYYY-MM-DD)
 */
export function toISODate(date: Date | number | string): string {
  return toISOString(date).split('T')[0];
}

/**
 * Format date as ISO time only (HH:MM:SS)
 */
export function toISOTime(date: Date | number | string): string {
  return toISOString(date).split('T')[1].split('.')[0];
}

/**
 * Format date using Intl.DateTimeFormat
 */
export function formatDate(
  date: Date | number | string,
  options?: Intl.DateTimeFormatOptions & DateFormatOptions
): string {
  const { locale = 'en', timeZone, ...formatOptions } = options || {};

  const formatter = new Intl.DateTimeFormat(locale, {
    ...formatOptions,
    timeZone,
  });

  return formatter.format(toDate(date));
}

/**
 * Format date in short format (e.g., "Jan 1, 2024")
 */
export function formatDateShort(date: Date | number | string, options?: DateFormatOptions): string {
  return formatDate(date, {
    ...options,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date in long format (e.g., "January 1, 2024")
 */
export function formatDateLong(date: Date | number | string, options?: DateFormatOptions): string {
  return formatDate(date, {
    ...options,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date and time
 */
export function formatDateTime(date: Date | number | string, options?: DateFormatOptions): string {
  return formatDate(date, {
    ...options,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format time only
 */
export function formatTimeOnly(date: Date | number | string, options?: DateFormatOptions): string {
  return formatDate(date, {
    ...options,
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get days in month
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get days in year
 */
export function getDaysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/**
 * Get day of year (1-366)
 */
export function getDayOfYear(date: Date | number | string): number {
  const d = toDate(date);
  const start = startOfYear(d);
  return Math.floor(differenceInMilliseconds(d, start) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Get week of year
 */
export function getWeekOfYear(date: Date | number | string): number {
  const d = toDate(date);
  const firstDayOfYear = startOfYear(d);
  const pastDaysOfYear = differenceInDays(d, firstDayOfYear);
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Get quarter (1-4)
 */
export function getQuarter(date: Date | number | string): number {
  return Math.floor(toDate(date).getMonth() / 3) + 1;
}

/**
 * Clamp date between min and max
 */
export function clampDate(
  date: Date | number | string,
  minDate: Date | number | string,
  maxDate: Date | number | string
): Date {
  const d = toDate(date);
  const min = toDate(minDate);
  const max = toDate(maxDate);

  if (d < min) return min;
  if (d > max) return max;
  return d;
}

/**
 * Get the minimum date
 */
export function minDate(...dates: (Date | number | string)[]): Date {
  return new Date(Math.min(...dates.map((d) => toDate(d).getTime())));
}

/**
 * Get the maximum date
 */
export function maxDate(...dates: (Date | number | string)[]): Date {
  return new Date(Math.max(...dates.map((d) => toDate(d).getTime())));
}
