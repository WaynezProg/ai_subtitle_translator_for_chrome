/**
 * Event Emitter Utilities
 *
 * Provides type-safe event emitter, pub/sub patterns, event bus,
 * and event handling utilities for the extension.
 */

// =============================================================================
// Types
// =============================================================================

export type EventHandler<T = unknown> = (data: T) => void;
export type AsyncEventHandler<T = unknown> = (data: T) => Promise<void>;
export type UnsubscribeFn = () => void;

export interface Subscription {
  unsubscribe: UnsubscribeFn;
  isActive: boolean;
}

export interface EventEmitterOptions {
  maxListeners?: number;
  captureRejections?: boolean;
  onError?: (error: Error, event: string) => void;
}

// =============================================================================
// Type-Safe Event Emitter
// =============================================================================

/**
 * Type-safe event emitter with generic event map
 */
export class TypedEventEmitter<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<EventHandler<unknown>>>();
  private onceListeners = new Map<keyof TEvents, Set<EventHandler<unknown>>>();
  private maxListeners: number;
  private captureRejections: boolean;
  private onError?: (error: Error, event: string) => void;

  constructor(options: EventEmitterOptions = {}) {
    this.maxListeners = options.maxListeners ?? 100;
    this.captureRejections = options.captureRejections ?? false;
    this.onError = options.onError;
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription {
    const handlers = this.listeners.get(event) ?? new Set();

    if (handlers.size >= this.maxListeners) {
      console.warn(
        `[EventEmitter] Max listeners (${this.maxListeners}) reached for event "${String(event)}"`
      );
    }

    handlers.add(handler as EventHandler<unknown>);
    this.listeners.set(event, handlers);

    let isActive = true;
    const unsubscribe = () => {
      if (!isActive) return;
      isActive = false;
      handlers.delete(handler as EventHandler<unknown>);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };

    return {
      unsubscribe,
      get isActive() {
        return isActive;
      },
    };
  }

  /**
   * Subscribe to an event for one emission only
   */
  once<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription {
    const handlers = this.onceListeners.get(event) ?? new Set();
    handlers.add(handler as EventHandler<unknown>);
    this.onceListeners.set(event, handlers);

    let isActive = true;
    const unsubscribe = () => {
      if (!isActive) return;
      isActive = false;
      handlers.delete(handler as EventHandler<unknown>);
      if (handlers.size === 0) {
        this.onceListeners.delete(event);
      }
    };

    return {
      unsubscribe,
      get isActive() {
        return isActive;
      },
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<unknown>);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }

    const onceHandlers = this.onceListeners.get(event);
    if (onceHandlers) {
      onceHandlers.delete(handler as EventHandler<unknown>);
      if (onceHandlers.size === 0) {
        this.onceListeners.delete(event);
      }
    }
  }

  /**
   * Emit an event
   */
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const handlers = this.listeners.get(event);
    const onceHandlers = this.onceListeners.get(event);

    if (handlers) {
      handlers.forEach((handler) => {
        try {
          const result = handler(data);
          if (this.captureRejections && result instanceof Promise) {
            result.catch((error) => this.handleError(error, String(event)));
          }
        } catch (error) {
          this.handleError(error as Error, String(event));
        }
      });
    }

    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        try {
          const result = handler(data);
          if (this.captureRejections && result instanceof Promise) {
            result.catch((error) => this.handleError(error, String(event)));
          }
        } catch (error) {
          this.handleError(error as Error, String(event));
        }
      });
      this.onceListeners.delete(event);
    }
  }

  /**
   * Emit an event and wait for async handlers
   */
  async emitAsync<K extends keyof TEvents>(event: K, data: TEvents[K]): Promise<void> {
    const handlers = this.listeners.get(event);
    const onceHandlers = this.onceListeners.get(event);

    const promises: Promise<void>[] = [];

    if (handlers) {
      handlers.forEach((handler) => {
        promises.push(
          Promise.resolve()
            .then(() => handler(data))
            .catch((error) => this.handleError(error, String(event)))
        );
      });
    }

    if (onceHandlers) {
      onceHandlers.forEach((handler) => {
        promises.push(
          Promise.resolve()
            .then(() => handler(data))
            .catch((error) => this.handleError(error, String(event)))
        );
      });
      this.onceListeners.delete(event);
    }

    await Promise.all(promises);
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners<K extends keyof TEvents>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends keyof TEvents>(event: K): number {
    const regular = this.listeners.get(event)?.size ?? 0;
    const once = this.onceListeners.get(event)?.size ?? 0;
    return regular + once;
  }

  /**
   * Get all event names with listeners
   */
  eventNames(): (keyof TEvents)[] {
    const names = new Set<keyof TEvents>();
    this.listeners.forEach((_, key) => names.add(key));
    this.onceListeners.forEach((_, key) => names.add(key));
    return Array.from(names);
  }

  /**
   * Wait for an event to be emitted
   */
  waitFor<K extends keyof TEvents>(
    event: K,
    options: { timeout?: number; filter?: (data: TEvents[K]) => boolean } = {}
  ): Promise<TEvents[K]> {
    return new Promise((resolve, reject) => {
      const { timeout, filter } = options;

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let subscription: Subscription;

      const handler = (data: TEvents[K]) => {
        if (filter && !filter(data)) return;

        subscription.unsubscribe();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve(data);
      };

      // Use 'on' instead of 'once' so we can control when to unsubscribe
      subscription = this.on(event, handler);

      if (timeout) {
        timeoutId = setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error(`Timeout waiting for event "${String(event)}"`));
        }, timeout);
      }
    });
  }

  private handleError(error: Error, event: string): void {
    if (this.onError) {
      this.onError(error, event);
    } else {
      console.error(`[EventEmitter] Error in handler for "${event}":`, error);
    }
  }
}

