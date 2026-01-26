/**
 * Tests for Text Similarity Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  levenshteinSimilarity,
  jaroSimilarity,
  jaroWinklerSimilarity,
  generateNgrams,
  ngramSimilarity,
  tokenize,
  wordFrequency,
  cosineSimilarity,
  combinedSimilarity,
  compareTexts,
  findBestMatch,
  findAllMatches,
  computeDiff,
  formatDiff,
  normalizeSubtitleText,
  areSubtitlesDuplicate,
  deduplicateSubtitles,
} from '@shared/utils/text-similarity';

// ============================================================================
// Levenshtein Distance Tests
// ============================================================================

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  it('should return length for empty comparison', () => {
    expect(levenshteinDistance('hello', '')).toBe(5);
    expect(levenshteinDistance('', 'world')).toBe(5);
  });

  it('should calculate correct distance', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('should handle single character differences', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });
});

describe('levenshteinSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    expect(levenshteinSimilarity('abc', '')).toBe(0);
  });

  it('should return normalized similarity', () => {
    const similarity = levenshteinSimilarity('hello', 'hallo');
    expect(similarity).toBeCloseTo(0.8);
  });
});

// ============================================================================
// Jaro-Winkler Tests
// ============================================================================

describe('jaroSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(jaroSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return 0 for empty strings', () => {
    expect(jaroSimilarity('hello', '')).toBe(0);
    expect(jaroSimilarity('', 'world')).toBe(0);
  });

  it('should calculate similarity correctly', () => {
    const similarity = jaroSimilarity('MARTHA', 'MARHTA');
    expect(similarity).toBeGreaterThan(0.9);
  });
});

describe('jaroWinklerSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(jaroWinklerSimilarity('hello', 'hello')).toBe(1);
  });

  it('should give higher scores to strings with common prefixes', () => {
    const jaroScore = jaroSimilarity('prefix_abc', 'prefix_xyz');
    const jwScore = jaroWinklerSimilarity('prefix_abc', 'prefix_xyz');
    expect(jwScore).toBeGreaterThanOrEqual(jaroScore);
  });

  it('should handle edge cases', () => {
    expect(jaroWinklerSimilarity('a', 'a')).toBe(1);
    expect(jaroWinklerSimilarity('a', 'b')).toBeLessThan(1);
  });
});

// ============================================================================
// N-gram Tests
// ============================================================================

describe('generateNgrams', () => {
  it('should generate correct bigrams', () => {
    const ngrams = generateNgrams('hello', 2);
    expect(ngrams.has('he')).toBe(true);
    expect(ngrams.has('el')).toBe(true);
    expect(ngrams.has('ll')).toBe(true);
    expect(ngrams.has('lo')).toBe(true);
    expect(ngrams.size).toBe(4);
  });

  it('should generate correct trigrams', () => {
    const ngrams = generateNgrams('hello', 3);
    expect(ngrams.has('hel')).toBe(true);
    expect(ngrams.has('ell')).toBe(true);
    expect(ngrams.has('llo')).toBe(true);
    expect(ngrams.size).toBe(3);
  });

  it('should handle strings shorter than n', () => {
    const ngrams = generateNgrams('hi', 3);
    expect(ngrams.has('hi')).toBe(true);
    expect(ngrams.size).toBe(1);
  });
});

describe('ngramSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(ngramSimilarity('hello', 'hello')).toBe(1);
  });

  it('should return 0 for completely different strings', () => {
    expect(ngramSimilarity('abc', 'xyz')).toBe(0);
  });

  it('should calculate similarity based on shared ngrams', () => {
    const similarity = ngramSimilarity('hello', 'hallo');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });

  it('should be case insensitive', () => {
    expect(ngramSimilarity('Hello', 'hello')).toBe(1);
  });
});

// ============================================================================
// Cosine Similarity Tests
// ============================================================================

describe('tokenize', () => {
  it('should split text into words', () => {
    const tokens = tokenize('Hello World');
    expect(tokens).toEqual(['hello', 'world']);
  });

  it('should remove punctuation', () => {
    const tokens = tokenize('Hello, World!');
    expect(tokens).toEqual(['hello', 'world']);
  });

  it('should handle multiple spaces', () => {
    const tokens = tokenize('hello   world');
    expect(tokens).toEqual(['hello', 'world']);
  });
});

describe('wordFrequency', () => {
  it('should count word frequencies', () => {
    const freq = wordFrequency(['a', 'b', 'a', 'c', 'a']);
    expect(freq.get('a')).toBe(3);
    expect(freq.get('b')).toBe(1);
    expect(freq.get('c')).toBe(1);
  });
});

describe('cosineSimilarity', () => {
  it('should return 1 for identical texts', () => {
    expect(cosineSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('should return 0 for completely different texts', () => {
    expect(cosineSimilarity('abc', 'xyz')).toBe(0);
  });

  it('should handle word order differences', () => {
    const similarity = cosineSimilarity('hello world', 'world hello');
    expect(similarity).toBeCloseTo(1); // Cosine ignores order
  });

  it('should calculate partial similarity', () => {
    const similarity = cosineSimilarity('hello world', 'hello there');
    expect(similarity).toBeGreaterThan(0);
    expect(similarity).toBeLessThan(1);
  });
});

// ============================================================================
// Combined Similarity Tests
// ============================================================================

describe('combinedSimilarity', () => {
  it('should return 1 for identical strings', () => {
    expect(combinedSimilarity('hello', 'hello')).toBe(1);
  });

  it('should combine multiple algorithms', () => {
    const similarity = combinedSimilarity('hello world', 'hallo world');
    expect(similarity).toBeGreaterThan(0.5);
    expect(similarity).toBeLessThan(1);
  });

  it('should accept custom weights', () => {
    const similarity1 = combinedSimilarity('test', 'testing', { levenshtein: 1, jaroWinkler: 0, ngram: 0, cosine: 0 });
    const similarity2 = combinedSimilarity('test', 'testing', { levenshtein: 0, jaroWinkler: 1, ngram: 0, cosine: 0 });
    expect(similarity1).not.toBe(similarity2);
  });
});

// ============================================================================
// Compare Texts Tests
// ============================================================================

describe('compareTexts', () => {
  it('should return similarity result', () => {
    const result = compareTexts('hello', 'hello');
    expect(result.score).toBe(1);
    expect(result.isSimilar).toBe(true);
  });

  it('should use specified algorithm', () => {
    const result = compareTexts('hello', 'hallo', { algorithm: 'levenshtein' });
    expect(result.algorithm).toBe('levenshtein');
  });

  it('should respect threshold', () => {
    const result1 = compareTexts('hello', 'hallo', { threshold: 0.9 });
    const result2 = compareTexts('hello', 'hallo', { threshold: 0.5 });
    expect(result1.isSimilar).toBe(false);
    expect(result2.isSimilar).toBe(true);
  });

  it('should support case sensitivity', () => {
    const resultInsensitive = compareTexts('Hello', 'hello', { caseSensitive: false });
    const resultSensitive = compareTexts('Hello', 'hello', { caseSensitive: true });
    expect(resultInsensitive.score).toBe(1);
    expect(resultSensitive.score).toBeLessThan(1);
  });
});

// ============================================================================
// Find Match Tests
// ============================================================================

describe('findBestMatch', () => {
  const candidates = ['apple', 'banana', 'cherry', 'apricot'];

  it('should find exact match', () => {
    const result = findBestMatch('apple', candidates, (s) => s);
    expect(result?.item).toBe('apple');
    expect(result?.score).toBe(1);
  });

  it('should find closest match', () => {
    const result = findBestMatch('aple', candidates, (s) => s);
    expect(result?.item).toBe('apple');
  });

  it('should return null when no match above threshold', () => {
    const result = findBestMatch('xyz', candidates, (s) => s, { threshold: 0.9 });
    expect(result).toBeNull();
  });

  it('should work with objects', () => {
    const items = [{ name: 'apple' }, { name: 'banana' }];
    const result = findBestMatch('apple', items, (item) => item.name);
    expect(result?.item.name).toBe('apple');
  });
});

describe('findAllMatches', () => {
  const candidates = ['apple', 'application', 'apply', 'banana'];

  it('should find all matches above threshold', () => {
    const results = findAllMatches('app', candidates, (s) => s, { threshold: 0.3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.item === 'apple')).toBe(true);
  });

  it('should sort by score descending', () => {
    const results = findAllMatches('app', candidates, (s) => s, { threshold: 0.1 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('should respect maxResults', () => {
    const results = findAllMatches('a', candidates, (s) => s, { threshold: 0, maxResults: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// Diff Tests
// ============================================================================

describe('computeDiff', () => {
  it('should handle identical texts', () => {
    const diff = computeDiff('hello world', 'hello world');
    expect(diff.every((d) => d.operation === 'equal')).toBe(true);
  });

  it('should detect insertions', () => {
    const diff = computeDiff('hello', 'hello world');
    expect(diff.some((d) => d.operation === 'insert' && d.text === 'world')).toBe(true);
  });

  it('should detect deletions', () => {
    const diff = computeDiff('hello world', 'hello');
    expect(diff.some((d) => d.operation === 'delete' && d.text === 'world')).toBe(true);
  });

  it('should detect mixed changes', () => {
    const diff = computeDiff('the quick fox', 'a quick brown fox');
    expect(diff.some((d) => d.operation === 'delete')).toBe(true);
    expect(diff.some((d) => d.operation === 'insert')).toBe(true);
  });
});

describe('formatDiff', () => {
  it('should format diff as readable string', () => {
    const diff = [
      { operation: 'equal' as const, text: 'hello' },
      { operation: 'delete' as const, text: 'old' },
      { operation: 'insert' as const, text: 'new' },
      { operation: 'equal' as const, text: 'world' },
    ];

    const formatted = formatDiff(diff);
    expect(formatted).toContain('-old');
    expect(formatted).toContain('+new');
  });
});

// ============================================================================
// Subtitle-Specific Tests
// ============================================================================

describe('normalizeSubtitleText', () => {
  it('should lowercase text', () => {
    expect(normalizeSubtitleText('HELLO')).toBe('hello');
  });

  it('should remove HTML tags', () => {
    expect(normalizeSubtitleText('<b>hello</b>')).toBe('hello');
  });

  it('should remove bracketed content', () => {
    expect(normalizeSubtitleText('hello [music] world')).toBe('hello world');
  });

  it('should remove parenthetical content', () => {
    expect(normalizeSubtitleText('hello (laughing) world')).toBe('hello world');
  });

  it('should normalize whitespace', () => {
    expect(normalizeSubtitleText('hello   world')).toBe('hello world');
  });

  it('should trim text', () => {
    expect(normalizeSubtitleText('  hello  ')).toBe('hello');
  });
});

describe('areSubtitlesDuplicate', () => {
  it('should detect identical subtitles', () => {
    expect(areSubtitlesDuplicate('Hello world', 'Hello world')).toBe(true);
  });

  it('should detect case-different subtitles', () => {
    expect(areSubtitlesDuplicate('Hello World', 'hello world')).toBe(true);
  });

  it('should detect subtitles with different formatting', () => {
    expect(areSubtitlesDuplicate('<b>Hello</b> world', 'Hello world')).toBe(true);
  });

  it('should reject different subtitles', () => {
    expect(areSubtitlesDuplicate('Hello world', 'Goodbye world')).toBe(false);
  });

  it('should respect threshold', () => {
    expect(areSubtitlesDuplicate('Hello world', 'Hello there', 0.9)).toBe(false);
    expect(areSubtitlesDuplicate('Hello world', 'Hello there', 0.5)).toBe(true);
  });
});

describe('deduplicateSubtitles', () => {
  it('should remove duplicate subtitles', () => {
    const subtitles = [
      { text: 'Hello world', start: 0 },
      { text: 'Hello world', start: 1000 },
      { text: 'Goodbye world', start: 2000 },
    ];

    const result = deduplicateSubtitles(subtitles);

    expect(result.unique.length).toBe(2);
    expect(result.duplicates.length).toBe(1);
  });

  it('should handle case differences', () => {
    const subtitles = [
      { text: 'Hello World' },
      { text: 'hello world' },
    ];

    const result = deduplicateSubtitles(subtitles);

    expect(result.unique.length).toBe(1);
    expect(result.duplicates.length).toBe(1);
  });

  it('should preserve order of unique items', () => {
    const subtitles = [
      { text: 'First' },
      { text: 'Second' },
      { text: 'First' },
      { text: 'Third' },
    ];

    const result = deduplicateSubtitles(subtitles);

    expect(result.unique[0].text).toBe('First');
    expect(result.unique[1].text).toBe('Second');
    expect(result.unique[2].text).toBe('Third');
  });

  it('should track which item is a duplicate of', () => {
    const subtitles = [
      { text: 'Hello' },
      { text: 'World' },
      { text: 'Hello' },
    ];

    const result = deduplicateSubtitles(subtitles);

    expect(result.duplicates[0].duplicateOf).toBe(0);
  });
});
