/**
 * Array and Collection Utilities
 *
 * Provides comprehensive array manipulation functions:
 * - Filtering and searching
 * - Grouping and partitioning
 * - Sorting and ordering
 * - Set operations (union, intersection, difference)
 * - Array transformations
 * - Pagination and chunking
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Comparator function type
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Predicate function type
 */
export type Predicate<T> = (item: T, index: number, array: T[]) => boolean;

/**
 * Key selector function type
 */
export type KeySelector<T, K> = (item: T) => K;

/**
 * Pagination result
 */
export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ============================================================================
// Basic Operations
// ============================================================================

/**
 * Get first element or undefined
 */
export function first<T>(array: T[]): T | undefined {
  return array[0];
}

/**
 * Get last element or undefined
 */
export function last<T>(array: T[]): T | undefined {
  return array[array.length - 1];
}

/**
 * Get nth element with negative index support
 */
export function nth<T>(array: T[], index: number): T | undefined {
  const idx = index < 0 ? array.length + index : index;
  return array[idx];
}

/**
 * Get first element or throw if empty
 */
export function firstOrThrow<T>(array: T[], message = 'Array is empty'): T {
  if (array.length === 0) throw new Error(message);
  return array[0];
}

/**
 * Get first element matching predicate
 */
export function firstWhere<T>(array: T[], predicate: Predicate<T>): T | undefined {
  return array.find(predicate);
}

/**
 * Get last element matching predicate
 */
export function lastWhere<T>(array: T[], predicate: Predicate<T>): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i, array)) {
      return array[i];
    }
  }
  return undefined;
}

/**
 * Check if array is empty
 */
export function isEmpty<T>(array: T[]): boolean {
  return array.length === 0;
}

/**
 * Check if array is not empty
 */
export function isNotEmpty<T>(array: T[]): boolean {
  return array.length > 0;
}

// ============================================================================
// Filtering
// ============================================================================

/**
 * Filter out null and undefined values
 */
export function compact<T>(array: (T | null | undefined)[]): T[] {
  return array.filter((item): item is T => item !== null && item !== undefined);
}

/**
 * Filter out falsy values
 */
export function truthy<T>(array: (T | null | undefined | false | 0 | '')[]): T[] {
  return array.filter(Boolean) as T[];
}

/**
 * Remove duplicates
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Remove duplicates by key
 */
