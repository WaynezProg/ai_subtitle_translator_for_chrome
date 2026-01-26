/**
 * Type-Safe Event Emitter
 *
 * Provides a flexible event system for extension-wide communication
 * with strong typing, wildcard support, and memory management.
 */

import { createLogger } from './logger';

const logger = createLogger('EventEmitter');

// ============================================================================
// Types
// ============================================================================

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;

/**
 * Wildcard event handler that receives event name
 */
export type WildcardHandler<T = unknown> = (eventName: string, data: T) => void | Promise<void>;

/**
 * Listener registration info
 */
interface ListenerInfo<T = unknown> {
  handler: EventHandler<T>;
  once: boolean;
  priority: number;
}

/**
 * Event emitter options
 */
export interface EventEmitterOptions {
  /** Maximum listeners per event (0 = unlimited) */
  maxListeners?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Enable async error handling */
  captureErrors?: boolean;
}

/**
 * Event statistics
 */
export interface EventStats {
  /** Total events emitted */
  totalEmitted: number;
  /** Events emitted by type */
  emittedByType: Map<string, number>;
  /** Total listeners registered */
  totalListeners: number;
  /** Listeners by event type */
  listenersByType: Map<string, number>;
  /** Errors caught */
  errorCount: number;
}

// ============================================================================
// Extension Event Types
// ============================================================================

/**
 * Extension event map - defines all events and their payloads
 */
export interface ExtensionEventMap {
  // Translation events
  'translation:started': { videoId: string; cueCount: number };
  'translation:progress': { videoId: string; progress: number; translated: number; total: number };
  'translation:completed': { videoId: string; cueCount: number; durationMs: number; cached: boolean };
  'translation:failed': { videoId: string; error: string; errorCode?: string };
  'translation:cancelled': { videoId: string; reason?: string };

  // Subtitle events
  'subtitle:detected': { videoId: string; platform: string; language: string };
  'subtitle:loaded': { videoId: string; cueCount: number; format: string };
  'subtitle:displayed': { videoId: string; cueIndex: number };
  'subtitle:hidden': { videoId: string };

  // Provider events
  'provider:changed': { providerId: string; previousId?: string };
  'provider:error': { providerId: string; error: string; errorCode?: string };
  'provider:rateLimit': { providerId: string; retryAfterMs: number };
  'provider:recovered': { providerId: string };

  // Settings events
  'settings:changed': { key: string; value: unknown; previousValue?: unknown };
  'settings:reset': { keys: string[] };

  // Connection events
  'connection:online': { timestamp: number };
  'connection:offline': { timestamp: number };
  'connection:qualityChanged': { quality: string; latencyMs: number };

  // Cache events
  'cache:hit': { key: string; size: number };
  'cache:miss': { key: string };
  'cache:evicted': { key: string; reason: string };
  'cache:cleared': { entriesRemoved: number };

  // Error events
  'error:unhandled': { error: Error; context?: string };
  'error:network': { url: string; status: number; message: string };

  // Lifecycle events
  'extension:initialized': { version: string };
  'extension:updated': { previousVersion: string; newVersion: string };
}

// ============================================================================
// Typed Event Emitter
// ============================================================================

/**
 * Type-safe event emitter with support for typed events
 */
