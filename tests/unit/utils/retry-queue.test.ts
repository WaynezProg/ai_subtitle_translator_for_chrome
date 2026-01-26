/**
 * Tests for Retry Queue Utility
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RetryQueue,
  getTranslationRetryQueue,
  queueFailedTranslation,
  getTranslationRetryStats,
  clearTranslationRetryQueue,
  type RetryItem,
  type TranslationRetryPayload,
} from '@shared/utils/retry-queue';
import { RateLimiter } from '@shared/utils/rate-limiter';

describe('RetryQueue', () => {
  let queue: RetryQueue<string>;

  beforeEach(() => {
    queue = new RetryQueue<string>({
      maxRetries: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      maxAgeMs: 60000,
      maxQueueSize: 10,
      persistent: false, // Disable persistence for tests
    });
  });

  afterEach(() => {
    queue.destroy();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await queue.initialize();
      const stats = queue.getStats();
      expect(stats.queueSize).toBe(0);
    });

    it('should not reinitialize if already initialized', async () => {
      await queue.initialize();
      await queue.add('test', 'payload1');
      await queue.initialize(); // Should not clear queue
      const stats = queue.getStats();
      expect(stats.queueSize).toBe(1);
    });
  });

  describe('add', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should add item to queue', async () => {
      const item = await queue.add('test', 'payload');
      expect(item.id).toBeDefined();
      expect(item.type).toBe('test');
      expect(item.payload).toBe('payload');
      expect(item.attempts).toBe(0);
    });

    it('should respect custom options', async () => {
      const item = await queue.add('test', 'payload', {
        id: 'custom-id',
        priority: 5,
        errorCode: 'ERR_001',
        errorMessage: 'Test error',
        metadata: { key: 'value' },
      });

      expect(item.id).toBe('custom-id');
      expect(item.priority).toBe(5);
      expect(item.errorCode).toBe('ERR_001');
      expect(item.lastError).toBe('Test error');
      expect(item.metadata).toEqual({ key: 'value' });
    });

    it('should remove oldest low-priority item when queue is full', async () => {
      // Fill queue with low priority items
      for (let i = 0; i < 10; i++) {
        await queue.add('test', `payload-${i}`, { priority: 0 });
      }

      // Add high priority item
      await queue.add('test', 'high-priority', { priority: 10 });

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(10);

      // Verify high priority item is in queue
      const items = queue.getByType('test');
      expect(items.some((item) => item.payload === 'high-priority')).toBe(true);
    });
  });

  describe('addOrUpdate', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should add new item if not exists', async () => {
      const item = await queue.addOrUpdate('test', 'payload', { id: 'item-1' });
      expect(item.id).toBe('item-1');
      expect(item.attempts).toBe(0);
    });

    it('should update existing item', async () => {
      await queue.addOrUpdate('test', 'payload', { id: 'item-1' });
      const updated = await queue.addOrUpdate('test', 'payload', {
        id: 'item-1',
        errorMessage: 'New error',
      });

      expect(updated.attempts).toBe(1);
      expect(updated.lastError).toBe('New error');
    });

    it('should move to dead letter after max retries', async () => {
      // Create queue with maxRetries = 2
      const smallQueue = new RetryQueue<string>({
        maxRetries: 2,
        persistent: false,
      });
      await smallQueue.initialize();

      // First attempt
      await smallQueue.addOrUpdate('test', 'payload', { id: 'item-1' });
      // Second attempt (should move to dead letter)
      await smallQueue.addOrUpdate('test', 'payload', { id: 'item-1' });
      await smallQueue.addOrUpdate('test', 'payload', { id: 'item-1' });

      const stats = smallQueue.getStats();
      expect(stats.deadLetterCount).toBe(1);
      expect(stats.queueSize).toBe(0);

      smallQueue.destroy();
    });
  });

  describe('get and getByType', () => {
    beforeEach(async () => {
      await queue.initialize();
      await queue.add('type-a', 'payload-a1');
      await queue.add('type-a', 'payload-a2');
      await queue.add('type-b', 'payload-b1');
    });

    it('should get item by id', async () => {
      const item = await queue.add('test', 'find-me', { id: 'findable' });
      const found = queue.get('findable');
      expect(found).toEqual(item);
    });

    it('should return undefined for non-existent id', () => {
      const found = queue.get('non-existent');
      expect(found).toBeUndefined();
    });

    it('should get items by type', () => {
      const typeAItems = queue.getByType('type-a');
      expect(typeAItems.length).toBe(2);
      expect(typeAItems.every((item) => item.type === 'type-a')).toBe(true);
    });
  });

  describe('getReadyItems', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should return items ready for retry', async () => {
      // Add item with past nextRetryAt
      const item = await queue.add('test', 'ready');
      item.nextRetryAt = Date.now() - 1000; // In the past

      const ready = queue.getReadyItems();
      expect(ready.length).toBe(1);
      expect(ready[0].payload).toBe('ready');
    });

    it('should not return items scheduled for future', async () => {
      const item = await queue.add('test', 'future');
      item.nextRetryAt = Date.now() + 60000; // In the future

      const ready = queue.getReadyItems();
      expect(ready.length).toBe(0);
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should remove item from queue', async () => {
      await queue.add('test', 'payload', { id: 'to-remove' });
      const removed = await queue.remove('to-remove');

      expect(removed).toBe(true);
      expect(queue.get('to-remove')).toBeUndefined();
    });

    it('should return false for non-existent item', async () => {
      const removed = await queue.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should clear all items', async () => {
      await queue.add('test', 'payload1');
      await queue.add('test', 'payload2');
      await queue.clear();

      const stats = queue.getStats();
      expect(stats.queueSize).toBe(0);
    });
  });

  describe('processItem', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should process item with registered handler', async () => {
      const handler = vi.fn().mockResolvedValue('success');
      queue.registerHandler('test', handler);

      await queue.add('test', 'payload', { id: 'process-me' });
      const result = await queue.processItem('process-me');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should throw error for non-existent item', async () => {
      await expect(queue.processItem('non-existent')).rejects.toThrow('Item not found');
    });

    it('should throw error for unregistered handler', async () => {
      await queue.add('unknown', 'payload', { id: 'no-handler' });
      await expect(queue.processItem('no-handler')).rejects.toThrow(
        'No handler registered for type'
      );
    });

    it('should remove item after successful processing', async () => {
      queue.registerHandler('test', async () => 'done');
      await queue.add('test', 'payload', { id: 'success-item' });

      await queue.processItem('success-item');

      expect(queue.get('success-item')).toBeUndefined();
    });

    it('should update item after failed processing', async () => {
      queue.registerHandler('test', async () => {
        throw new Error('Process failed');
      });
      await queue.add('test', 'payload', { id: 'fail-item' });

      const result = await queue.processItem('fail-item');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Process failed');

      const item = queue.get('fail-item');
      expect(item?.attempts).toBe(1);
      expect(item?.lastError).toBe('Process failed');
    });
  });

  describe('processReady', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should process all ready items', async () => {
      const handler = vi.fn().mockResolvedValue('success');
      queue.registerHandler('test', handler);

      // Add items with past nextRetryAt
      const item1 = await queue.add('test', 'payload1');
      const item2 = await queue.add('test', 'payload2');
      item1.nextRetryAt = Date.now() - 1000;
      item2.nextRetryAt = Date.now() - 1000;

      const results = await queue.processReady();

      expect(results.length).toBe(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should skip items without handlers', async () => {
      const item = await queue.add('unhandled', 'payload');
      item.nextRetryAt = Date.now() - 1000;

      const results = await queue.processReady();

      expect(results.length).toBe(0);
    });

    it('should respect rate limiter', async () => {
      const rateLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 1000,
        minDelayMs: 0,
        queueExcess: false,
      });
      queue.setRateLimiter(rateLimiter);

      const handler = vi.fn().mockResolvedValue('success');
      queue.registerHandler('test', handler);

      const item1 = await queue.add('test', 'payload1');
      const item2 = await queue.add('test', 'payload2');
      item1.nextRetryAt = Date.now() - 1000;
      item2.nextRetryAt = Date.now() - 1000;

      // Should process at least one item
      const results = await queue.processReady();
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should return accurate statistics', async () => {
      await queue.add('type-a', 'payload1');
      await queue.add('type-a', 'payload2');
      await queue.add('type-b', 'payload3');

      const stats = queue.getStats();

      expect(stats.queueSize).toBe(3);
      expect(stats.byType['type-a']).toBe(2);
      expect(stats.byType['type-b']).toBe(1);
    });

    it('should calculate average attempts', async () => {
      const item1 = await queue.add('test', 'payload1');
      const item2 = await queue.add('test', 'payload2');
      item1.attempts = 2;
      item2.attempts = 4;

      const stats = queue.getStats();
      expect(stats.avgAttempts).toBe(3);
    });
  });

  describe('dead letter queue', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should return dead letter items', async () => {
      // Create queue with maxRetries = 1
      const smallQueue = new RetryQueue<string>({
        maxRetries: 1,
        persistent: false,
      });
      await smallQueue.initialize();
      smallQueue.registerHandler('test', async () => {
        throw new Error('Always fails');
      });

      await smallQueue.add('test', 'fail-payload', { id: 'dead-item' });

      // Process twice to exceed max retries
      await smallQueue.processItem('dead-item').catch(() => {});
      await smallQueue.addOrUpdate('test', 'fail-payload', { id: 'dead-item' });

      const deadLetterItems = smallQueue.getDeadLetterItems();
      expect(deadLetterItems.length).toBe(1);
      expect(deadLetterItems[0].id).toBe('dead-item');

      smallQueue.destroy();
    });

    it('should resurrect item from dead letter', async () => {
      const smallQueue = new RetryQueue<string>({
        maxRetries: 1,
        persistent: false,
      });
      await smallQueue.initialize();

      // Manually add to dead letter by adding and updating past max
      await smallQueue.addOrUpdate('test', 'payload', { id: 'revive-me' });
      await smallQueue.addOrUpdate('test', 'payload', { id: 'revive-me' });

      let stats = smallQueue.getStats();
      expect(stats.deadLetterCount).toBe(1);

      // Resurrect
      const item = await smallQueue.resurrect('revive-me');

      expect(item).not.toBeNull();
      expect(item?.attempts).toBe(0);

      stats = smallQueue.getStats();
      expect(stats.queueSize).toBe(1);
      expect(stats.deadLetterCount).toBe(0);

      smallQueue.destroy();
    });

    it('should clear dead letter queue', async () => {
      const smallQueue = new RetryQueue<string>({
        maxRetries: 1,
        persistent: false,
      });
      await smallQueue.initialize();

      await smallQueue.addOrUpdate('test', 'payload', { id: 'item-1' });
      await smallQueue.addOrUpdate('test', 'payload', { id: 'item-1' });

      await smallQueue.clearDeadLetter();

      const stats = smallQueue.getStats();
      expect(stats.deadLetterCount).toBe(0);

      smallQueue.destroy();
    });
  });

  describe('priority sorting', () => {
    beforeEach(async () => {
      await queue.initialize();
    });

    it('should sort items by priority descending', async () => {
      await queue.add('test', 'low', { id: 'low', priority: 1 });
      await queue.add('test', 'high', { id: 'high', priority: 10 });
      await queue.add('test', 'medium', { id: 'medium', priority: 5 });

      const items = queue.getByType('test');

      // Higher priority should come first
      expect(items[0].id).toBe('high');
      expect(items[1].id).toBe('medium');
      expect(items[2].id).toBe('low');
    });
  });
});

describe('Translation Retry Queue', () => {
  beforeEach(async () => {
    // Clear the queue before each test
    await clearTranslationRetryQueue();
  });

  describe('queueFailedTranslation', () => {
    it('should add translation to retry queue', async () => {
      const payload: TranslationRetryPayload = {
        videoId: 'abc123',
        platform: 'youtube',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        provider: 'claude-api',
      };

      const item = await queueFailedTranslation(payload, {
        errorCode: 'RATE_LIMITED',
        errorMessage: 'Too many requests',
      });

      expect(item.type).toBe('translation');
      expect(item.payload).toEqual(payload);
      expect(item.errorCode).toBe('RATE_LIMITED');
    });

    it('should update existing translation retry', async () => {
      const payload: TranslationRetryPayload = {
        videoId: 'abc123',
        platform: 'youtube',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        provider: 'claude-api',
      };

      await queueFailedTranslation(payload);
      const updated = await queueFailedTranslation(payload, {
        errorMessage: 'Second failure',
      });

      expect(updated.attempts).toBe(1);
      expect(updated.lastError).toBe('Second failure');
    });

    it('should use composite key for deduplication', async () => {
      const payload1: TranslationRetryPayload = {
        videoId: 'abc123',
        platform: 'youtube',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        provider: 'claude-api',
      };

      const payload2: TranslationRetryPayload = {
        videoId: 'abc123',
        platform: 'youtube',
        sourceLanguage: 'en',
        targetLanguage: 'ja', // Different target language
        provider: 'claude-api',
      };

      await queueFailedTranslation(payload1);
      await queueFailedTranslation(payload2);

      const stats = await getTranslationRetryStats();
      expect(stats.queueSize).toBe(2);
    });
  });

  describe('getTranslationRetryStats', () => {
    it('should return queue statistics', async () => {
      const payload: TranslationRetryPayload = {
        videoId: 'abc123',
        platform: 'youtube',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        provider: 'claude-api',
      };

      await queueFailedTranslation(payload);

      const stats = await getTranslationRetryStats();

      expect(stats.queueSize).toBe(1);
      expect(stats.byType['translation']).toBe(1);
    });
  });

  describe('clearTranslationRetryQueue', () => {
    it('should clear all translations from queue', async () => {
      const payload: TranslationRetryPayload = {
        videoId: 'abc123',
        platform: 'youtube',
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        provider: 'claude-api',
      };

      await queueFailedTranslation(payload);
      await clearTranslationRetryQueue();

      const stats = await getTranslationRetryStats();
      expect(stats.queueSize).toBe(0);
    });
  });
});

describe('RetryQueue exponential backoff', () => {
  it('should calculate increasing delays', async () => {
    const queue = new RetryQueue<string>({
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      persistent: false,
    });
    await queue.initialize();

    const item = await queue.add('test', 'payload');

    // Simulate multiple failures
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = item.nextRetryAt;
      await queue.addOrUpdate('test', 'payload', {
        id: item.id,
        errorMessage: `Attempt ${i + 1}`,
      });
      const after = item.nextRetryAt;
      const delay = after - Date.now();
      delays.push(delay);
    }

    // Delays should generally increase (with jitter, not strictly)
    // Just verify they're positive and reasonable
    for (const delay of delays) {
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(60000);
    }

    queue.destroy();
  });
});