// =============================================================================
// Simple Event Emitter (non-typed)
// =============================================================================

/**
 * Simple event emitter without type constraints
 */
export class EventEmitter extends TypedEventEmitter<Record<string, unknown>> {}

// =============================================================================
// Event Bus (Singleton Pattern)
// =============================================================================

export interface EventBusEvents {
  [key: string]: unknown;
}

/**
 * Create an event bus singleton
 */
export function createEventBus<TEvents extends EventBusEvents>(
  options?: EventEmitterOptions
): TypedEventEmitter<TEvents> {
  return new TypedEventEmitter<TEvents>(options);
}

// =============================================================================
// Pub/Sub Pattern
// =============================================================================

export interface PubSubOptions {
  maxSubscribers?: number;
  retainLast?: boolean;
  onError?: (error: Error, topic: string) => void;
}

/**
 * Pub/Sub implementation with topic-based messaging
 */
export class PubSub<TTopics extends Record<string, unknown>> {
  private emitter: TypedEventEmitter<TTopics>;
  private lastValues = new Map<keyof TTopics, TTopics[keyof TTopics]>();
  private retainLast: boolean;

  constructor(options: PubSubOptions = {}) {
    this.emitter = new TypedEventEmitter({
      maxListeners: options.maxSubscribers,
      onError: options.onError,
    });
    this.retainLast = options.retainLast ?? false;
  }

  /**
   * Publish a message to a topic
   */
  publish<K extends keyof TTopics>(topic: K, message: TTopics[K]): void {
    if (this.retainLast) {
      this.lastValues.set(topic, message);
    }
    this.emitter.emit(topic, message);
  }

  /**
   * Subscribe to a topic
   */
  subscribe<K extends keyof TTopics>(
    topic: K,
    handler: EventHandler<TTopics[K]>,
    options: { receiveLastValue?: boolean } = {}
  ): Subscription {
    const subscription = this.emitter.on(topic, handler);

    if (options.receiveLastValue && this.lastValues.has(topic)) {
      handler(this.lastValues.get(topic) as TTopics[K]);
    }

    return subscription;
  }

