/**
 * Feature Flags Utilities
 *
 * Provides feature flag management for controlled feature rollout,
 * A/B testing, and environment-specific configurations.
 */

// =============================================================================
// Types
// =============================================================================

export type FeatureFlagValue = boolean | string | number | Record<string, unknown>;

export interface FeatureFlag<T = FeatureFlagValue> {
  key: string;
  defaultValue: T;
  description?: string;
  enabled?: boolean;
  rules?: FeatureFlagRule<T>[];
  metadata?: Record<string, unknown>;
}

export interface FeatureFlagRule<T> {
  condition: FeatureFlagCondition;
  value: T;
  priority?: number;
}

export interface FeatureFlagCondition {
  type: 'percentage' | 'userAttribute' | 'environment' | 'dateRange' | 'custom';
  config: Record<string, unknown>;
}

export interface UserContext {
  id?: string;
  attributes?: Record<string, unknown>;
  environment?: string;
}

export type FlagChangeListener<T = FeatureFlagValue> = (
  key: string,
  newValue: T,
  oldValue: T
) => void;

// =============================================================================
// Feature Flag Manager
// =============================================================================

export class FeatureFlagManager {
  private flags = new Map<string, FeatureFlag>();
  private overrides = new Map<string, FeatureFlagValue>();
  private userContext: UserContext = {};
  private listeners = new Set<FlagChangeListener>();
  private evaluationCache = new Map<string, { value: FeatureFlagValue; timestamp: number }>();
  private cacheTimeout: number;

  constructor(options: { cacheTimeout?: number } = {}) {
    this.cacheTimeout = options.cacheTimeout ?? 60000; // 1 minute default
  }

  /**
   * Register a feature flag
   */
  register<T extends FeatureFlagValue>(flag: FeatureFlag<T>): void {
    this.flags.set(flag.key, flag as FeatureFlag);
    this.clearCache(flag.key);
  }

  /**
   * Register multiple flags
   */
  registerAll(flags: FeatureFlag[]): void {
    flags.forEach((flag) => this.register(flag));
  }

  /**
   * Unregister a flag
   */
  unregister(key: string): boolean {
    this.clearCache(key);
    return this.flags.delete(key);
  }

  /**
   * Set user context for evaluation
   */
  setUserContext(context: UserContext): void {
    this.userContext = context;
    this.clearAllCache();
  }

  /**
   * Update user context partially
   */
  updateUserContext(updates: Partial<UserContext>): void {
    this.userContext = { ...this.userContext, ...updates };
    if (updates.attributes) {
      this.userContext.attributes = {
        ...this.userContext.attributes,
        ...updates.attributes,
      };
    }
    this.clearAllCache();
  }

  /**
   * Get user context
   */
  getUserContext(): UserContext {
    return { ...this.userContext };
  }

  /**
   * Check if a boolean flag is enabled
   */
  isEnabled(key: string): boolean {
    const value = this.getValue(key);
    return value === true;
  }

  /**
   * Get flag value
   */
  getValue<T extends FeatureFlagValue>(key: string): T {
    // Check cache first
    const cached = this.evaluationCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.value as T;
    }

    // Check overrides
    if (this.overrides.has(key)) {
      const value = this.overrides.get(key)! as T;
      this.cacheValue(key, value);
      return value;
    }

    // Get flag
    const flag = this.flags.get(key);
    if (!flag) {
      return undefined as unknown as T;
    }

    // Check if globally disabled
    if (flag.enabled === false) {
      this.cacheValue(key, flag.defaultValue as T);
      return flag.defaultValue as T;
    }

    // Evaluate rules
    if (flag.rules && flag.rules.length > 0) {
      const sortedRules = [...flag.rules].sort(
        (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
      );

      for (const rule of sortedRules) {
        if (this.evaluateCondition(rule.condition)) {
          this.cacheValue(key, rule.value as T);
          return rule.value as T;
        }
      }
    }

    this.cacheValue(key, flag.defaultValue as T);
    return flag.defaultValue as T;
  }