export function uniqueBy<T, K>(array: T[], keySelector: KeySelector<T, K>): T[] {
  const seen = new Set<K>();
  return array.filter((item) => {
    const key = keySelector(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Filter with index
 */
export function filterWithIndex<T>(
  array: T[],
  predicate: (item: T, index: number) => boolean
): T[] {
  return array.filter((item, index) => predicate(item, index));
}

/**
 * Take first n elements
 */
export function take<T>(array: T[], count: number): T[] {
  return array.slice(0, Math.max(0, count));
}

/**
 * Take last n elements
 */
export function takeLast<T>(array: T[], count: number): T[] {
  return array.slice(Math.max(0, array.length - count));
}

/**
 * Take elements while predicate is true
 */
export function takeWhile<T>(array: T[], predicate: Predicate<T>): T[] {
  const result: T[] = [];
  for (let i = 0; i < array.length; i++) {
    if (!predicate(array[i], i, array)) break;
    result.push(array[i]);
  }
  return result;
}

/**
 * Skip first n elements
 */
export function skip<T>(array: T[], count: number): T[] {
  return array.slice(Math.max(0, count));
}

/**
 * Skip elements while predicate is true
 */
export function skipWhile<T>(array: T[], predicate: Predicate<T>): T[] {
  let startIndex = 0;
  for (let i = 0; i < array.length; i++) {
    if (!predicate(array[i], i, array)) {
      startIndex = i;
      break;
    }
    if (i === array.length - 1) {
      return [];
    }
  }
  return array.slice(startIndex);
}

// ============================================================================
// Grouping and Partitioning
// ============================================================================

/**
 * Group array by key
 */
export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keySelector: KeySelector<T, K>
): Record<K, T[]> {
  return array.reduce(
    (groups, item) => {
      const key = keySelector(item);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    },
    {} as Record<K, T[]>
  );
}

/**
 * Group array by key into Map
 */
export function groupByMap<T, K>(array: T[], keySelector: KeySelector<T, K>): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of array) {
    const key = keySelector(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

/**
 * Partition array into two arrays based on predicate
 */
export function partition<T>(array: T[], predicate: Predicate<T>): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];

  for (let i = 0; i < array.length; i++) {
    if (predicate(array[i], i, array)) {
      pass.push(array[i]);
    } else {
      fail.push(array[i]);
    }
  }

  return [pass, fail];
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (size <= 0) return [array];

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sliding window over array
 */
export function sliding<T>(array: T[], windowSize: number, step = 1): T[][] {
  if (windowSize <= 0 || step <= 0) return [];

  const windows: T[][] = [];
  for (let i = 0; i <= array.length - windowSize; i += step) {
    windows.push(array.slice(i, i + windowSize));
  }
  return windows;
}

// ============================================================================
// Sorting
// ============================================================================

/**
 * Sort by key
 */
export function sortBy<T, K>(
  array: T[],
  keySelector: KeySelector<T, K>,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...array].sort((a, b) => {
    const keyA = keySelector(a);
    const keyB = keySelector(b);
    const comparison = keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    return order === 'asc' ? comparison : -comparison;
  });
}

/**
 * Sort by multiple keys
 */
export function sortByMultiple<T>(
  array: T[],
  ...comparators: Comparator<T>[]
): T[] {
  return [...array].sort((a, b) => {
    for (const comparator of comparators) {
      const result = comparator(a, b);
      if (result !== 0) return result;
    }
    return 0;
  });
}

/**
 * Create a comparator from key selector
 */
export function compareBy<T, K>(
  keySelector: KeySelector<T, K>,
  order: 'asc' | 'desc' = 'asc'
): Comparator<T> {
  return (a, b) => {
    const keyA = keySelector(a);
    const keyB = keySelector(b);
    const comparison = keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    return order === 'asc' ? comparison : -comparison;
  };
}

/**
 * Reverse array (immutable)
 */
export function reverse<T>(array: T[]): T[] {
  return [...array].reverse();
}

/**
 * Shuffle array (Fisher-Yates)
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============================================================================
// Set Operations
// ============================================================================

/**
 * Union of two arrays
 */
export function union<T>(array1: T[], array2: T[]): T[] {
  return [...new Set([...array1, ...array2])];
}

/**
 * Intersection of two arrays
 */
export function intersection<T>(array1: T[], array2: T[]): T[] {
  const set2 = new Set(array2);
  return [...new Set(array1)].filter((item) => set2.has(item));
}

/**
 * Difference (items in array1 but not in array2)
 */
export function difference<T>(array1: T[], array2: T[]): T[] {
  const set2 = new Set(array2);
  return array1.filter((item) => !set2.has(item));
}

/**
 * Symmetric difference (items in either but not both)
 */
export function symmetricDifference<T>(array1: T[], array2: T[]): T[] {
  return [...difference(array1, array2), ...difference(array2, array1)];
}

/**
 * Check if array1 is subset of array2
 */
export function isSubset<T>(subset: T[], superset: T[]): boolean {
  const superSet = new Set(superset);
  return subset.every((item) => superSet.has(item));
}

/**
 * Check if arrays have any common elements
 */
export function hasIntersection<T>(array1: T[], array2: T[]): boolean {
  const set2 = new Set(array2);
  return array1.some((item) => set2.has(item));
}

// ============================================================================
// Transformations
// ============================================================================

/**
 * Flatten nested arrays
 */
export function flatten<T>(array: (T | T[])[]): T[] {
  return array.flat() as T[];
}

/**
 * Deep flatten
 */
export function flattenDeep<T>(array: unknown[]): T[] {
  return array.flat(Infinity) as T[];
}

/**
 * Map and flatten
 */
export function flatMap<T, U>(array: T[], mapper: (item: T, index: number) => U[]): U[] {
  return array.flatMap(mapper);
}

/**
 * Zip multiple arrays together
 */
export function zip<T>(...arrays: T[][]): T[][] {
  const maxLength = Math.max(...arrays.map((a) => a.length));
  const result: T[][] = [];

  for (let i = 0; i < maxLength; i++) {
    result.push(arrays.map((a) => a[i]));
  }

  return result;
}

/**
 * Zip two arrays into tuples
 */
export function zipWith<T, U>(array1: T[], array2: U[]): [T, U][] {
  const length = Math.min(array1.length, array2.length);
  const result: [T, U][] = [];

  for (let i = 0; i < length; i++) {
    result.push([array1[i], array2[i]]);
  }

  return result;
}

/**
 * Unzip array of tuples
 */
export function unzip<T, U>(array: [T, U][]): [T[], U[]] {
  return [array.map((pair) => pair[0]), array.map((pair) => pair[1])];
}

/**
 * Create array from range
 */
export function range(start: number, end: number, step = 1): number[] {
  if (step === 0) return [];

  const result: number[] = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      result.push(i);
    }
  } else {
    for (let i = start; i > end; i += step) {
      result.push(i);
    }
  }
  return result;
}

/**
 * Create array of specified length filled with value
 */
export function fill<T>(length: number, value: T): T[] {
  return Array(length).fill(value);
}

/**
 * Create array using generator function
 */
