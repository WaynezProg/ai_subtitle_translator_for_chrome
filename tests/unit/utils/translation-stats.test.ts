/**
 * Tests for Translation Statistics Tracker
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TranslationStatsTracker,
  getStatsTracker,
  recordTranslationSuccess,
  recordTranslationFailure,
  getUsageSummary,
} from '@shared/utils/translation-stats';

describe('TranslationStatsTracker', () => {
  let tracker: TranslationStatsTracker;

  beforeEach(async () => {
    tracker = new TranslationStatsTracker({
      persistent: false, // Disable persistence for tests
    });
    await tracker.initialize();
  });

  afterEach(async () => {
    await tracker.clearStats();
  });

  describe('initialization', () => {
    it('should initialize with empty stats', () => {
      const overall = tracker.getOverallStats();

      expect(overall.totalTranslations).toBe(0);
      expect(overall.successfulTranslations).toBe(0);
      expect(overall.totalCues).toBe(0);
    });

    it('should not reinitialize if already initialized', async () => {
      await tracker.recordSuccess('test', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.initialize(); // Should not clear stats

      const overall = tracker.getOverallStats();
      expect(overall.totalTranslations).toBe(1);
    });
  });

  describe('recordSuccess', () => {
    it('should record successful translation', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);

      const overall = tracker.getOverallStats();
      expect(overall.totalTranslations).toBe(1);
      expect(overall.successfulTranslations).toBe(1);
      expect(overall.totalCues).toBe(50);
      expect(overall.totalCharacters).toBe(5000);
    });

    it('should record cached translation', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 100, true);

      const overall = tracker.getOverallStats();
      expect(overall.cachedTranslations).toBe(1);
    });

    it('should track provider usage', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('openai-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);

      const providerStats = tracker.getProviderStats();

      const claudeStats = providerStats.find((p) => p.provider === 'claude-api');
      const openaiStats = providerStats.find((p) => p.provider === 'openai-api');

      expect(claudeStats?.count).toBe(2);
      expect(openaiStats?.count).toBe(1);
    });

    it('should track language usage', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'ja', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);

      const languageStats = tracker.getLanguageStats();

      const zhTWStats = languageStats.find((l) => l.language === 'zh-TW');
      const jaStats = languageStats.find((l) => l.language === 'ja');

      expect(zhTWStats?.count).toBe(2);
      expect(jaStats?.count).toBe(1);
    });
  });

  describe('recordFailure', () => {
    it('should record failed translation', async () => {
      await tracker.recordFailure('claude-api', 'youtube', 'en', 'zh-TW', 'RATE_LIMITED', 5000);

      const overall = tracker.getOverallStats();
      expect(overall.totalTranslations).toBe(1);
      expect(overall.successfulTranslations).toBe(0);

      const today = tracker.getTodayStats();
      expect(today.failedTranslations).toBe(1);
    });
  });

  describe('getTodayStats', () => {
    it('should return stats for today', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);

      const today = tracker.getTodayStats();

      expect(today.totalTranslations).toBe(1);
      expect(today.successfulTranslations).toBe(1);
      expect(today.totalCues).toBe(50);
    });

    it('should return empty stats if no translations today', () => {
      const today = tracker.getTodayStats();

      expect(today.totalTranslations).toBe(0);
    });
  });

  describe('getRecentStats', () => {
    it('should return stats for recent days', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);

      const recent = tracker.getRecentStats(7);

      expect(recent.length).toBeGreaterThanOrEqual(1);
      expect(recent[0].totalTranslations).toBe(1);
    });

    it('should return empty array if no recent stats', () => {
      const recent = tracker.getRecentStats(7);

      // May contain today's empty stats
      const hasData = recent.some((s) => s.totalTranslations > 0);
      expect(hasData).toBe(false);
    });
  });

  describe('getOverallStats', () => {
    it('should calculate derived metrics correctly', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);
      await tracker.recordFailure('claude-api', 'youtube', 'en', 'zh-TW', 'ERROR', 1000);

      const overall = tracker.getOverallStats();

      expect(overall.totalTranslations).toBe(3);
      expect(overall.successfulTranslations).toBe(2);
      expect(overall.successRate).toBeCloseTo(2 / 3);
      expect(overall.avgTimePerCueMs).toBe(210); // 21000ms (including failure duration) / 100 cues
    });

    it('should track most used provider', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('openai-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);

      const overall = tracker.getOverallStats();
      expect(overall.mostUsedProvider).toBe('claude-api');
    });

    it('should track most translated language', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'ja', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);

      const overall = tracker.getOverallStats();
      expect(overall.mostTranslatedLanguage).toBe('zh-TW');
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 30, 3000, 8000);

      const summary = tracker.getUsageSummary();

      expect(summary.today.translations).toBe(2);
      expect(summary.today.characters).toBe(8000);
      expect(summary.total.translations).toBe(2);
    });
  });

  describe('getProviderStats', () => {
    it('should return provider statistics with percentages', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('openai-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('openai-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);

      const stats = tracker.getProviderStats();

      expect(stats.length).toBe(2);
      expect(stats[0].percentage).toBeCloseTo(50);
      expect(stats[1].percentage).toBeCloseTo(50);
    });

    it('should sort by count descending', async () => {
      await tracker.recordSuccess('openai-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 10, 100, 1000);

      const stats = tracker.getProviderStats();

      expect(stats[0].provider).toBe('claude-api');
      expect(stats[0].count).toBe(3);
    });
  });

  describe('clearStats', () => {
    it('should clear all statistics', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);
      await tracker.clearStats();

      const overall = tracker.getOverallStats();
      expect(overall.totalTranslations).toBe(0);

      const today = tracker.getTodayStats();
      expect(today.totalTranslations).toBe(0);
    });
  });

  describe('exportStats', () => {
    it('should export stats as JSON', async () => {
      await tracker.recordSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);

      const exported = tracker.exportStats();
      const parsed = JSON.parse(exported);

      expect(parsed.overall).toBeDefined();
      expect(parsed.daily).toBeDefined();
      expect(parsed.exportedAt).toBeDefined();
    });
  });
});

describe('Global stats functions', () => {
  beforeEach(async () => {
    const tracker = getStatsTracker();
    await tracker.clearStats();
  });

  describe('getStatsTracker', () => {
    it('should return singleton instance', () => {
      const tracker1 = getStatsTracker();
      const tracker2 = getStatsTracker();

      expect(tracker1).toBe(tracker2);
    });
  });

  describe('recordTranslationSuccess', () => {
    it('should record successful translation', async () => {
      await recordTranslationSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);

      const tracker = getStatsTracker();
      const overall = tracker.getOverallStats();

      expect(overall.totalTranslations).toBe(1);
      expect(overall.successfulTranslations).toBe(1);
    });
  });

  describe('recordTranslationFailure', () => {
    it('should record failed translation', async () => {
      await recordTranslationFailure('claude-api', 'youtube', 'en', 'zh-TW', 'RATE_LIMITED', 5000);

      const tracker = getStatsTracker();
      const overall = tracker.getOverallStats();

      expect(overall.totalTranslations).toBe(1);
      expect(overall.successfulTranslations).toBe(0);
    });
  });

  describe('getUsageSummary', () => {
    it('should return usage summary', async () => {
      await recordTranslationSuccess('claude-api', 'youtube', 'en', 'zh-TW', 50, 5000, 10000);

      const summary = await getUsageSummary();

      expect(summary.today.translations).toBe(1);
      expect(summary.total.translations).toBe(1);
    });
  });
});
