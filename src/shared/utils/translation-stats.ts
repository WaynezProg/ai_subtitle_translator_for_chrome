/**
 * Translation Statistics Tracker
 *
 * Tracks translation usage statistics for analytics and user feedback.
 *
 * Features:
 * - Translation count tracking
 * - Character/word count tracking
 * - Provider usage statistics
 * - Time-based aggregation
 * - Persistent storage
 */

import { createLogger } from './logger';

const log = createLogger('TranslationStats');

// ============================================================================
// Types
// ============================================================================

export interface TranslationEvent {
  /** Event timestamp */
  timestamp: number;
  /** Provider used */
  provider: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Platform (youtube, netflix, etc.) */
  platform: string;
  /** Number of cues translated */
  cueCount: number;
  /** Total characters translated */
  characterCount: number;
  /** Translation duration in milliseconds */
  durationMs: number;
  /** Whether result was from cache */
  cached: boolean;
  /** Whether translation succeeded */
  success: boolean;
  /** Error code if failed */
  errorCode?: string;
}

export interface DailyStats {
  /** Date string (YYYY-MM-DD) */
  date: string;
  /** Total translations */
  totalTranslations: number;
  /** Successful translations */
  successfulTranslations: number;
  /** Failed translations */
  failedTranslations: number;
  /** Cached translations */
  cachedTranslations: number;
  /** Total cues translated */
  totalCues: number;
  /** Total characters translated */
  totalCharacters: number;
  /** Total time spent translating (ms) */
  totalDurationMs: number;
  /** Translations by provider */
  byProvider: Record<string, number>;
  /** Translations by platform */
  byPlatform: Record<string, number>;
  /** Translations by target language */
  byTargetLanguage: Record<string, number>;
}

export interface OverallStats {
  /** All-time translation count */
  totalTranslations: number;
  /** All-time successful translations */
  successfulTranslations: number;
  /** All-time cached translations */
  cachedTranslations: number;
  /** All-time cue count */
  totalCues: number;
  /** All-time character count */
  totalCharacters: number;
  /** All-time duration */
  totalDurationMs: number;
  /** Average translation time per cue */
  avgTimePerCueMs: number;
  /** Success rate */
  successRate: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Most used provider */
  mostUsedProvider: string;
  /** Most translated language */
  mostTranslatedLanguage: string;
  /** First translation date */
  firstTranslationDate?: string;
  /** Last translation date */
  lastTranslationDate?: string;
}

export interface StatsConfig {
  /** Storage key prefix */
  storageKey: string;
  /** Number of days to retain daily stats */
  retentionDays: number;
  /** Enable persistence */
  persistent: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: StatsConfig = {
  storageKey: 'translation_stats',
  retentionDays: 30,
  persistent: true,
};

// ============================================================================
// Translation Stats Tracker
// ============================================================================

export class TranslationStatsTracker {
  private config: StatsConfig;
  private dailyStats: Map<string, DailyStats> = new Map();
  private overallStats: OverallStats;
  private initialized = false;

  constructor(config: Partial<StatsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.overallStats = this.createEmptyOverallStats();
  }

