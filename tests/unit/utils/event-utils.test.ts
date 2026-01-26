/**
 * Tests for Event Emitter Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TypedEventEmitter,
  EventEmitter,
  createEventBus,
  PubSub,
  createEventDelegator,
  createEventPipeline,
  createBatchedHandler,
  createThrottledHandler,
  createDebouncedHandler,
  createReplayBuffer,
  createFilteredHandler,
  createMappedHandler,
  createDistinctHandler,
  combineHandlers,
  sequenceHandlers,
  parallelHandlers,
} from '@shared/utils/event-utils';

describe('Event Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TypedEventEmitter', () => {
    interface TestEvents {
      message: string;
      count: number;
      data: { id: string; value: number };
    }

    let emitter: TypedEventEmitter<TestEvents>;

    beforeEach(() => {
      emitter = new TypedEventEmitter<TestEvents>();
    });

    describe('on', () => {
      it('should subscribe to events', () => {
        const handler = vi.fn();
        emitter.on('message', handler);

        emitter.emit('message', 'hello');

        expect(handler).toHaveBeenCalledWith('hello');
      });

      it('should call handler multiple times', () => {
        const handler = vi.fn();
        emitter.on('message', handler);

        emitter.emit('message', 'first');
        emitter.emit('message', 'second');

        expect(handler).toHaveBeenCalledTimes(2);
      });

      it('should return a subscription object', () => {
        const handler = vi.fn();
        const subscription = emitter.on('message', handler);

        expect(subscription.isActive).toBe(true);
        expect(typeof subscription.unsubscribe).toBe('function');
      });

      it('should allow unsubscribing via subscription', () => {
        const handler = vi.fn();
        const subscription = emitter.on('message', handler);

        emitter.emit('message', 'first');
        subscription.unsubscribe();
        emitter.emit('message', 'second');

        expect(handler).toHaveBeenCalledTimes(1);
        expect(subscription.isActive).toBe(false);
      });

      it('should handle multiple handlers for same event', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        emitter.on('message', handler1);
        emitter.on('message', handler2);
        emitter.emit('message', 'test');

        expect(handler1).toHaveBeenCalledWith('test');
        expect(handler2).toHaveBeenCalledWith('test');
      });
    });

    describe('once', () => {
      it('should only fire handler once', () => {
        const handler = vi.fn();
        emitter.once('message', handler);

        emitter.emit('message', 'first');
        emitter.emit('message', 'second');

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('first');
      });

      it('should allow unsubscribing before event fires', () => {
        const handler = vi.fn();
        const subscription = emitter.once('message', handler);

        subscription.unsubscribe();
        emitter.emit('message', 'test');

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('off', () => {
      it('should remove a specific handler', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        emitter.on('message', handler1);
        emitter.on('message', handler2);
        emitter.off('message', handler1);
        emitter.emit('message', 'test');

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalledWith('test');
      });
    });

    describe('emit', () => {
      it('should emit events with typed data', () => {
        const handler = vi.fn();
        emitter.on('data', handler);

        emitter.emit('data', { id: '123', value: 42 });

        expect(handler).toHaveBeenCalledWith({ id: '123', value: 42 });
      });

      it('should catch synchronous errors in handlers', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const errorHandler = vi.fn().mockImplementation(() => {
          throw new Error('Handler error');
        });
        const normalHandler = vi.fn();

        emitter.on('message', errorHandler);
        emitter.on('message', normalHandler);
        emitter.emit('message', 'test');

        expect(normalHandler).toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalled();

        consoleError.mockRestore();
      });
    });

    describe('emitAsync', () => {
      it('should wait for async handlers', async () => {
        vi.useRealTimers();

        const order: number[] = [];
        const handler1 = async (msg: string) => {
          await new Promise((r) => setTimeout(r, 10));
          order.push(1);
        };
        const handler2 = async (msg: string) => {
          order.push(2);
        };

        emitter.on('message', handler1);
        emitter.on('message', handler2);
        await emitter.emitAsync('message', 'test');

        expect(order).toContain(1);
        expect(order).toContain(2);

        vi.useFakeTimers();
      });
    });

    describe('removeAllListeners', () => {
      it('should remove all listeners for a specific event', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();
        const otherHandler = vi.fn();

        emitter.on('message', handler1);
        emitter.on('message', handler2);
        emitter.on('count', otherHandler);

        emitter.removeAllListeners('message');
        emitter.emit('message', 'test');
        emitter.emit('count', 42);

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).not.toHaveBeenCalled();
        expect(otherHandler).toHaveBeenCalledWith(42);
      });

      it('should remove all listeners when no event specified', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        emitter.on('message', handler1);
        emitter.on('count', handler2);

        emitter.removeAllListeners();
        emitter.emit('message', 'test');
        emitter.emit('count', 42);

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).not.toHaveBeenCalled();
      });
    });

    describe('listenerCount', () => {
      it('should return the number of listeners', () => {
        expect(emitter.listenerCount('message')).toBe(0);

        emitter.on('message', vi.fn());
        expect(emitter.listenerCount('message')).toBe(1);

        emitter.on('message', vi.fn());
        emitter.once('message', vi.fn());
        expect(emitter.listenerCount('message')).toBe(3);
      });
    });

    describe('eventNames', () => {
      it('should return all event names with listeners', () => {
        emitter.on('message', vi.fn());
        emitter.on('count', vi.fn());

        const names = emitter.eventNames();

        expect(names).toContain('message');
        expect(names).toContain('count');
      });
    });

    describe('waitFor', () => {
      it('should resolve when event is emitted', async () => {
        const promise = emitter.waitFor('message');

        emitter.emit('message', 'result');

        await expect(promise).resolves.toBe('result');
      });

      it('should timeout if event is not emitted', async () => {
        const promise = emitter.waitFor('message', { timeout: 100 });

        vi.advanceTimersByTime(150);

        await expect(promise).rejects.toThrow('Timeout');
      });

      it('should filter events', async () => {
        const promise = emitter.waitFor('count', {
          filter: (n) => n > 10,
        });

        emitter.emit('count', 5);
        emitter.emit('count', 15);

        await expect(promise).resolves.toBe(15);
      });
    });

    describe('options', () => {
      it('should warn when max listeners exceeded', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const smallEmitter = new TypedEventEmitter<TestEvents>({ maxListeners: 2 });

        smallEmitter.on('message', vi.fn());
        smallEmitter.on('message', vi.fn());
        smallEmitter.on('message', vi.fn());

        expect(consoleWarn).toHaveBeenCalled();
        consoleWarn.mockRestore();
      });

      it('should call custom error handler', () => {
        const onError = vi.fn();
        const errorEmitter = new TypedEventEmitter<TestEvents>({ onError });

        errorEmitter.on('message', () => {
          throw new Error('test');
        });
        errorEmitter.emit('message', 'test');

        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe('EventEmitter (non-typed)', () => {
    it('should work with any event names and data', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      emitter.on('custom-event', handler);
      emitter.emit('custom-event', { any: 'data' });

      expect(handler).toHaveBeenCalledWith({ any: 'data' });
    });
  });

  describe('createEventBus', () => {
    it('should create a typed event bus', () => {
      interface BusEvents {
        userLoggedIn: { userId: string };
        userLoggedOut: void;
      }

      const bus = createEventBus<BusEvents>();
      const handler = vi.fn();

      bus.on('userLoggedIn', handler);
      bus.emit('userLoggedIn', { userId: '123' });

      expect(handler).toHaveBeenCalledWith({ userId: '123' });
    });
  });

  describe('PubSub', () => {
    interface Topics {
      news: string;
      update: { version: number };
    }

    let pubsub: PubSub<Topics>;

    beforeEach(() => {
      pubsub = new PubSub<Topics>();
    });

    describe('publish/subscribe', () => {
      it('should deliver messages to subscribers', () => {
        const handler = vi.fn();
        pubsub.subscribe('news', handler);

        pubsub.publish('news', 'Breaking news!');

        expect(handler).toHaveBeenCalledWith('Breaking news!');
      });

      it('should support multiple subscribers', () => {
        const handler1 = vi.fn();
        const handler2 = vi.fn();

        pubsub.subscribe('news', handler1);
        pubsub.subscribe('news', handler2);
        pubsub.publish('news', 'News for all');

        expect(handler1).toHaveBeenCalledWith('News for all');
        expect(handler2).toHaveBeenCalledWith('News for all');
      });
    });

    describe('subscribeOnce', () => {
      it('should only receive one message', () => {
        const handler = vi.fn();
        pubsub.subscribeOnce('news', handler);

        pubsub.publish('news', 'first');
        pubsub.publish('news', 'second');

        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    describe('unsubscribe', () => {
      it('should stop receiving messages', () => {
        const handler = vi.fn();
        pubsub.subscribe('news', handler);

        pubsub.publish('news', 'first');
        pubsub.unsubscribe('news', handler);
        pubsub.publish('news', 'second');

        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    describe('retainLast', () => {
      it('should retain last value when enabled', () => {
        const retainingPubsub = new PubSub<Topics>({ retainLast: true });

        retainingPubsub.publish('news', 'old news');

        expect(retainingPubsub.getLastValue('news')).toBe('old news');
      });

      it('should deliver last value to new subscriber', () => {
        const retainingPubsub = new PubSub<Topics>({ retainLast: true });
        const handler = vi.fn();

        retainingPubsub.publish('news', 'retained');
        retainingPubsub.subscribe('news', handler, { receiveLastValue: true });

        expect(handler).toHaveBeenCalledWith('retained');
      });
    });

    describe('subscriberCount', () => {
      it('should return subscriber count', () => {
        expect(pubsub.subscriberCount('news')).toBe(0);

        pubsub.subscribe('news', vi.fn());
        expect(pubsub.subscriberCount('news')).toBe(1);

        pubsub.subscribe('news', vi.fn());
        expect(pubsub.subscriberCount('news')).toBe(2);
      });
    });

    describe('clear', () => {
      it('should remove all subscriptions', () => {
        const handler = vi.fn();
        pubsub.subscribe('news', handler);

        pubsub.clear();
        pubsub.publish('news', 'test');

        expect(handler).not.toHaveBeenCalled();
      });
    });
  });

  describe('createEventDelegator', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      container.innerHTML = `
        <button class="btn primary">Primary</button>
        <button class="btn secondary">Secondary</button>
        <div class="content">
          <span class="text">Text</span>
        </div>
      `;
      document.body.appendChild(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('should delegate events to matching selectors', () => {
      const handler = vi.fn();
      const delegator = createEventDelegator(container, 'click');

      delegator.on('.btn', handler);

      const btn = container.querySelector('.primary') as HTMLElement;
      btn.click();

      expect(handler).toHaveBeenCalled();
      delegator.destroy();
    });

    it('should match closest ancestor', () => {
      const handler = vi.fn();
      const delegator = createEventDelegator(container, 'click');

      delegator.on('.content', handler);

      const span = container.querySelector('.text') as HTMLElement;
      span.click();

      expect(handler).toHaveBeenCalled();
      delegator.destroy();
    });

    it('should support multiple selectors', () => {
      const primaryHandler = vi.fn();
      const secondaryHandler = vi.fn();
      const delegator = createEventDelegator(container, 'click');

      delegator.on('.primary', primaryHandler);
      delegator.on('.secondary', secondaryHandler);

      (container.querySelector('.primary') as HTMLElement).click();
      (container.querySelector('.secondary') as HTMLElement).click();

      expect(primaryHandler).toHaveBeenCalledTimes(1);
      expect(secondaryHandler).toHaveBeenCalledTimes(1);
      delegator.destroy();
    });

    it('should allow removing specific handlers', () => {
      const handler = vi.fn();
      const delegator = createEventDelegator(container, 'click');

      delegator.on('.btn', handler);
      delegator.off('.btn');

      const btn = container.querySelector('.btn') as HTMLElement;
      btn.click();

      expect(handler).not.toHaveBeenCalled();
      delegator.destroy();
    });
  });

  describe('createEventPipeline', () => {
    it('should pass data through middleware', () => {
      const pipeline = createEventPipeline<number>(
        (data, next) => next(data + 1),
        (data, next) => next(data * 2)
      );

      const handler = vi.fn();
      pipeline(5, handler);

      expect(handler).toHaveBeenCalledWith(12); // (5 + 1) * 2
    });

    it('should allow middleware to stop propagation', () => {
      const pipeline = createEventPipeline<number>(
        (data, next) => {
          if (data < 10) return; // Stop
          next(data);
        }
      );

      const handler = vi.fn();
      pipeline(5, handler);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('createBatchedHandler', () => {
    it('should batch multiple calls', () => {
      const handler = vi.fn();
      const batched = createBatchedHandler<number>(handler, { maxWait: 100 });

      batched(1);
      batched(2);
      batched(3);

      expect(handler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should flush when maxSize reached', () => {
      const handler = vi.fn();
      const batched = createBatchedHandler<number>(handler, {
        maxSize: 3,
        maxWait: 1000,
      });

      batched(1);
      batched(2);
      batched(3);

      expect(handler).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('should support manual flush', () => {
      const handler = vi.fn();
      const batched = createBatchedHandler<number>(handler, { maxWait: 1000 });

      batched(1);
      batched(2);
      batched.flush();

      expect(handler).toHaveBeenCalledWith([1, 2]);
    });
  });

  describe('createThrottledHandler', () => {
    it('should throttle calls', () => {
      const handler = vi.fn();
      const throttled = createThrottledHandler(handler, 100);

      throttled('first');
      throttled('second');
      throttled('third');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should allow calls after throttle period', () => {
      const handler = vi.fn();
      const throttled = createThrottledHandler(handler, 100);

      throttled('first');
      vi.advanceTimersByTime(150);
      throttled('second');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should fire trailing call', () => {
      const handler = vi.fn();
      const throttled = createThrottledHandler(handler, 100);

      throttled('first');
      throttled('second');
      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith('second');
    });

    it('should support cancel', () => {
      const handler = vi.fn();
      const throttled = createThrottledHandler(handler, 100);

      throttled('first');
      throttled('second');
      throttled.cancel();
      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('createDebouncedHandler', () => {
    it('should debounce calls', () => {
      const handler = vi.fn();
      const debounced = createDebouncedHandler(handler, 100);

      debounced('first');
      debounced('second');
      debounced('third');

      expect(handler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('third');
    });

    it('should support leading edge', () => {
      const handler = vi.fn();
      const debounced = createDebouncedHandler(handler, 100, { leading: true });

      debounced('first');
      debounced('second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('should support trailing edge disabled', () => {
      const handler = vi.fn();
      const debounced = createDebouncedHandler(handler, 100, {
        leading: true,
        trailing: false,
      });

      debounced('first');
      debounced('second');
      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support cancel', () => {
      const handler = vi.fn();
      const debounced = createDebouncedHandler(handler, 100);

      debounced('test');
      debounced.cancel();
      vi.advanceTimersByTime(100);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support flush', () => {
      const handler = vi.fn();
      const debounced = createDebouncedHandler(handler, 100);

      debounced('test');
      debounced.flush();

      expect(handler).toHaveBeenCalledWith('test');
    });
  });

  describe('createReplayBuffer', () => {
    it('should store items', () => {
      const buffer = createReplayBuffer<number>(10);

      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.size).toBe(3);
    });

    it('should replay items to handler', () => {
      const buffer = createReplayBuffer<number>(10);
      const handler = vi.fn();

      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.replay(handler);

      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, 1);
      expect(handler).toHaveBeenNthCalledWith(2, 2);
      expect(handler).toHaveBeenNthCalledWith(3, 3);
    });

    it('should respect maxSize', () => {
      const buffer = createReplayBuffer<number>(3);

      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);

      expect(buffer.size).toBe(3);

      const items: number[] = [];
      buffer.replay((item) => items.push(item));
      expect(items).toEqual([2, 3, 4]);
    });

    it('should support clear', () => {
      const buffer = createReplayBuffer<number>(10);

      buffer.push(1);
      buffer.push(2);
      buffer.clear();

      expect(buffer.size).toBe(0);
    });
  });

  describe('createFilteredHandler', () => {
    it('should only call handler when filter passes', () => {
      const handler = vi.fn();
      const filtered = createFilteredHandler<number>(handler, (n) => n > 5);

      filtered(3);
      filtered(7);
      filtered(2);
      filtered(10);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(7);
      expect(handler).toHaveBeenCalledWith(10);
    });
  });

  describe('createMappedHandler', () => {
    it('should transform data before calling handler', () => {
      const handler = vi.fn();
      const mapped = createMappedHandler<number, string>(handler, (n) => `value: ${n}`);

      mapped(42);

      expect(handler).toHaveBeenCalledWith('value: 42');
    });
  });

  describe('createDistinctHandler', () => {
    it('should only fire for distinct values', () => {
      const handler = vi.fn();
      const distinct = createDistinctHandler<number>(handler);

      distinct(1);
      distinct(1);
      distinct(2);
      distinct(2);
      distinct(1);

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should use custom equality function', () => {
      const handler = vi.fn();
      const distinct = createDistinctHandler<{ id: number }>(
        handler,
        (a, b) => a.id === b.id
      );

      distinct({ id: 1 });
      distinct({ id: 1 });
      distinct({ id: 2 });

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('combineHandlers', () => {
    it('should call all handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const combined = combineHandlers(handler1, handler2, handler3);
      combined('test');

      expect(handler1).toHaveBeenCalledWith('test');
      expect(handler2).toHaveBeenCalledWith('test');
      expect(handler3).toHaveBeenCalledWith('test');
    });
  });

  describe('sequenceHandlers', () => {
    it('should call handlers in sequence', async () => {
      vi.useRealTimers();

      const order: number[] = [];

      const handler1 = async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      };
      const handler2 = async () => {
        order.push(2);
      };

      const sequenced = sequenceHandlers(handler1, handler2);
      await sequenced('test');

      expect(order).toEqual([1, 2]);

      vi.useFakeTimers();
    });
  });

  describe('parallelHandlers', () => {
    it('should call handlers in parallel', async () => {
      vi.useRealTimers();

      const order: number[] = [];

      const handler1 = async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
      };
      const handler2 = async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(2);
      };

      const parallel = parallelHandlers(handler1, handler2);
      await parallel('test');

      expect(order).toEqual([2, 1]); // handler2 finishes first

      vi.useFakeTimers();
    });
  });
});
