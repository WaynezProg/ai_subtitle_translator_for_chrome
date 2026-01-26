/**
 * Text Similarity Utilities
 *
 * Provides algorithms for comparing text strings, computing similarity scores,
 * and finding near-matches. Useful for subtitle deduplication and matching.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Similarity result with score and details
 */
export interface SimilarityResult {
  /** Similarity score (0-1, where 1 is identical) */
  score: number;
  /** Whether the texts are considered similar */
  isSimilar: boolean;
  /** Algorithm used for comparison */
  algorithm: string;
}

/**
 * Diff operation types
 */
export type DiffOperation = 'equal' | 'insert' | 'delete';

/**
 * Single diff entry
 */
export interface DiffEntry {
  operation: DiffOperation;
  text: string;
}

/**
 * Match result when searching for similar strings
 */
export interface MatchResult<T = string> {
  /** The matched item */
  item: T;
  /** Similarity score */
  score: number;
  /** Index in the original array */
  index: number;
}

// ============================================================================
// Levenshtein Distance
// ============================================================================

/**
 * Calculate the Levenshtein distance between two strings.
 * This is the minimum number of single-character edits needed
 * to transform one string into another.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two rows instead of full matrix for memory efficiency
  let prevRow = new Array<number>(b.length + 1);
  let currRow = new Array<number>(b.length + 1);

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
    }

    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[b.length];
}

/**
 * Calculate normalized Levenshtein similarity (0-1).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  return 1 - distance / maxLength;
}

// ============================================================================
// Jaro-Winkler Similarity
// ============================================================================

/**
 * Calculate Jaro similarity between two strings.
 */
export function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const aMatches = new Array<boolean>(a.length).fill(false);
  const bMatches = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);

    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / a.length +
      matches / b.length +
      (matches - transpositions / 2) / matches) /
    3
  );
}

/**
 * Calculate Jaro-Winkler similarity (gives more weight to common prefixes).
 */
export function jaroWinklerSimilarity(a: string, b: string, prefixScale: number = 0.1): number {
  const jaroScore = jaroSimilarity(a, b);

  // Find common prefix length (max 4 characters)
  let prefixLength = 0;
  const maxPrefix = Math.min(4, a.length, b.length);

  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  return jaroScore + prefixLength * prefixScale * (1 - jaroScore);
}

// ============================================================================
// N-gram Similarity
// ============================================================================

/**
 * Generate n-grams from a string.
 */
export function generateNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>();

  if (text.length < n) {
    ngrams.add(text);
    return ngrams;
  }

  for (let i = 0; i <= text.length - n; i++) {
    ngrams.add(text.substring(i, i + n));
  }

  return ngrams;
}

/**
 * Calculate n-gram similarity using Jaccard index.
 */
export function ngramSimilarity(a: string, b: string, n: number = 2): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const ngramsA = generateNgrams(a.toLowerCase(), n);
  const ngramsB = generateNgrams(b.toLowerCase(), n);

  // Calculate Jaccard index
  let intersection = 0;
  for (const ngram of ngramsA) {
    if (ngramsB.has(ngram)) {
      intersection++;
    }
  }

  const union = ngramsA.size + ngramsB.size - intersection;

  return union === 0 ? 0 : intersection / union;
}

// ============================================================================
// Cosine Similarity (for longer texts)
// ============================================================================

/**
 * Tokenize text into words.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

/**
 * Create word frequency map.
 */
export function wordFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return freq;
}

/**
 * Calculate cosine similarity between two texts using word vectors.
 */
export function cosineSimilarity(a: string, b: string): number {
  if (a === b) return 1;

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const freqA = wordFrequency(tokensA);
  const freqB = wordFrequency(tokensB);

  // Get all unique words
  const allWords = new Set([...freqA.keys(), ...freqB.keys()]);

  // Calculate dot product and magnitudes
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const word of allWords) {
    const countA = freqA.get(word) ?? 0;
    const countB = freqB.get(word) ?? 0;

    dotProduct += countA * countB;
    magnitudeA += countA * countA;
    magnitudeB += countB * countB;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

// ============================================================================
// Combined Similarity
// ============================================================================

/**
 * Calculate similarity using multiple algorithms and return weighted average.
 */
export function combinedSimilarity(
  a: string,
  b: string,
  weights: { levenshtein?: number; jaroWinkler?: number; ngram?: number; cosine?: number } = {}
): number {
  const {
    levenshtein = 0.3,
    jaroWinkler = 0.3,
    ngram = 0.2,
    cosine = 0.2,
  } = weights;

  const totalWeight = levenshtein + jaroWinkler + ngram + cosine;

  let score = 0;
  score += levenshteinSimilarity(a, b) * levenshtein;
  score += jaroWinklerSimilarity(a, b) * jaroWinkler;
  score += ngramSimilarity(a, b, 2) * ngram;
  score += cosineSimilarity(a, b) * cosine;

  return score / totalWeight;
}

// ============================================================================
// Text Comparison Functions
// ============================================================================

/**
 * Compare two texts and return detailed similarity result.
 */
export function compareTexts(
  a: string,
  b: string,
  options: {
    algorithm?: 'levenshtein' | 'jaroWinkler' | 'ngram' | 'cosine' | 'combined';
    threshold?: number;
    caseSensitive?: boolean;
  } = {}
): SimilarityResult {
  const {
    algorithm = 'combined',
    threshold = 0.8,
    caseSensitive = false,
  } = options;

  const textA = caseSensitive ? a : a.toLowerCase();
  const textB = caseSensitive ? b : b.toLowerCase();

  let score: number;

  switch (algorithm) {
    case 'levenshtein':
      score = levenshteinSimilarity(textA, textB);
      break;
    case 'jaroWinkler':
      score = jaroWinklerSimilarity(textA, textB);
      break;
    case 'ngram':
      score = ngramSimilarity(textA, textB);
      break;
    case 'cosine':
      score = cosineSimilarity(textA, textB);
      break;
    case 'combined':
    default:
      score = combinedSimilarity(textA, textB);
  }

  return {
    score,
    isSimilar: score >= threshold,
    algorithm,
  };
}

/**
 * Find the best match for a query in a list of candidates.
 */
export function findBestMatch<T>(
  query: string,
  candidates: T[],
  getText: (item: T) => string,
  options: { threshold?: number; algorithm?: 'levenshtein' | 'jaroWinkler' | 'ngram' | 'cosine' | 'combined' } = {}
): MatchResult<T> | null {
  const { threshold = 0, algorithm = 'combined' } = options;

  let bestMatch: MatchResult<T> | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidateText = getText(candidates[i]);
    const result = compareTexts(query, candidateText, { algorithm, threshold: 0 });

    if (result.score > (bestMatch?.score ?? threshold)) {
      bestMatch = {
        item: candidates[i],
        score: result.score,
        index: i,
      };
    }
  }

  return bestMatch;
}