  /**
   * Initialize the stats tracker
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.persistent) {
      await this.loadFromStorage();
    }

    this.initialized = true;
    log.debug('Translation stats tracker initialized');
  }

  /**
   * Record a translation event
   */
  async recordTranslation(event: Omit<TranslationEvent, 'timestamp'>): Promise<void> {
    const fullEvent: TranslationEvent = {
      ...event,
      timestamp: Date.now(),
    };

    // Update daily stats
    const dateStr = this.getDateString(fullEvent.timestamp);
    let daily = this.dailyStats.get(dateStr);

    if (!daily) {
      daily = this.createEmptyDailyStats(dateStr);
      this.dailyStats.set(dateStr, daily);
    }

    this.updateDailyStats(daily, fullEvent);

    // Update overall stats
    this.updateOverallStats(fullEvent);

    // Clean up old stats
    this.cleanupOldStats();

    // Persist
    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Recorded translation', {
      provider: event.provider,
      cueCount: event.cueCount,
      success: event.success,
    });
  }

  /**
   * Record a successful translation
   */
  async recordSuccess(
    provider: string,
    platform: string,
    sourceLanguage: string,
    targetLanguage: string,
    cueCount: number,
    characterCount: number,
    durationMs: number,
    cached = false
  ): Promise<void> {
    await this.recordTranslation({
      provider,
      platform,
      sourceLanguage,
      targetLanguage,
      cueCount,
      characterCount,
      durationMs,
      cached,
      success: true,
    });
  }

  /**
   * Record a failed translation
   */
  async recordFailure(
    provider: string,
    platform: string,
    sourceLanguage: string,
    targetLanguage: string,
    errorCode: string,
    durationMs: number
  ): Promise<void> {
    await this.recordTranslation({
      provider,
      platform,
      sourceLanguage,
      targetLanguage,
      cueCount: 0,
      characterCount: 0,
      durationMs,
      cached: false,
      success: false,
      errorCode,
    });
  }

  /**
   * Get statistics for today
   */
  getTodayStats(): DailyStats {
    const today = this.getDateString(Date.now());
    return this.dailyStats.get(today) ?? this.createEmptyDailyStats(today);
  }

  /**
   * Get statistics for a specific date
   */
  getStatsForDate(date: Date): DailyStats | null {
    const dateStr = this.getDateString(date.getTime());
    return this.dailyStats.get(dateStr) ?? null;
  }

  /**
   * Get statistics for the last N days
   */
  getRecentStats(days: number): DailyStats[] {
    const result: DailyStats[] = [];
    const now = Date.now();

    for (let i = 0; i < days; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = this.getDateString(date.getTime());
      const stats = this.dailyStats.get(dateStr);

      if (stats) {
        result.push(stats);
      }
    }

    return result;
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): OverallStats {
    return { ...this.overallStats };
  }

  /**
   * Get usage summary for display
   */
  getUsageSummary(): {
    today: { translations: number; characters: number };
    week: { translations: number; characters: number };
    month: { translations: number; characters: number };
    total: { translations: number; characters: number };
  } {
    const todayStats = this.getTodayStats();
    const weekStats = this.getRecentStats(7);
    const monthStats = this.getRecentStats(30);

    return {
      today: {
        translations: todayStats.successfulTranslations,
        characters: todayStats.totalCharacters,
      },
      week: {
        translations: weekStats.reduce((sum, s) => sum + s.successfulTranslations, 0),
        characters: weekStats.reduce((sum, s) => sum + s.totalCharacters, 0),
      },
      month: {
        translations: monthStats.reduce((sum, s) => sum + s.successfulTranslations, 0),
        characters: monthStats.reduce((sum, s) => sum + s.totalCharacters, 0),
      },
      total: {
        translations: this.overallStats.successfulTranslations,
        characters: this.overallStats.totalCharacters,
      },
    };
  }

  /**
   * Get provider usage statistics
   */
  getProviderStats(): Array<{
    provider: string;
    count: number;
    percentage: number;
  }> {
    const providerCounts: Record<string, number> = {};

    for (const daily of this.dailyStats.values()) {
      for (const [provider, count] of Object.entries(daily.byProvider)) {
        providerCounts[provider] = (providerCounts[provider] ?? 0) + count;
      }
    }

    const total = Object.values(providerCounts).reduce((a, b) => a + b, 0);

    return Object.entries(providerCounts)
      .map(([provider, count]) => ({
        provider,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get language usage statistics
   */
  getLanguageStats(): Array<{
    language: string;
    count: number;
    percentage: number;
  }> {
    const languageCounts: Record<string, number> = {};

    for (const daily of this.dailyStats.values()) {
      for (const [language, count] of Object.entries(daily.byTargetLanguage)) {
        languageCounts[language] = (languageCounts[language] ?? 0) + count;
      }
    }

    const total = Object.values(languageCounts).reduce((a, b) => a + b, 0);

    return Object.entries(languageCounts)
      .map(([language, count]) => ({
        language,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Clear all statistics
   */
  async clearStats(): Promise<void> {
    this.dailyStats.clear();
    this.overallStats = this.createEmptyOverallStats();

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Statistics cleared');
  }

  /**
   * Export statistics as JSON
   */
  exportStats(): string {
    return JSON.stringify(
      {
        overall: this.overallStats,
        daily: Array.from(this.dailyStats.entries()),
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createEmptyDailyStats(date: string): DailyStats {
    return {
      date,
      totalTranslations: 0,
      successfulTranslations: 0,
      failedTranslations: 0,
      cachedTranslations: 0,
      totalCues: 0,
      totalCharacters: 0,
      totalDurationMs: 0,
      byProvider: {},
      byPlatform: {},
      byTargetLanguage: {},
    };
  }

  private createEmptyOverallStats(): OverallStats {
    return {
      totalTranslations: 0,
      successfulTranslations: 0,
      cachedTranslations: 0,
      totalCues: 0,
      totalCharacters: 0,
      totalDurationMs: 0,
      avgTimePerCueMs: 0,
      successRate: 0,
      cacheHitRate: 0,
      mostUsedProvider: '',
      mostTranslatedLanguage: '',
    };
  }

  private updateDailyStats(daily: DailyStats, event: TranslationEvent): void {
    daily.totalTranslations++;

    if (event.success) {
      daily.successfulTranslations++;
      daily.totalCues += event.cueCount;
      daily.totalCharacters += event.characterCount;
    } else {
      daily.failedTranslations++;
    }

    if (event.cached) {
      daily.cachedTranslations++;
    }

    daily.totalDurationMs += event.durationMs;

    // Update provider counts
    daily.byProvider[event.provider] = (daily.byProvider[event.provider] ?? 0) + 1;

    // Update platform counts
    daily.byPlatform[event.platform] = (daily.byPlatform[event.platform] ?? 0) + 1;

    // Update language counts
    daily.byTargetLanguage[event.targetLanguage] =
      (daily.byTargetLanguage[event.targetLanguage] ?? 0) + 1;
  }

  private updateOverallStats(event: TranslationEvent): void {
    this.overallStats.totalTranslations++;

    if (event.success) {
      this.overallStats.successfulTranslations++;
      this.overallStats.totalCues += event.cueCount;
      this.overallStats.totalCharacters += event.characterCount;
    }

    if (event.cached) {
      this.overallStats.cachedTranslations++;
    }

    this.overallStats.totalDurationMs += event.durationMs;

    // Calculate derived metrics
    if (this.overallStats.totalCues > 0) {
      this.overallStats.avgTimePerCueMs =
        this.overallStats.totalDurationMs / this.overallStats.totalCues;
    }

    if (this.overallStats.totalTranslations > 0) {
      this.overallStats.successRate =
        this.overallStats.successfulTranslations / this.overallStats.totalTranslations;
      this.overallStats.cacheHitRate =
        this.overallStats.cachedTranslations / this.overallStats.totalTranslations;
    }

    // Update most used provider and language
    const providerStats = this.getProviderStats();
    if (providerStats.length > 0) {
      this.overallStats.mostUsedProvider = providerStats[0].provider;
    }

    const languageStats = this.getLanguageStats();
    if (languageStats.length > 0) {
      this.overallStats.mostTranslatedLanguage = languageStats[0].language;
    }

    // Update date range
    const dateStr = this.getDateString(event.timestamp);
    if (!this.overallStats.firstTranslationDate) {
      this.overallStats.firstTranslationDate = dateStr;
    }
    this.overallStats.lastTranslationDate = dateStr;
  }

  private cleanupOldStats(): void {
    const cutoffDate = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffStr = this.getDateString(cutoffDate);

    for (const [date] of this.dailyStats) {
      if (date < cutoffStr) {
        this.dailyStats.delete(date);
      }
    }
  }

  private getDateString(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const data = await chrome.storage.local.get([
        `${this.config.storageKey}_daily`,
        `${this.config.storageKey}_overall`,
      ]);

      const dailyData = data[`${this.config.storageKey}_daily`];
      if (Array.isArray(dailyData)) {
        this.dailyStats = new Map(dailyData as [string, DailyStats][]);
      }

      const overallData = data[`${this.config.storageKey}_overall`];
      if (overallData) {
        this.overallStats = { ...this.createEmptyOverallStats(), ...overallData };
      }

      log.debug('Loaded stats from storage', {
        dailyCount: this.dailyStats.size,
        totalTranslations: this.overallStats.totalTranslations,
      });
    } catch (error) {
      log.error('Failed to load stats from storage', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [`${this.config.storageKey}_daily`]: Array.from(this.dailyStats.entries()),
        [`${this.config.storageKey}_overall`]: this.overallStats,
      });
    } catch (error) {
      log.error('Failed to save stats to storage', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let statsTracker: TranslationStatsTracker | null = null;

/**
 * Get the global stats tracker instance
 */
export function getStatsTracker(): TranslationStatsTracker {
  if (!statsTracker) {
    statsTracker = new TranslationStatsTracker();
  }
  return statsTracker;
}

/**
 * Initialize the global stats tracker
 */
export async function initStatsTracker(config?: Partial<StatsConfig>): Promise<TranslationStatsTracker> {
  if (statsTracker) {
    await statsTracker.clearStats();
  }
  statsTracker = new TranslationStatsTracker(config);
  await statsTracker.initialize();
  return statsTracker;
}

/**
 * Quick record of a successful translation
 */
export async function recordTranslationSuccess(
  provider: string,
  platform: string,
  sourceLanguage: string,
  targetLanguage: string,
  cueCount: number,
  characterCount: number,
  durationMs: number,
  cached = false
): Promise<void> {
  const tracker = getStatsTracker();
  await tracker.initialize();
  await tracker.recordSuccess(
    provider,
    platform,
    sourceLanguage,
    targetLanguage,
    cueCount,
    characterCount,
    durationMs,
    cached
  );
}

/**
 * Quick record of a failed translation
 */
export async function recordTranslationFailure(
  provider: string,
  platform: string,
  sourceLanguage: string,
  targetLanguage: string,
  errorCode: string,
  durationMs: number
): Promise<void> {
  const tracker = getStatsTracker();
  await tracker.initialize();
  await tracker.recordFailure(
    provider,
    platform,
    sourceLanguage,
    targetLanguage,
    errorCode,
    durationMs
  );
}

/**
 * Get usage summary
 */
export async function getUsageSummary(): Promise<ReturnType<TranslationStatsTracker['getUsageSummary']>> {
  const tracker = getStatsTracker();
  await tracker.initialize();
  return tracker.getUsageSummary();
}