  /**
   * Subscribe to a topic for one message only
   */
  subscribeOnce<K extends keyof TTopics>(
    topic: K,
    handler: EventHandler<TTopics[K]>
  ): Subscription {
    return this.emitter.once(topic, handler);
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe<K extends keyof TTopics>(
    topic: K,
    handler: EventHandler<TTopics[K]>
  ): void {
    this.emitter.off(topic, handler);
  }

  /**
   * Get the last published value for a topic
   */
  getLastValue<K extends keyof TTopics>(topic: K): TTopics[K] | undefined {
    return this.lastValues.get(topic) as TTopics[K] | undefined;
  }

  /**
   * Clear all subscriptions
   */
  clear(): void {
    this.emitter.removeAllListeners();
    this.lastValues.clear();
  }

  /**
   * Get subscriber count for a topic
   */
  subscriberCount<K extends keyof TTopics>(topic: K): number {
    return this.emitter.listenerCount(topic);
  }
}

// =============================================================================
// Event Delegation
// =============================================================================

export interface DelegatedEventOptions {
  capture?: boolean;
  passive?: boolean;
  once?: boolean;
}

/**
 * Create an event delegator for DOM events
 */
export function createEventDelegator(
  root: Element | Document,
  eventType: string,
  options: DelegatedEventOptions = {}
): {
  on: (selector: string, handler: (event: Event, target: Element) => void) => UnsubscribeFn;
  off: (selector: string) => void;
  destroy: () => void;
} {
  const handlers = new Map<string, (event: Event, target: Element) => void>();

  const rootHandler = (event: Event) => {
    const target = event.target as Element;
    if (!target) return;

    handlers.forEach((handler, selector) => {
      const matched = target.closest(selector);
      if (matched) {
        handler(event, matched);
      }
    });
  };

  root.addEventListener(eventType, rootHandler, {
    capture: options.capture,
    passive: options.passive,
  });

  return {
    on(selector: string, handler: (event: Event, target: Element) => void): UnsubscribeFn {
      handlers.set(selector, handler);
      return () => handlers.delete(selector);
    },

    off(selector: string): void {
      handlers.delete(selector);
    },

    destroy(): void {
      handlers.clear();
      root.removeEventListener(eventType, rootHandler, {
        capture: options.capture,
      });
    },
  };
}

// =============================================================================
// Event Middleware
// =============================================================================

export type EventMiddleware<T> = (
  data: T,
  next: (data: T) => void
) => void;

/**
 * Create an event pipeline with middleware
 */
export function createEventPipeline<T>(
  ...middlewares: EventMiddleware<T>[]
): (data: T, finalHandler: EventHandler<T>) => void {
  return (data: T, finalHandler: EventHandler<T>) => {
    let index = 0;

    const next = (currentData: T): void => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        middleware(currentData, next);
      } else {
        finalHandler(currentData);
      }
    };

    next(data);
  };
}

// =============================================================================
// Event Batching
// =============================================================================

export interface BatchOptions {
  maxSize?: number;
  maxWait?: number;
}

/**
 * Create a batched event handler
 */
