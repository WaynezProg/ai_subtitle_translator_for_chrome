/**
 * Tests for Array and Collection Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  first,
  last,
  nth,
  firstOrThrow,
  firstWhere,
  lastWhere,
  isEmpty,
  isNotEmpty,
  compact,
  truthy,
  unique,
  uniqueBy,
  take,
  takeLast,
  takeWhile,
  skip,
  skipWhile,
  groupBy,
  groupByMap,
  partition,
  chunk,
  sliding,
  sortBy,
  sortByMultiple,
  compareBy,
  reverse,
  shuffle,
  union,
  intersection,
  difference,
  symmetricDifference,
  isSubset,
  hasIntersection,
  flatten,
  flattenDeep,
  flatMap,
  zip,
  zipWith,
  unzip,
  range,
  fill,
  generate,
  sum,
  sumBy,
  average,
  averageBy,
  min,
  minBy,
  max,
  maxBy,
  count,
  binarySearch,
  findIndex,
  findLastIndex,
  all,
  any,
  none,
  paginate,
  toMap,
  toRecord,
  entries,
  keys,
  values,
  fromEntries,
} from '@shared/utils/array-utils';

// ============================================================================
// Basic Operations Tests
// ============================================================================

describe('Basic Operations', () => {
  describe('first', () => {
    it('should return first element', () => {
      expect(first([1, 2, 3])).toBe(1);
    });

    it('should return undefined for empty array', () => {
      expect(first([])).toBeUndefined();
    });
  });

  describe('last', () => {
    it('should return last element', () => {
      expect(last([1, 2, 3])).toBe(3);
    });

    it('should return undefined for empty array', () => {
      expect(last([])).toBeUndefined();
    });
  });

  describe('nth', () => {
    it('should return nth element', () => {
      expect(nth([1, 2, 3], 1)).toBe(2);
    });

    it('should handle negative index', () => {
      expect(nth([1, 2, 3], -1)).toBe(3);
      expect(nth([1, 2, 3], -2)).toBe(2);
    });
  });

  describe('firstOrThrow', () => {
    it('should return first element', () => {
      expect(firstOrThrow([1, 2, 3])).toBe(1);
    });

    it('should throw for empty array', () => {
      expect(() => firstOrThrow([])).toThrow('Array is empty');
    });
  });

  describe('firstWhere', () => {
    it('should find first matching element', () => {
      expect(firstWhere([1, 2, 3, 4], (n) => n > 2)).toBe(3);
    });

    it('should return undefined if no match', () => {
      expect(firstWhere([1, 2], (n) => n > 5)).toBeUndefined();
    });
  });

  describe('lastWhere', () => {
    it('should find last matching element', () => {
      expect(lastWhere([1, 2, 3, 4], (n) => n > 2)).toBe(4);
    });
  });

  describe('isEmpty and isNotEmpty', () => {
    it('should check empty state', () => {
      expect(isEmpty([])).toBe(true);
      expect(isEmpty([1])).toBe(false);
      expect(isNotEmpty([])).toBe(false);
      expect(isNotEmpty([1])).toBe(true);
    });
  });
});

// ============================================================================
// Filtering Tests
// ============================================================================

describe('Filtering', () => {
  describe('compact', () => {
    it('should remove null and undefined', () => {
      expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('truthy', () => {
    it('should remove falsy values', () => {
      expect(truthy([1, 0, '', false, 'hello', null])).toEqual([1, 'hello']);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('uniqueBy', () => {
    it('should remove duplicates by key', () => {
      const items = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 1, name: 'c' },
      ];
      const result = uniqueBy(items, (item) => item.id);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('a');
    });
  });

  describe('take and takeLast', () => {
    it('should take first n elements', () => {
      expect(take([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
    });

    it('should take last n elements', () => {
      expect(takeLast([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
    });
  });

  describe('takeWhile', () => {
    it('should take while predicate is true', () => {
      expect(takeWhile([1, 2, 3, 4, 5], (n) => n < 4)).toEqual([1, 2, 3]);
    });
  });

  describe('skip and skipWhile', () => {
    it('should skip first n elements', () => {
      expect(skip([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
    });

    it('should skip while predicate is true', () => {
      expect(skipWhile([1, 2, 3, 4, 5], (n) => n < 3)).toEqual([3, 4, 5]);
    });
  });
});

// ============================================================================
// Grouping Tests
// ============================================================================

describe('Grouping', () => {
  describe('groupBy', () => {
    it('should group by key', () => {
      const items = [
        { type: 'a', value: 1 },
        { type: 'b', value: 2 },
        { type: 'a', value: 3 },
      ];
      const groups = groupBy(items, (item) => item.type);

      expect(groups['a']).toHaveLength(2);
      expect(groups['b']).toHaveLength(1);
    });
  });

  describe('groupByMap', () => {
    it('should group by key into Map', () => {
      const items = [1, 2, 3, 4, 5];
      const groups = groupByMap(items, (n) => (n % 2 === 0 ? 'even' : 'odd'));

      expect(groups.get('even')).toEqual([2, 4]);
      expect(groups.get('odd')).toEqual([1, 3, 5]);
    });
  });

  describe('partition', () => {
    it('should partition into two arrays', () => {
      const [even, odd] = partition([1, 2, 3, 4, 5], (n) => n % 2 === 0);

      expect(even).toEqual([2, 4]);
      expect(odd).toEqual([1, 3, 5]);
    });
  });

  describe('chunk', () => {
    it('should chunk array', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('sliding', () => {
    it('should create sliding windows', () => {
      expect(sliding([1, 2, 3, 4, 5], 3)).toEqual([
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5],
      ]);
    });

    it('should respect step', () => {
      expect(sliding([1, 2, 3, 4, 5], 2, 2)).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });
});

// ============================================================================
// Sorting Tests
// ============================================================================

describe('Sorting', () => {
  describe('sortBy', () => {
    it('should sort by key ascending', () => {
      const items = [{ value: 3 }, { value: 1 }, { value: 2 }];
      const sorted = sortBy(items, (item) => item.value);

      expect(sorted.map((i) => i.value)).toEqual([1, 2, 3]);
    });

    it('should sort by key descending', () => {
      const items = [{ value: 1 }, { value: 3 }, { value: 2 }];
      const sorted = sortBy(items, (item) => item.value, 'desc');

      expect(sorted.map((i) => i.value)).toEqual([3, 2, 1]);
    });
  });

  describe('sortByMultiple', () => {
    it('should sort by multiple keys', () => {
      const items = [
        { a: 1, b: 2 },
        { a: 1, b: 1 },
        { a: 2, b: 1 },
      ];
      const sorted = sortByMultiple(
        items,
        compareBy((i) => i.a),
        compareBy((i) => i.b)
      );

      expect(sorted).toEqual([
        { a: 1, b: 1 },
        { a: 1, b: 2 },
        { a: 2, b: 1 },
      ]);
    });
  });

  describe('reverse', () => {
    it('should reverse array immutably', () => {
      const original = [1, 2, 3];
      const reversed = reverse(original);

      expect(reversed).toEqual([3, 2, 1]);
      expect(original).toEqual([1, 2, 3]);
    });
  });

  describe('shuffle', () => {
    it('should shuffle array', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle(original);

      expect(shuffled).toHaveLength(5);
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

// ============================================================================
// Set Operations Tests
// ============================================================================

describe('Set Operations', () => {
  describe('union', () => {
    it('should return union', () => {
      expect(union([1, 2, 3], [3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('intersection', () => {
    it('should return intersection', () => {
      expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    });
  });

  describe('difference', () => {
    it('should return difference', () => {
      expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
    });
  });

  describe('symmetricDifference', () => {
    it('should return symmetric difference', () => {
      expect(symmetricDifference([1, 2, 3], [2, 3, 4])).toEqual([1, 4]);
    });
  });

  describe('isSubset', () => {
    it('should check subset', () => {
      expect(isSubset([1, 2], [1, 2, 3, 4])).toBe(true);
      expect(isSubset([1, 5], [1, 2, 3, 4])).toBe(false);
    });
  });

  describe('hasIntersection', () => {
    it('should check intersection', () => {
      expect(hasIntersection([1, 2], [2, 3])).toBe(true);
      expect(hasIntersection([1, 2], [3, 4])).toBe(false);
    });
  });
});

// ============================================================================
// Transformation Tests
// ============================================================================

describe('Transformations', () => {
  describe('flatten', () => {
    it('should flatten one level', () => {
      expect(flatten([[1, 2], [3, 4], 5])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('flattenDeep', () => {
    it('should flatten deeply nested arrays', () => {
      expect(flattenDeep([1, [2, [3, [4, 5]]]])).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('flatMap', () => {
    it('should map and flatten', () => {
      expect(flatMap([1, 2, 3], (n) => [n, n * 2])).toEqual([1, 2, 2, 4, 3, 6]);
    });
  });

  describe('zip', () => {
    it('should zip arrays', () => {
      expect(zip([1, 2], ['a', 'b'], [true, false])).toEqual([
        [1, 'a', true],
        [2, 'b', false],
      ]);
    });
  });

  describe('zipWith', () => {
    it('should zip two arrays into tuples', () => {
      expect(zipWith([1, 2, 3], ['a', 'b', 'c'])).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
    });
  });

  describe('unzip', () => {
    it('should unzip tuples', () => {
      const [nums, chars] = unzip([
        [1, 'a'],
        [2, 'b'],
      ] as [number, string][]);
      expect(nums).toEqual([1, 2]);
      expect(chars).toEqual(['a', 'b']);
    });
  });

  describe('range', () => {
    it('should create range', () => {
      expect(range(0, 5)).toEqual([0, 1, 2, 3, 4]);
      expect(range(0, 10, 2)).toEqual([0, 2, 4, 6, 8]);
      expect(range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
    });
  });

  describe('fill', () => {
    it('should fill array', () => {
      expect(fill(3, 'x')).toEqual(['x', 'x', 'x']);
    });
  });

  describe('generate', () => {
    it('should generate array', () => {
      expect(generate(5, (i) => i * 2)).toEqual([0, 2, 4, 6, 8]);
    });
  });
});

// ============================================================================
// Aggregation Tests
// ============================================================================

describe('Aggregation', () => {
  describe('sum', () => {
    it('should sum numbers', () => {
      expect(sum([1, 2, 3, 4, 5])).toBe(15);
    });
  });

  describe('sumBy', () => {
    it('should sum by key', () => {
      const items = [{ value: 1 }, { value: 2 }, { value: 3 }];
      expect(sumBy(items, (i) => i.value)).toBe(6);
    });
  });

  describe('average', () => {
    it('should calculate average', () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(average([])).toBe(0);
    });
  });

  describe('averageBy', () => {
    it('should calculate average by key', () => {
      const items = [{ value: 2 }, { value: 4 }];
      expect(averageBy(items, (i) => i.value)).toBe(3);
    });
  });

  describe('min and max', () => {
    it('should find min and max', () => {
      expect(min([3, 1, 4, 1, 5])).toBe(1);
      expect(max([3, 1, 4, 1, 5])).toBe(5);
    });

    it('should return undefined for empty array', () => {
      expect(min([])).toBeUndefined();
      expect(max([])).toBeUndefined();
    });
  });

  describe('minBy and maxBy', () => {
    it('should find min and max by key', () => {
      const items = [{ value: 3 }, { value: 1 }, { value: 2 }];
      expect(minBy(items, (i) => i.value)?.value).toBe(1);
      expect(maxBy(items, (i) => i.value)?.value).toBe(3);
    });
  });

  describe('count', () => {
    it('should count matching items', () => {
      expect(count([1, 2, 3, 4, 5], (n) => n > 2)).toBe(3);
    });
  });
});

// ============================================================================
// Searching Tests
// ============================================================================

describe('Searching', () => {
  describe('binarySearch', () => {
    it('should find element in sorted array', () => {
      expect(binarySearch([1, 2, 3, 4, 5], 3)).toBe(2);
    });

    it('should return -1 if not found', () => {
      expect(binarySearch([1, 2, 3, 4, 5], 6)).toBe(-1);
    });
  });

  describe('findIndex', () => {
    it('should find index of matching element', () => {
      expect(findIndex([1, 2, 3, 4], (n) => n > 2)).toBe(2);
    });
  });

  describe('findLastIndex', () => {
    it('should find last index of matching element', () => {
      expect(findLastIndex([1, 2, 3, 4], (n) => n > 2)).toBe(3);
    });
  });

  describe('all, any, none', () => {
    it('should check all match', () => {
      expect(all([2, 4, 6], (n) => n % 2 === 0)).toBe(true);
      expect(all([2, 3, 6], (n) => n % 2 === 0)).toBe(false);
    });

    it('should check any match', () => {
      expect(any([1, 2, 3], (n) => n > 2)).toBe(true);
      expect(any([1, 2, 3], (n) => n > 5)).toBe(false);
    });

    it('should check none match', () => {
      expect(none([1, 2, 3], (n) => n > 5)).toBe(true);
      expect(none([1, 2, 3], (n) => n > 2)).toBe(false);
    });
  });
});

// ============================================================================
// Pagination Tests
// ============================================================================

describe('Pagination', () => {
  describe('paginate', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    it('should paginate correctly', () => {
      const result = paginate(items, 1, 3);

      expect(result.items).toEqual([1, 2, 3]);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(4);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(false);
    });

    it('should handle middle page', () => {
      const result = paginate(items, 2, 3);

      expect(result.items).toEqual([4, 5, 6]);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPreviousPage).toBe(true);
    });

    it('should handle last page', () => {
      const result = paginate(items, 4, 3);

      expect(result.items).toEqual([10]);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });
  });
});

// ============================================================================
// Object Utilities Tests
// ============================================================================

describe('Object Utilities', () => {
  describe('toMap', () => {
    it('should convert to Map', () => {
      const items = [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ];
      const map = toMap(items, (i) => i.id);

      expect(map.get(1)?.name).toBe('a');
      expect(map.get(2)?.name).toBe('b');
    });
  });

  describe('toRecord', () => {
    it('should convert to Record', () => {
      const items = [
        { id: 'a', value: 1 },
        { id: 'b', value: 2 },
      ];
      const record = toRecord(items, (i) => i.id);

      expect(record['a'].value).toBe(1);
      expect(record['b'].value).toBe(2);
    });
  });

  describe('entries, keys, values', () => {
    const obj = { a: 1, b: 2 };

    it('should get entries', () => {
      expect(entries(obj)).toEqual([
        ['a', 1],
        ['b', 2],
      ]);
    });

    it('should get keys', () => {
      expect(keys(obj)).toEqual(['a', 'b']);
    });

    it('should get values', () => {
      expect(values(obj)).toEqual([1, 2]);
    });
  });

  describe('fromEntries', () => {
    it('should create object from entries', () => {
      expect(
        fromEntries([
          ['a', 1],
          ['b', 2],
        ])
      ).toEqual({ a: 1, b: 2 });
    });
  });
});