export function generate<T>(length: number, generator: (index: number) => T): T[] {
  return Array.from({ length }, (_, i) => generator(i));
}

// ============================================================================
// Aggregation
// ============================================================================

/**
 * Sum of numbers
 */
export function sum(array: number[]): number {
  return array.reduce((acc, n) => acc + n, 0);
}

/**
 * Sum by key
 */
export function sumBy<T>(array: T[], selector: KeySelector<T, number>): number {
  return array.reduce((acc, item) => acc + selector(item), 0);
}

/**
 * Average of numbers
 */
export function average(array: number[]): number {
  if (array.length === 0) return 0;
  return sum(array) / array.length;
}

/**
 * Average by key
 */
export function averageBy<T>(array: T[], selector: KeySelector<T, number>): number {
  if (array.length === 0) return 0;
  return sumBy(array, selector) / array.length;
}

/**
 * Min value
 */
export function min(array: number[]): number | undefined {
  if (array.length === 0) return undefined;
  return Math.min(...array);
}

/**
 * Min by key
 */
export function minBy<T>(array: T[], selector: KeySelector<T, number>): T | undefined {
  if (array.length === 0) return undefined;
  return array.reduce((min, item) => (selector(item) < selector(min) ? item : min));
}

/**
 * Max value
 */
export function max(array: number[]): number | undefined {
  if (array.length === 0) return undefined;
  return Math.max(...array);
}

/**
 * Max by key
 */
export function maxBy<T>(array: T[], selector: KeySelector<T, number>): T | undefined {
  if (array.length === 0) return undefined;
  return array.reduce((max, item) => (selector(item) > selector(max) ? item : max));
}

/**
 * Count items matching predicate
 */
export function count<T>(array: T[], predicate: Predicate<T>): number {
  return array.filter(predicate).length;
}

// ============================================================================
// Searching
// ============================================================================

/**
 * Binary search (array must be sorted)
 */
export function binarySearch<T>(array: T[], target: T, comparator?: Comparator<T>): number {
  const compare = comparator || ((a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0));
  let low = 0;
  let high = array.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const comparison = compare(array[mid], target);

    if (comparison === 0) {
      return mid;
    } else if (comparison < 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return -1;
}

/**
 * Find index of item matching predicate
 */
export function findIndex<T>(array: T[], predicate: Predicate<T>): number {
  return array.findIndex(predicate);
}

/**
 * Find last index of item matching predicate
 */
export function findLastIndex<T>(array: T[], predicate: Predicate<T>): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i, array)) {
      return i;
    }
  }
  return -1;
}

/**
 * Check if all items match predicate
 */
export function all<T>(array: T[], predicate: Predicate<T>): boolean {
  return array.every(predicate);
}

/**
 * Check if any item matches predicate
 */
export function any<T>(array: T[], predicate: Predicate<T>): boolean {
  return array.some(predicate);
}

/**
 * Check if no items match predicate
 */
export function none<T>(array: T[], predicate: Predicate<T>): boolean {
  return !array.some(predicate);
}

// ============================================================================
// Pagination
// ============================================================================

/**
 * Paginate array
 */
export function paginate<T>(
  array: T[],
  page: number,
  pageSize: number
): PaginationResult<T> {
  const totalItems = array.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = Math.max(1, Math.min(page, totalPages || 1));
  const startIndex = (currentPage - 1) * pageSize;
  const items = array.slice(startIndex, startIndex + pageSize);

  return {
    items,
    page: currentPage,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}

// ============================================================================
// Object/Map Utilities
// ============================================================================

/**
 * Convert array to Map by key
 */
export function toMap<T, K>(array: T[], keySelector: KeySelector<T, K>): Map<K, T> {
  return new Map(array.map((item) => [keySelector(item), item]));
}

/**
 * Convert array to Record by key
 */
export function toRecord<T, K extends string | number | symbol>(
  array: T[],
  keySelector: KeySelector<T, K>
): Record<K, T> {
  return array.reduce(
    (record, item) => {
      record[keySelector(item)] = item;
      return record;
    },
    {} as Record<K, T>
  );
}

/**
 * Get entries from object as array
 */
export function entries<K extends string | number | symbol, V>(
  obj: Record<K, V>
): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

/**
 * Get keys from object as array
 */
export function keys<K extends string | number | symbol>(obj: Record<K, unknown>): K[] {
  return Object.keys(obj) as K[];
}

/**
 * Get values from object as array
 */
export function values<V>(obj: Record<string | number | symbol, V>): V[] {
  return Object.values(obj);
}

/**
 * Create object from entries
 */
export function fromEntries<K extends string | number | symbol, V>(
  entries: Iterable<[K, V]>
): Record<K, V> {
  return Object.fromEntries(entries) as Record<K, V>;
}