export function createBatchedHandler<T>(
  handler: EventHandler<T[]>,
  options: BatchOptions = {}
): EventHandler<T> & { flush: () => void } {
  const { maxSize = 100, maxWait = 100 } = options;
  let batch: T[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (batch.length > 0) {
      const items = batch;
      batch = [];
      handler(items);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const batchedHandler = (data: T) => {
    batch.push(data);

    if (batch.length >= maxSize) {
      flush();
    } else if (!timeoutId) {
      timeoutId = setTimeout(flush, maxWait);
    }
  };

  batchedHandler.flush = flush;

  return batchedHandler;
}

// =============================================================================
// Event Throttling and Debouncing
// =============================================================================

/**
 * Create a throttled event handler
 */
export function createThrottledHandler<T>(
  handler: EventHandler<T>,
  limitMs: number
): EventHandler<T> & { cancel: () => void } {
  let lastCall = 0;
  let pendingTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastData: T | undefined;

  const throttledHandler = (data: T) => {
    const now = Date.now();
    const remaining = limitMs - (now - lastCall);

    if (remaining <= 0) {
      if (pendingTimeoutId) {
        clearTimeout(pendingTimeoutId);
        pendingTimeoutId = null;
      }
      lastCall = now;
      handler(data);
    } else {
      lastData = data;
      if (!pendingTimeoutId) {
        pendingTimeoutId = setTimeout(() => {
          lastCall = Date.now();
          pendingTimeoutId = null;
          if (lastData !== undefined) {
            handler(lastData);
          }
        }, remaining);
      }
    }
  };

  throttledHandler.cancel = () => {
    if (pendingTimeoutId) {
      clearTimeout(pendingTimeoutId);
      pendingTimeoutId = null;
    }
  };

  return throttledHandler;
}

/**
 * Create a debounced event handler
 */
export function createDebouncedHandler<T>(
  handler: EventHandler<T>,
  delayMs: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): EventHandler<T> & { cancel: () => void; flush: () => void } {
  const { leading = false, trailing = true } = options;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastData: T | undefined;
  let hasLeadingCall = false;

  const debouncedHandler = (data: T) => {
    lastData = data;

    if (leading && !hasLeadingCall && !timeoutId) {
      hasLeadingCall = true;
      handler(data);
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      hasLeadingCall = false;
      if (trailing && lastData !== undefined) {
        handler(lastData);
      }
    }, delayMs);
  };

  debouncedHandler.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    hasLeadingCall = false;
  };

  debouncedHandler.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    hasLeadingCall = false;
    if (lastData !== undefined) {
      handler(lastData);
    }
  };

  return debouncedHandler;
}

// =============================================================================
// Event Replay
// =============================================================================

/**
 * Create a replay buffer for events
 */
export function createReplayBuffer<T>(
  maxSize: number = 100
): {
  push: (item: T) => void;
  replay: (handler: EventHandler<T>) => void;
  clear: () => void;
  size: number;
} {
  const buffer: T[] = [];

  return {
    push(item: T): void {
      buffer.push(item);
      if (buffer.length > maxSize) {
        buffer.shift();
      }
    },

    replay(handler: EventHandler<T>): void {
      buffer.forEach((item) => handler(item));
    },

    clear(): void {
      buffer.length = 0;
    },

    get size(): number {
      return buffer.length;
    },
  };
}

// =============================================================================
// Event Filtering
// =============================================================================

/**
 * Create a filtered event handler
 */
export function createFilteredHandler<T>(
  handler: EventHandler<T>,
  filter: (data: T) => boolean
): EventHandler<T> {
  return (data: T) => {
    if (filter(data)) {
      handler(data);
    }
  };
}

/**
 * Create a mapped event handler
 */
export function createMappedHandler<T, U>(
  handler: EventHandler<U>,
  mapper: (data: T) => U
): EventHandler<T> {
  return (data: T) => {
    handler(mapper(data));
  };
}

/**
 * Create a handler that only fires for distinct values
 */
export function createDistinctHandler<T>(
  handler: EventHandler<T>,
  equals: (a: T, b: T) => boolean = (a, b) => a === b
): EventHandler<T> {
  let lastValue: T | undefined;
  let hasValue = false;

  return (data: T) => {
    if (!hasValue || !equals(lastValue as T, data)) {
      lastValue = data;
      hasValue = true;
      handler(data);
    }
  };
}

// =============================================================================
// Event Composition
// =============================================================================

/**
 * Combine multiple handlers into one
 */
export function combineHandlers<T>(
  ...handlers: EventHandler<T>[]
): EventHandler<T> {
  return (data: T) => {
    handlers.forEach((handler) => handler(data));
  };
}

/**
 * Create a handler that calls handlers sequentially
 */
export function sequenceHandlers<T>(
  ...handlers: AsyncEventHandler<T>[]
): AsyncEventHandler<T> {
  return async (data: T) => {
    for (const handler of handlers) {
      await handler(data);
    }
  };
}

/**
 * Create a handler that calls handlers in parallel
 */
export function parallelHandlers<T>(
  ...handlers: AsyncEventHandler<T>[]
): AsyncEventHandler<T> {
  return async (data: T) => {
    await Promise.all(handlers.map((handler) => handler(data)));
  };
}