export class TypedEventEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap | '*', ListenerInfo<unknown>[]>();
  private maxListeners: number;
  private debug: boolean;
  private captureErrors: boolean;
  private stats: EventStats = {
    totalEmitted: 0,
    emittedByType: new Map(),
    totalListeners: 0,
    listenersByType: new Map(),
    errorCount: 0,
  };

  constructor(options: EventEmitterOptions = {}) {
    this.maxListeners = options.maxListeners ?? 100;
    this.debug = options.debug ?? false;
    this.captureErrors = options.captureErrors ?? true;
  }

  /**
   * Register an event listener
   */
  on<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
    options: { priority?: number } = {}
  ): () => void {
    return this.addListener(event, handler, false, options.priority ?? 0);
  }

  /**
   * Register a one-time event listener
   */
  once<K extends keyof EventMap>(
    event: K,
    handler: EventHandler<EventMap[K]>,
    options: { priority?: number } = {}
  ): () => void {
    return this.addListener(event, handler, true, options.priority ?? 0);
  }

  /**
   * Register a wildcard listener for all events
   */
  onAny(handler: WildcardHandler<unknown>): () => void {
    return this.addListener('*', handler as EventHandler<unknown>, false, 0);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): boolean {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return false;

    const index = eventListeners.findIndex((l) => l.handler === handler);
    if (index === -1) return false;

    eventListeners.splice(index, 1);
    this.stats.totalListeners--;
    this.stats.listenersByType.set(
      String(event),
      (this.stats.listenersByType.get(String(event)) ?? 1) - 1
    );

    if (eventListeners.length === 0) {
      this.listeners.delete(event);
    }

    return true;
  }

  /**
   * Emit an event
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    this.stats.totalEmitted++;
    this.stats.emittedByType.set(
      String(event),
      (this.stats.emittedByType.get(String(event)) ?? 0) + 1
    );

    if (this.debug) {
      logger.debug('Event emitted', { event: String(event), data });
    }

    const eventListeners = this.listeners.get(event);
    const wildcardListeners = this.listeners.get('*');

    let hasListeners = false;

    // Call specific event listeners
    if (eventListeners && eventListeners.length > 0) {
      hasListeners = true;
      this.invokeListeners(event, eventListeners, data);
    }

    // Call wildcard listeners
    if (wildcardListeners && wildcardListeners.length > 0) {
      hasListeners = true;
      for (const listener of wildcardListeners) {
        this.safeInvoke(() => (listener.handler as WildcardHandler)(String(event), data));
      }
    }

    return hasListeners;
  }

  /**
   * Emit an event and wait for all async handlers
   */
  async emitAsync<K extends keyof EventMap>(event: K, data: EventMap[K]): Promise<void> {
    this.stats.totalEmitted++;
    this.stats.emittedByType.set(
      String(event),
      (this.stats.emittedByType.get(String(event)) ?? 0) + 1
    );

    if (this.debug) {
      logger.debug('Async event emitted', { event: String(event), data });
    }

    const eventListeners = this.listeners.get(event);
    const wildcardListeners = this.listeners.get('*');
    const promises: Promise<void>[] = [];

    // Call specific event listeners
    if (eventListeners && eventListeners.length > 0) {
      const toRemove: ListenerInfo<unknown>[] = [];
      const sorted = [...eventListeners].sort((a, b) => b.priority - a.priority);

      for (const listener of sorted) {
        if (listener.once) {
          toRemove.push(listener);
        }
        promises.push(this.safeInvokeAsync(() => listener.handler(data)));
      }

      // Remove one-time listeners
      for (const listener of toRemove) {
        const idx = eventListeners.indexOf(listener);
        if (idx !== -1) {
          eventListeners.splice(idx, 1);
          this.stats.totalListeners--;
        }
      }
    }

    // Call wildcard listeners
    if (wildcardListeners && wildcardListeners.length > 0) {
      for (const listener of wildcardListeners) {
        promises.push(
          this.safeInvokeAsync(() => (listener.handler as WildcardHandler)(String(event), data))
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof EventMap>(event: K): number {
    return this.listeners.get(event)?.length ?? 0;
  }

  /**
   * Get all registered event names
   */
  eventNames(): (keyof EventMap)[] {
    return Array.from(this.listeners.keys()).filter((k) => k !== '*') as (keyof EventMap)[];
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    if (event !== undefined) {
      const count = this.listeners.get(event)?.length ?? 0;
      this.listeners.delete(event);
      this.stats.totalListeners -= count;
      this.stats.listenersByType.delete(String(event));
    } else {
      this.listeners.clear();
      this.stats.totalListeners = 0;
      this.stats.listenersByType.clear();
    }
  }

  /**
   * Wait for an event to be emitted
   */
  waitFor<K extends keyof EventMap>(
    event: K,
    options: { timeout?: number; filter?: (data: EventMap[K]) => boolean } = {}
  ): Promise<EventMap[K]> {
    const { timeout = 0, filter } = options;

    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const handler: EventHandler<EventMap[K]> = (data) => {
        if (filter && !filter(data)) {
          return;
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.off(event, handler);
        resolve(data);
      };

      this.on(event, handler);

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.off(event, handler);
          reject(new Error(`Timeout waiting for event: ${String(event)}`));
        }, timeout);
      }
    });
  }

  /**
   * Get event statistics
   */
  getStats(): EventStats {
    return {
      ...this.stats,
      emittedByType: new Map(this.stats.emittedByType),
      listenersByType: new Map(this.stats.listenersByType),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalEmitted: 0,
      emittedByType: new Map(),
      totalListeners: this.stats.totalListeners,
      listenersByType: new Map(this.stats.listenersByType),
      errorCount: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private addListener<T>(
    event: keyof EventMap | '*',
    handler: EventHandler<T>,
    once: boolean,
    priority: number
  ): () => void {
    let eventListeners = this.listeners.get(event);

    if (!eventListeners) {
      eventListeners = [];
      this.listeners.set(event, eventListeners);
    }

    // Check max listeners
    if (this.maxListeners > 0 && eventListeners.length >= this.maxListeners) {
      logger.warn('Max listeners exceeded', {
        event: String(event),
        max: this.maxListeners,
      });
    }

    const listenerInfo: ListenerInfo<T> = {
      handler: handler as EventHandler<unknown>,
      once,
      priority,
    };

    eventListeners.push(listenerInfo as ListenerInfo<unknown>);
    this.stats.totalListeners++;
    this.stats.listenersByType.set(
      String(event),
      (this.stats.listenersByType.get(String(event)) ?? 0) + 1
    );

    // Return unsubscribe function
    return () => {
      this.off(event as keyof EventMap, handler as EventHandler<EventMap[keyof EventMap]>);
    };
  }

  private invokeListeners<K extends keyof EventMap>(
    event: K,
    listeners: ListenerInfo<unknown>[],
    data: EventMap[K]
  ): void {
    const toRemove: ListenerInfo<unknown>[] = [];
    const sorted = [...listeners].sort((a, b) => b.priority - a.priority);

    for (const listener of sorted) {
      if (listener.once) {
        toRemove.push(listener);
      }
      this.safeInvoke(() => listener.handler(data));
    }

    // Remove one-time listeners
    for (const listener of toRemove) {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) {
        listeners.splice(idx, 1);
        this.stats.totalListeners--;
      }
    }
  }

  private safeInvoke(fn: () => void | Promise<void>): void {
    try {
      const result = fn();
      if (result instanceof Promise && this.captureErrors) {
        result.catch((error) => {
          this.stats.errorCount++;
          logger.error('Async event handler error', error);
        });
      }
    } catch (error) {
      this.stats.errorCount++;
      if (this.captureErrors) {
        logger.error('Event handler error', error);
      } else {
        throw error;
      }
    }
  }

  private async safeInvokeAsync(fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      this.stats.errorCount++;
      if (this.captureErrors) {
        logger.error('Async event handler error', error);
      } else {
        throw error;
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let extensionEventEmitter: TypedEventEmitter<ExtensionEventMap> | null = null;

/**
 * Get the extension-wide event emitter
 */
export function getEventEmitter(): TypedEventEmitter<ExtensionEventMap> {
  if (!extensionEventEmitter) {
    extensionEventEmitter = new TypedEventEmitter<ExtensionEventMap>({
      maxListeners: 100,
      debug: false,
      captureErrors: true,
    });
  }
  return extensionEventEmitter;
}

/**
 * Reset the event emitter (for testing)
 */
export function resetEventEmitter(): void {
  if (extensionEventEmitter) {
    extensionEventEmitter.removeAllListeners();
  }
  extensionEventEmitter = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Subscribe to an extension event
 */
export function on<K extends keyof ExtensionEventMap>(
  event: K,
  handler: EventHandler<ExtensionEventMap[K]>
): () => void {
  return getEventEmitter().on(event, handler);
}

/**
 * Subscribe to an extension event once
 */
export function once<K extends keyof ExtensionEventMap>(
  event: K,
  handler: EventHandler<ExtensionEventMap[K]>
): () => void {
  return getEventEmitter().once(event, handler);
}

/**
 * Emit an extension event
 */
export function emit<K extends keyof ExtensionEventMap>(
  event: K,
  data: ExtensionEventMap[K]
): boolean {
  return getEventEmitter().emit(event, data);
}

/**
 * Wait for an extension event
 */
export function waitFor<K extends keyof ExtensionEventMap>(
  event: K,
  options?: { timeout?: number; filter?: (data: ExtensionEventMap[K]) => boolean }
): Promise<ExtensionEventMap[K]> {
  return getEventEmitter().waitFor(event, options);
}