  /**
   * Get flag with type assertion
   */
  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const value = this.getValue(key);
    return typeof value === 'boolean' ? value : defaultValue;
  }

  getString(key: string, defaultValue: string = ''): string {
    const value = this.getValue(key);
    return typeof value === 'string' ? value : defaultValue;
  }

  getNumber(key: string, defaultValue: number = 0): number {
    const value = this.getValue(key);
    return typeof value === 'number' ? value : defaultValue;
  }

  getObject<T extends Record<string, unknown>>(key: string, defaultValue: T): T {
    const value = this.getValue(key);
    return typeof value === 'object' && value !== null ? (value as T) : defaultValue;
  }

  /**
   * Set override for a flag
   */
  setOverride<T extends FeatureFlagValue>(key: string, value: T): void {
    const oldValue = this.getValue(key);
    this.overrides.set(key, value);
    this.clearCache(key);
    this.notifyListeners(key, value, oldValue);
  }

  /**
   * Remove override for a flag
   */
  removeOverride(key: string): void {
    const oldValue = this.getValue(key);
    this.overrides.delete(key);
    this.clearCache(key);
    const newValue = this.getValue(key);
    this.notifyListeners(key, newValue, oldValue);
  }

  /**
   * Clear all overrides
   */
  clearOverrides(): void {
    this.overrides.clear();
    this.clearAllCache();
  }

  /**
   * Get all registered flags
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get all flag keys
   */
  getAllKeys(): string[] {
    return Array.from(this.flags.keys());
  }

  /**
   * Check if flag exists
   */
  hasFlag(key: string): boolean {
    return this.flags.has(key);
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(listener: FlagChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get flag metadata
   */
  getMetadata(key: string): Record<string, unknown> | undefined {
    return this.flags.get(key)?.metadata;
  }

  /**
   * Export current state
   */
  export(): {
    flags: FeatureFlag[];
    overrides: Record<string, FeatureFlagValue>;
    userContext: UserContext;
  } {
    return {
      flags: this.getAllFlags(),
      overrides: Object.fromEntries(this.overrides),
      userContext: this.getUserContext(),
    };
  }

  /**
   * Import state
   */
  import(state: {
    flags?: FeatureFlag[];
    overrides?: Record<string, FeatureFlagValue>;
    userContext?: UserContext;
  }): void {
    if (state.flags) {
      this.registerAll(state.flags);
    }
    if (state.overrides) {
      for (const [key, value] of Object.entries(state.overrides)) {
        this.overrides.set(key, value);
      }
    }
    if (state.userContext) {
      this.setUserContext(state.userContext);
    }
    this.clearAllCache();
  }

  private evaluateCondition(condition: FeatureFlagCondition): boolean {
    switch (condition.type) {
      case 'percentage':
        return this.evaluatePercentage(condition.config);
      case 'userAttribute':
        return this.evaluateUserAttribute(condition.config);
      case 'environment':
        return this.evaluateEnvironment(condition.config);
      case 'dateRange':
        return this.evaluateDateRange(condition.config);
      case 'custom':
        return this.evaluateCustom(condition.config);
      default:
        return false;
    }
  }

  private evaluatePercentage(config: Record<string, unknown>): boolean {
    const percentage = config.percentage as number;
    if (typeof percentage !== 'number') return false;

    // Use user ID for consistent bucketing
    const userId = this.userContext.id || 'anonymous';
    const hash = this.hashString(userId);
    const bucket = hash % 100;

    return bucket < percentage;
  }

  private evaluateUserAttribute(config: Record<string, unknown>): boolean {
    const { attribute, operator, value } = config;
    const userValue = this.userContext.attributes?.[attribute as string];

    switch (operator) {
      case 'equals':
        return userValue === value;
      case 'notEquals':
        return userValue !== value;
      case 'contains':
        return typeof userValue === 'string' && userValue.includes(value as string);
      case 'in':
        return Array.isArray(value) && value.includes(userValue);
      case 'notIn':
        return Array.isArray(value) && !value.includes(userValue);
      case 'greaterThan':
        return typeof userValue === 'number' && userValue > (value as number);
      case 'lessThan':
        return typeof userValue === 'number' && userValue < (value as number);
      case 'exists':
        return userValue !== undefined;
      case 'notExists':
        return userValue === undefined;
      default:
        return false;
    }
  }

  private evaluateEnvironment(config: Record<string, unknown>): boolean {
    const environments = config.environments as string[];
    if (!Array.isArray(environments)) return false;

    return environments.includes(this.userContext.environment || 'production');
  }

  private evaluateDateRange(config: Record<string, unknown>): boolean {
    const now = Date.now();
    const start = config.start ? new Date(config.start as string).getTime() : 0;
    const end = config.end ? new Date(config.end as string).getTime() : Infinity;

    return now >= start && now <= end;
  }

  private evaluateCustom(config: Record<string, unknown>): boolean {
    const evaluator = config.evaluator as ((context: UserContext) => boolean) | undefined;
    if (typeof evaluator !== 'function') return false;

    try {
      return evaluator(this.userContext);
    } catch {
      return false;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private cacheValue(key: string, value: FeatureFlagValue): void {
    this.evaluationCache.set(key, { value, timestamp: Date.now() });
  }

  private clearCache(key: string): void {
    this.evaluationCache.delete(key);
  }

  private clearAllCache(): void {
    this.evaluationCache.clear();
  }

  private notifyListeners(
    key: string,
    newValue: FeatureFlagValue,
    oldValue: FeatureFlagValue
  ): void {
    if (newValue !== oldValue) {
      this.listeners.forEach((listener) => listener(key, newValue, oldValue));
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a feature flag manager
 */
export function createFeatureFlagManager(
  options?: { cacheTimeout?: number }
): FeatureFlagManager {
  return new FeatureFlagManager(options);
}

/**
 * Create a boolean feature flag
 */
export function createBooleanFlag(
  key: string,
  defaultValue: boolean,
  options?: {
    description?: string;
    rules?: FeatureFlagRule<boolean>[];
    metadata?: Record<string, unknown>;
  }
): FeatureFlag<boolean> {
  return {
    key,
    defaultValue,
    enabled: true,
    ...options,
  };
}

/**
 * Create a string feature flag
 */
export function createStringFlag(
  key: string,
  defaultValue: string,
  options?: {
    description?: string;
    rules?: FeatureFlagRule<string>[];
    metadata?: Record<string, unknown>;
  }
): FeatureFlag<string> {
  return {
    key,
    defaultValue,
    enabled: true,
    ...options,
  };
}

/**
 * Create a number feature flag
 */
export function createNumberFlag(
  key: string,
  defaultValue: number,
  options?: {
    description?: string;
    rules?: FeatureFlagRule<number>[];
    metadata?: Record<string, unknown>;
  }
): FeatureFlag<number> {
  return {
    key,
    defaultValue,
    enabled: true,
    ...options,
  };
}

// =============================================================================
// Rule Builders
// =============================================================================

/**
 * Create a percentage-based rule
 */
export function percentageRule<T>(percentage: number, value: T): FeatureFlagRule<T> {
  return {
    condition: {
      type: 'percentage',
      config: { percentage },
    },
    value,
  };
}

/**
 * Create a user attribute rule
 */
export function userAttributeRule<T>(
  attribute: string,
  operator: 'equals' | 'notEquals' | 'contains' | 'in' | 'notIn' | 'greaterThan' | 'lessThan' | 'exists' | 'notExists',
  compareValue: unknown,
  value: T
): FeatureFlagRule<T> {
  return {
    condition: {
      type: 'userAttribute',
      config: { attribute, operator, value: compareValue },
    },
    value,
  };
}

/**
 * Create an environment rule
 */
export function environmentRule<T>(
  environments: string[],
  value: T
): FeatureFlagRule<T> {
  return {
    condition: {
      type: 'environment',
      config: { environments },
    },
    value,
  };
}

/**
 * Create a date range rule
 */
export function dateRangeRule<T>(
  start: Date | string | null,
  end: Date | string | null,
  value: T
): FeatureFlagRule<T> {
  return {
    condition: {
      type: 'dateRange',
      config: {
        start: start ? new Date(start).toISOString() : null,
        end: end ? new Date(end).toISOString() : null,
      },
    },
    value,
  };
}

/**
 * Create a custom rule
 */
export function customRule<T>(
  evaluator: (context: UserContext) => boolean,
  value: T
): FeatureFlagRule<T> {
  return {
    condition: {
      type: 'custom',
      config: { evaluator },
    },
    value,
  };
}

// =============================================================================
// Hooks-style API
// =============================================================================

let defaultManager: FeatureFlagManager | null = null;

/**
 * Get or create the default manager
 */
export function getDefaultManager(): FeatureFlagManager {
  if (!defaultManager) {
    defaultManager = createFeatureFlagManager();
  }
  return defaultManager;
}

/**
 * Set the default manager
 */
export function setDefaultManager(manager: FeatureFlagManager): void {
  defaultManager = manager;
}

/**
 * Use a feature flag (hooks-style)
 */
export function useFeatureFlag<T extends FeatureFlagValue>(key: string): T {
  return getDefaultManager().getValue<T>(key);
}

/**
 * Use a boolean feature flag
 */
export function useFeature(key: string): boolean {
  return getDefaultManager().isEnabled(key);
}

// =============================================================================
// Variant Testing
// =============================================================================

export interface Variant<T> {
  id: string;
  value: T;
  weight: number;
}

export interface Experiment<T> {
  key: string;
  variants: Variant<T>[];
  defaultVariant: string;
}

/**
 * Create an A/B test experiment
 */
export function createExperiment<T>(
  key: string,
  variants: Variant<T>[],
  defaultVariant: string
): Experiment<T> {
  return { key, variants, defaultVariant };
}

/**
 * Get variant for user
 */
export function getVariant<T>(
  experiment: Experiment<T>,
  userId: string
): Variant<T> {
  // Calculate total weight
  const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);

  // Hash user ID to get consistent bucket
  let hash = 0;
  const key = `${experiment.key}:${userId}`;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash = hash & hash;
  }
  const bucket = Math.abs(hash) % totalWeight;

  // Find variant
  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant;
    }
  }

  // Fallback to default
  return (
    experiment.variants.find((v) => v.id === experiment.defaultVariant) ||
    experiment.variants[0]
  );
}

// =============================================================================
// Feature Flag Decorators (for classes)
// =============================================================================

/**
 * Decorator to conditionally enable a method based on feature flag
 */
export function featureGate(flagKey: string) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      if (getDefaultManager().isEnabled(flagKey)) {
        return originalMethod.apply(this, args);
      }
      return undefined;
    };

    return descriptor;
  };
}

/**
 * Decorator to use alternative method when flag is disabled
 */
export function featureSwitch(flagKey: string, fallbackMethod: string) {
  return function (
    target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      if (getDefaultManager().isEnabled(flagKey)) {
        return originalMethod.apply(this, args);
      }
      const fallback = (target as Record<string, unknown>)[fallbackMethod];
      if (typeof fallback === 'function') {
        return fallback.apply(this, args);
      }
      return undefined;
    };

    return descriptor;
  };
}