/**
 * Find all matches above a threshold.
 */
export function findAllMatches<T>(
  query: string,
  candidates: T[],
  getText: (item: T) => string,
  options: { threshold?: number; maxResults?: number; algorithm?: 'levenshtein' | 'jaroWinkler' | 'ngram' | 'cosine' | 'combined' } = {}
): MatchResult<T>[] {
  const { threshold = 0.5, maxResults = 10, algorithm = 'combined' } = options;

  const matches: MatchResult<T>[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidateText = getText(candidates[i]);
    const result = compareTexts(query, candidateText, { algorithm, threshold: 0 });

    if (result.score >= threshold) {
      matches.push({
        item: candidates[i],
        score: result.score,
        index: i,
      });
    }
  }

  // Sort by score descending and limit results
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

// ============================================================================
// Text Diff
// ============================================================================

/**
 * Compute a simple word-level diff between two texts.
 */
export function computeDiff(oldText: string, newText: string): DiffEntry[] {
  const oldWords = oldText.split(/\s+/);
  const newWords = newText.split(/\s+/);

  const diff: DiffEntry[] = [];

  // Simple LCS-based diff
  const lcs = longestCommonSubsequence(oldWords, newWords);
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (lcsIdx < lcs.length && oldIdx < oldWords.length && oldWords[oldIdx] === lcs[lcsIdx]) {
      // Handle deletions before this common word
      while (newIdx < newWords.length && newWords[newIdx] !== lcs[lcsIdx]) {
        diff.push({ operation: 'insert', text: newWords[newIdx] });
        newIdx++;
      }

      // Add the common word
      diff.push({ operation: 'equal', text: oldWords[oldIdx] });
      oldIdx++;
      newIdx++;
      lcsIdx++;
    } else if (oldIdx < oldWords.length && (lcsIdx >= lcs.length || oldWords[oldIdx] !== lcs[lcsIdx])) {
      diff.push({ operation: 'delete', text: oldWords[oldIdx] });
      oldIdx++;
    } else if (newIdx < newWords.length) {
      diff.push({ operation: 'insert', text: newWords[newIdx] });
      newIdx++;
    }
  }

  return diff;
}

/**
 * Find the longest common subsequence of two arrays.
 */
function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

/**
 * Format diff as a readable string.
 */
export function formatDiff(diff: DiffEntry[]): string {
  return diff
    .map((entry) => {
      switch (entry.operation) {
        case 'insert':
          return `+${entry.text}`;
        case 'delete':
          return `-${entry.text}`;
        case 'equal':
          return entry.text;
      }
    })
    .join(' ');
}

// ============================================================================
// Subtitle-Specific Utilities
// ============================================================================

/**
 * Normalize subtitle text for comparison.
 */
export function normalizeSubtitleText(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\[.*?\]/g, '') // Remove brackets content
    .replace(/\(.*?\)/g, '') // Remove parentheses content
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if two subtitles are duplicates.
 */
export function areSubtitlesDuplicate(
  a: string,
  b: string,
  threshold: number = 0.9
): boolean {
  const normalizedA = normalizeSubtitleText(a);
  const normalizedB = normalizeSubtitleText(b);

  if (normalizedA === normalizedB) return true;

  const similarity = combinedSimilarity(normalizedA, normalizedB);
  return similarity >= threshold;
}

/**
 * Deduplicate a list of subtitles.
 */
export function deduplicateSubtitles<T extends { text: string }>(
  subtitles: T[],
  threshold: number = 0.9
): { unique: T[]; duplicates: Array<{ item: T; duplicateOf: number }> } {
  const unique: T[] = [];
  const duplicates: Array<{ item: T; duplicateOf: number }> = [];

  for (const subtitle of subtitles) {
    const normalizedText = normalizeSubtitleText(subtitle.text);
    let isDuplicate = false;

    for (let i = 0; i < unique.length; i++) {
      const existingNormalized = normalizeSubtitleText(unique[i].text);

      if (areSubtitlesDuplicate(normalizedText, existingNormalized, threshold)) {
        duplicates.push({ item: subtitle, duplicateOf: i });
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(subtitle);
    }
  }

  return { unique, duplicates };
}
