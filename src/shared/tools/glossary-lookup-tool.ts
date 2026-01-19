/**
 * Glossary Lookup Tool
 *
 * A tool that allows AI to look up terms in a translation glossary
 * to ensure consistent character names and terminology.
 */

import type {
  BaseTool,
  ToolInfo,
  ToolCall,
  ToolResponse,
  ToolContext,
} from '../types/tools';
import { createTextResponse, createErrorResponse, parseToolArguments } from '../types/tools';

// ============================================================================
// Types
// ============================================================================

interface GlossaryEntry {
  /** Original term */
  original: string;
  /** Translated term */
  translated: string;
  /** Optional notes about usage */
  notes?: string;
  /** Category (e.g., 'character', 'place', 'term') */
  category?: string;
}

interface LookupParams {
  /** Term to look up */
  term: string;
  /** Source language */
  sourceLanguage?: string;
  /** Whether to do fuzzy matching */
  fuzzy?: boolean;
}

interface LookupResult {
  found: boolean;
  entries: GlossaryEntry[];
  suggestions?: string[];
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class GlossaryLookupTool implements BaseTool {
  private glossary: Map<string, GlossaryEntry> = new Map();

  constructor(initialEntries?: GlossaryEntry[]) {
    if (initialEntries) {
      for (const entry of initialEntries) {
        this.addEntry(entry);
      }
    }
  }

  info(): ToolInfo {
    return {
      name: 'lookup_glossary',
      description:
        'Looks up a term in the translation glossary to find the correct translation for character names, places, or specialized terminology. Returns matching entries with their translations.',
      parameters: {
        term: {
          type: 'string',
          description: 'The term to look up in the glossary',
        },
        sourceLanguage: {
          type: 'string',
          description: 'Source language code for context (optional)',
        },
        fuzzy: {
          type: 'boolean',
          description: 'Enable fuzzy matching for partial matches (default: false)',
        },
      },
      required: ['term'],
    };
  }

  async run(params: ToolCall, _context?: ToolContext): Promise<ToolResponse> {
    const args = parseToolArguments<LookupParams>(params.input);

    if (!args) {
      return createErrorResponse('Invalid parameters: could not parse JSON input');
    }

    if (!args.term) {
      return createErrorResponse('Missing required parameter: term');
    }

    const result = this.lookup(args);
    return createTextResponse(JSON.stringify(result, null, 2));
  }

  /**
   * Add an entry to the glossary
   */
  addEntry(entry: GlossaryEntry): void {
    const key = this.normalizeKey(entry.original);
    this.glossary.set(key, entry);
  }

  /**
   * Add multiple entries to the glossary
   */
  addEntries(entries: GlossaryEntry[]): void {
    for (const entry of entries) {
      this.addEntry(entry);
    }
  }

  /**
   * Remove an entry from the glossary
   */
  removeEntry(original: string): boolean {
    const key = this.normalizeKey(original);
    return this.glossary.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.glossary.clear();
  }

  /**
   * Get all entries
   */
  getAllEntries(): GlossaryEntry[] {
    return Array.from(this.glossary.values());
  }

  /**
   * Get entry count
   */
  get size(): number {
    return this.glossary.size;
  }

  private lookup(params: LookupParams): LookupResult {
    const normalizedTerm = this.normalizeKey(params.term);
    const entries: GlossaryEntry[] = [];
    const suggestions: string[] = [];

    // Exact match
    const exactMatch = this.glossary.get(normalizedTerm);
    if (exactMatch) {
      entries.push(exactMatch);
    }

    // Fuzzy matching if requested and no exact match
    if (params.fuzzy && entries.length === 0) {
      const fuzzyMatches = this.fuzzySearch(normalizedTerm);
      entries.push(...fuzzyMatches);

      if (fuzzyMatches.length === 0) {
        // Suggest similar terms
        const similarTerms = this.findSimilarTerms(normalizedTerm, 3);
        suggestions.push(...similarTerms.map((t) => `Did you mean: ${t}?`));
      }
    }

    return {
      found: entries.length > 0,
      entries,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  private normalizeKey(term: string): string {
    return term.toLowerCase().trim();
  }

  private fuzzySearch(term: string): GlossaryEntry[] {
    const results: GlossaryEntry[] = [];

    for (const [key, entry] of this.glossary.entries()) {
      // Check if term is a substring of the key or vice versa
      if (key.includes(term) || term.includes(key)) {
        results.push(entry);
        continue;
      }

      // Check Levenshtein distance for short terms
      if (term.length <= 10 && key.length <= 10) {
        const distance = this.levenshteinDistance(term, key);
        if (distance <= 2) {
          results.push(entry);
        }
      }
    }

    return results;
  }

  private findSimilarTerms(term: string, maxResults: number): string[] {
    const distances: Array<{ term: string; distance: number }> = [];

    for (const [key] of this.glossary.entries()) {
      const distance = this.levenshteinDistance(term, key);
      if (distance <= 3) {
        distances.push({ term: key, distance });
      }
    }

    distances.sort((a, b) => a.distance - b.distance);
    return distances.slice(0, maxResults).map((d) => d.term);
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createGlossaryLookupTool(
  initialEntries?: GlossaryEntry[]
): GlossaryLookupTool {
  return new GlossaryLookupTool(initialEntries);
}

export type { GlossaryEntry };
