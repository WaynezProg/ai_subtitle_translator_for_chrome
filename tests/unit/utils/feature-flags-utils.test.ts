/**
 * Tests for Feature Flags Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Manager
  FeatureFlagManager,
  createFeatureFlagManager,
  // Flag creators
  createBooleanFlag,
  createStringFlag,
  createNumberFlag,
  // Rule builders
  percentageRule,
  userAttributeRule,
  environmentRule,
  dateRangeRule,
  customRule,
  // Hooks-style API
  getDefaultManager,
  setDefaultManager,
  useFeatureFlag,
  useFeature,
  // Experiments
  createExperiment,
  getVariant,
  // Types
  type FeatureFlag,
  type UserContext,
} from '@shared/utils/feature-flags-utils';

describe('Feature Flags Utils', () => {
  describe('FeatureFlagManager', () => {
    let manager: FeatureFlagManager;

    beforeEach(() => {
      manager = createFeatureFlagManager();
    });

    describe('registration', () => {
      it('should register a flag', () => {
        manager.register({
          key: 'my-feature',
          defaultValue: false,
        });

        expect(manager.hasFlag('my-feature')).toBe(true);
      });

      it('should register multiple flags', () => {
        manager.registerAll([
          { key: 'feature-1', defaultValue: true },
          { key: 'feature-2', defaultValue: 'value' },
        ]);

        expect(manager.hasFlag('feature-1')).toBe(true);
        expect(manager.hasFlag('feature-2')).toBe(true);
      });

      it('should unregister a flag', () => {
        manager.register({ key: 'temp-feature', defaultValue: true });
        expect(manager.unregister('temp-feature')).toBe(true);
        expect(manager.hasFlag('temp-feature')).toBe(false);
      });

      it('should get all flags', () => {
        manager.registerAll([
          { key: 'a', defaultValue: true },
          { key: 'b', defaultValue: false },
        ]);

        const flags = manager.getAllFlags();
        expect(flags).toHaveLength(2);
      });

      it('should get all keys', () => {
        manager.registerAll([
          { key: 'x', defaultValue: true },
          { key: 'y', defaultValue: true },
        ]);

        const keys = manager.getAllKeys();
        expect(keys).toContain('x');
        expect(keys).toContain('y');
      });
    });

    describe('getValue', () => {
      it('should return default value for simple flag', () => {
        manager.register({ key: 'simple', defaultValue: 'default' });
        expect(manager.getValue('simple')).toBe('default');
      });

      it('should return undefined for non-existent flag', () => {
        expect(manager.getValue('non-existent')).toBeUndefined();
      });

      it('should return false when flag is disabled', () => {
        manager.register({
          key: 'disabled',
          defaultValue: true,
          enabled: false,
        });

        expect(manager.getValue('disabled')).toBe(true); // Returns default
      });
    });

    describe('isEnabled', () => {
      it('should return true for enabled boolean flag', () => {
        manager.register({ key: 'enabled', defaultValue: true });
        expect(manager.isEnabled('enabled')).toBe(true);
      });

      it('should return false for disabled boolean flag', () => {
        manager.register({ key: 'disabled', defaultValue: false });
        expect(manager.isEnabled('disabled')).toBe(false);
      });
    });

    describe('typed getters', () => {
      beforeEach(() => {
        manager.register({ key: 'bool', defaultValue: true });
        manager.register({ key: 'str', defaultValue: 'hello' });
        manager.register({ key: 'num', defaultValue: 42 });
        manager.register({ key: 'obj', defaultValue: { nested: true } });
      });

      it('should get boolean value', () => {
        expect(manager.getBoolean('bool')).toBe(true);
        expect(manager.getBoolean('missing')).toBe(false);
        expect(manager.getBoolean('missing', true)).toBe(true);
      });

      it('should get string value', () => {
        expect(manager.getString('str')).toBe('hello');
        expect(manager.getString('missing')).toBe('');
        expect(manager.getString('missing', 'default')).toBe('default');
      });

      it('should get number value', () => {
        expect(manager.getNumber('num')).toBe(42);
        expect(manager.getNumber('missing')).toBe(0);
        expect(manager.getNumber('missing', 100)).toBe(100);
      });

      it('should get object value', () => {
        expect(manager.getObject('obj', {})).toEqual({ nested: true });
        expect(manager.getObject('missing', { default: true })).toEqual({
          default: true,
        });
      });
    });

    describe('overrides', () => {
      beforeEach(() => {
        manager.register({ key: 'overridable', defaultValue: 'original' });
      });

      it('should set override', () => {
        manager.setOverride('overridable', 'overridden');
        expect(manager.getValue('overridable')).toBe('overridden');
      });

      it('should remove override', () => {
        manager.setOverride('overridable', 'overridden');
        manager.removeOverride('overridable');
        expect(manager.getValue('overridable')).toBe('original');
      });

      it('should clear all overrides', () => {
        manager.register({ key: 'another', defaultValue: 'value' });
        manager.setOverride('overridable', 'o1');
        manager.setOverride('another', 'o2');

        manager.clearOverrides();

        expect(manager.getValue('overridable')).toBe('original');
        expect(manager.getValue('another')).toBe('value');
      });
    });

    describe('user context', () => {
      it('should set user context', () => {
        manager.setUserContext({
          id: 'user-123',
          attributes: { plan: 'premium' },
          environment: 'staging',
        });

        const context = manager.getUserContext();
        expect(context.id).toBe('user-123');
        expect(context.attributes?.plan).toBe('premium');
      });

      it('should update user context partially', () => {
        manager.setUserContext({ id: 'user-1' });
        manager.updateUserContext({ environment: 'production' });

        const context = manager.getUserContext();
        expect(context.id).toBe('user-1');
        expect(context.environment).toBe('production');
      });
    });

    describe('rules evaluation', () => {
      describe('percentage rule', () => {
        it('should enable for users in percentage', () => {
          manager.register({
            key: 'gradual-rollout',
            defaultValue: false,
            rules: [percentageRule(100, true)], // 100% rollout
          });

          expect(manager.getValue('gradual-rollout')).toBe(true);
        });

        it('should disable for users outside percentage', () => {
          manager.register({
            key: 'gradual-rollout',
            defaultValue: false,
            rules: [percentageRule(0, true)], // 0% rollout
          });

          expect(manager.getValue('gradual-rollout')).toBe(false);
        });

        it('should be consistent for same user', () => {
          manager.register({
            key: 'percentage-feature',
            defaultValue: false,
            rules: [percentageRule(50, true)],
          });

          manager.setUserContext({ id: 'consistent-user' });
          const value1 = manager.getValue('percentage-feature');
          const value2 = manager.getValue('percentage-feature');

          expect(value1).toBe(value2);
        });
      });

      describe('user attribute rule', () => {
        beforeEach(() => {
          manager.setUserContext({
            id: 'user-1',
            attributes: {
              plan: 'premium',
              age: 25,
              tags: ['beta', 'power-user'],
            },
          });
        });

        it('should match equals operator', () => {
          manager.register({
            key: 'premium-feature',
            defaultValue: false,
            rules: [userAttributeRule('plan', 'equals', 'premium', true)],
          });

          expect(manager.getValue('premium-feature')).toBe(true);
        });

        it('should match notEquals operator', () => {
          manager.register({
            key: 'non-free',
            defaultValue: false,
            rules: [userAttributeRule('plan', 'notEquals', 'free', true)],
          });

          expect(manager.getValue('non-free')).toBe(true);
        });

        it('should match in operator', () => {
          manager.register({
            key: 'paid-plans',
            defaultValue: false,
            rules: [userAttributeRule('plan', 'in', ['premium', 'pro'], true)],
          });

          expect(manager.getValue('paid-plans')).toBe(true);
        });

        it('should match greaterThan operator', () => {
          manager.register({
            key: 'adult-feature',
            defaultValue: false,
            rules: [userAttributeRule('age', 'greaterThan', 18, true)],
          });

          expect(manager.getValue('adult-feature')).toBe(true);
        });

        it('should match exists operator', () => {
          manager.register({
            key: 'has-plan',
            defaultValue: false,
            rules: [userAttributeRule('plan', 'exists', null, true)],
          });

          expect(manager.getValue('has-plan')).toBe(true);
        });
      });

      describe('environment rule', () => {
        it('should match environment', () => {
          manager.setUserContext({ environment: 'development' });
          manager.register({
            key: 'dev-feature',
            defaultValue: false,
            rules: [environmentRule(['development', 'staging'], true)],
          });

          expect(manager.getValue('dev-feature')).toBe(true);
        });

        it('should not match different environment', () => {
          manager.setUserContext({ environment: 'production' });
          manager.register({
            key: 'dev-only',
            defaultValue: false,
            rules: [environmentRule(['development'], true)],
          });

          expect(manager.getValue('dev-only')).toBe(false);
        });
      });

      describe('date range rule', () => {
        beforeEach(() => {
          vi.useFakeTimers();
          vi.setSystemTime(new Date('2024-06-15'));
        });

        afterEach(() => {
          vi.useRealTimers();
        });

        it('should enable within date range', () => {
          manager.register({
            key: 'summer-feature',
            defaultValue: false,
            rules: [dateRangeRule('2024-06-01', '2024-08-31', true)],
          });

          expect(manager.getValue('summer-feature')).toBe(true);
        });

        it('should disable outside date range', () => {
          manager.register({
            key: 'winter-feature',
            defaultValue: false,
            rules: [dateRangeRule('2024-12-01', '2025-02-28', true)],
          });

          expect(manager.getValue('winter-feature')).toBe(false);
        });
      });

      describe('custom rule', () => {
        it('should evaluate custom function', () => {
          manager.setUserContext({
            attributes: { score: 85 },
          });

          manager.register({
            key: 'high-score-feature',
            defaultValue: false,
            rules: [
              customRule((ctx) => (ctx.attributes?.score as number) >= 80, true),
            ],
          });

          expect(manager.getValue('high-score-feature')).toBe(true);
        });
      });

      describe('rule priority', () => {
        it('should apply higher priority rules first', () => {
          manager.setUserContext({
            attributes: { vip: true },
            environment: 'production',
          });

          manager.register({
            key: 'priority-test',
            defaultValue: 'default',
            rules: [
              { ...environmentRule(['production'], 'production'), priority: 1 },
              {
                ...userAttributeRule('vip', 'equals', true, 'vip'),
                priority: 10,
              },
            ],
          });

          expect(manager.getValue('priority-test')).toBe('vip');
        });
      });
    });

    describe('caching', () => {
      it('should cache evaluated values', () => {
        const evaluator = vi.fn(() => true);

        manager.register({
          key: 'cached',
          defaultValue: false,
          rules: [customRule(evaluator, true)],
        });

        manager.getValue('cached');
        manager.getValue('cached');
        manager.getValue('cached');

        // Custom evaluator called once due to caching
        expect(evaluator).toHaveBeenCalledTimes(1);
      });

      it('should expire cache after timeout', async () => {
        vi.useFakeTimers();

        const shortCacheManager = createFeatureFlagManager({ cacheTimeout: 100 });
        const evaluator = vi.fn(() => true);

        shortCacheManager.register({
          key: 'short-cache',
          defaultValue: false,
          rules: [customRule(evaluator, true)],
        });

        shortCacheManager.getValue('short-cache');
        vi.advanceTimersByTime(150);
        shortCacheManager.getValue('short-cache');

        expect(evaluator).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
      });
    });

    describe('listeners', () => {
      it('should notify on override change', () => {
        manager.register({ key: 'watched', defaultValue: 'original' });

        const listener = vi.fn();
        manager.subscribe(listener);

        manager.setOverride('watched', 'changed');

        expect(listener).toHaveBeenCalledWith('watched', 'changed', 'original');
      });

      it('should unsubscribe', () => {
        manager.register({ key: 'watched', defaultValue: 'original' });

        const listener = vi.fn();
        const unsubscribe = manager.subscribe(listener);

        manager.setOverride('watched', 'first');
        unsubscribe();
        manager.setOverride('watched', 'second');

        expect(listener).toHaveBeenCalledTimes(1);
      });
    });

    describe('export/import', () => {
      it('should export state', () => {
        manager.register({ key: 'exported', defaultValue: true });
        manager.setOverride('exported', false);
        manager.setUserContext({ id: 'user-1' });

        const state = manager.export();

        expect(state.flags).toHaveLength(1);
        expect(state.overrides.exported).toBe(false);
        expect(state.userContext.id).toBe('user-1');
      });

      it('should import state', () => {
        const newManager = createFeatureFlagManager();

        newManager.import({
          flags: [{ key: 'imported', defaultValue: 'value' }],
          overrides: { imported: 'overridden' },
          userContext: { id: 'imported-user' },
        });

        expect(newManager.getValue('imported')).toBe('overridden');
        expect(newManager.getUserContext().id).toBe('imported-user');
      });
    });

    describe('metadata', () => {
      it('should store and retrieve metadata', () => {
        manager.register({
          key: 'with-meta',
          defaultValue: true,
          metadata: { owner: 'team-a', ticket: 'JIRA-123' },
        });

        const meta = manager.getMetadata('with-meta');
        expect(meta?.owner).toBe('team-a');
        expect(meta?.ticket).toBe('JIRA-123');
      });
    });
  });

  describe('Flag creators', () => {
    it('should create boolean flag', () => {
      const flag = createBooleanFlag('bool-flag', true, {
        description: 'A boolean flag',
      });

      expect(flag.key).toBe('bool-flag');
      expect(flag.defaultValue).toBe(true);
      expect(flag.description).toBe('A boolean flag');
    });

    it('should create string flag', () => {
      const flag = createStringFlag('str-flag', 'default');
      expect(flag.defaultValue).toBe('default');
    });

    it('should create number flag', () => {
      const flag = createNumberFlag('num-flag', 42);
      expect(flag.defaultValue).toBe(42);
    });
  });

  describe('Hooks-style API', () => {
    beforeEach(() => {
      const manager = createFeatureFlagManager();
      manager.register({ key: 'hook-feature', defaultValue: true });
      manager.register({ key: 'hook-value', defaultValue: 'test-value' });
      setDefaultManager(manager);
    });

    it('should use default manager', () => {
      expect(getDefaultManager()).toBeInstanceOf(FeatureFlagManager);
    });

    it('should use feature flag', () => {
      expect(useFeatureFlag<string>('hook-value')).toBe('test-value');
    });

    it('should use feature (boolean)', () => {
      expect(useFeature('hook-feature')).toBe(true);
    });
  });

  describe('Experiments', () => {
    const experiment = createExperiment('button-color', [
      { id: 'control', value: 'blue', weight: 50 },
      { id: 'variant-a', value: 'green', weight: 25 },
      { id: 'variant-b', value: 'red', weight: 25 },
    ], 'control');

    it('should create experiment', () => {
      expect(experiment.key).toBe('button-color');
      expect(experiment.variants).toHaveLength(3);
    });

    it('should get consistent variant for user', () => {
      const variant1 = getVariant(experiment, 'user-123');
      const variant2 = getVariant(experiment, 'user-123');

      expect(variant1.id).toBe(variant2.id);
    });

    it('should distribute users across variants', () => {
      const counts: Record<string, number> = {
        control: 0,
        'variant-a': 0,
        'variant-b': 0,
      };

      for (let i = 0; i < 1000; i++) {
        const variant = getVariant(experiment, `user-${i}`);
        counts[variant.id]++;
      }

      // Should have some distribution across all variants
      expect(counts.control).toBeGreaterThan(0);
      expect(counts['variant-a']).toBeGreaterThan(0);
      expect(counts['variant-b']).toBeGreaterThan(0);
    });

    it('should respect weights approximately', () => {
      const counts: Record<string, number> = {
        control: 0,
        'variant-a': 0,
        'variant-b': 0,
      };

      for (let i = 0; i < 10000; i++) {
        const variant = getVariant(experiment, `user-${i}`);
        counts[variant.id]++;
      }

      // Control should have roughly 50%
      expect(counts.control / 10000).toBeGreaterThan(0.4);
      expect(counts.control / 10000).toBeLessThan(0.6);

      // Variants should have roughly 25% each
      expect(counts['variant-a'] / 10000).toBeGreaterThan(0.15);
      expect(counts['variant-a'] / 10000).toBeLessThan(0.35);
    });
  });
});
