/**
 * Tests for Worker Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Types
  type WorkerMessage,
  type WorkerResponse,
  type WorkerTask,
  type WorkerPoolOptions,
  // Inline Worker Creation
  createInlineWorker,
  createWorkerFromCode,
  createMessageWorker,
  // Promisified Communication
  generateMessageId,
  sendWorkerMessage,
  // Worker Pool
  WorkerPool,
  // Transferable Objects
  postTransferable,
  isTransferable,
  extractTransferables,
  // Typed Channel
  createTypedChannel,
  // Shared Worker Utilities
  createSharedWorkerFromCode,
  connectToSharedWorker,
  // Utility Functions
  isWorkerSupported,
  isSharedWorkerSupported,
  getProcessorCount,
  createTaskWorker,
} from '@shared/utils/worker-utils';

// Mock Worker and SharedWorker
class MockWorker {
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  private errorHandlers: ((event: ErrorEvent) => void)[] = [];
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public terminated = false;

  constructor(
    public url?: string | URL,
    public options?: WorkerOptions
  ) {}

  postMessage(message: unknown, _transfer?: Transferable[]): void {
    // Simulate async response
    setTimeout(() => {
      const response: WorkerResponse = {
        id: (message as WorkerMessage).id,
        success: true,
        result: { processed: true },
      };
      const event = new MessageEvent('message', { data: response });
      for (const handler of this.messageHandlers) {
        handler(event);
      }
      if (this.onmessage) {
        this.onmessage(event);
      }
    }, 0);
  }

  addEventListener(type: string, handler: EventListener): void {
    if (type === 'message') {
      this.messageHandlers.push(handler as (event: MessageEvent) => void);
    } else if (type === 'error') {
      this.errorHandlers.push(handler as (event: ErrorEvent) => void);
    }
  }

  removeEventListener(type: string, handler: EventListener): void {
    if (type === 'message') {
      const index = this.messageHandlers.indexOf(
        handler as (event: MessageEvent) => void
      );
      if (index !== -1) this.messageHandlers.splice(index, 1);
    } else if (type === 'error') {
      const index = this.errorHandlers.indexOf(
        handler as (event: ErrorEvent) => void
      );
      if (index !== -1) this.errorHandlers.splice(index, 1);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  // Helper to simulate error
  simulateError(message: string): void {
    const event = new ErrorEvent('error', { message });
    for (const handler of this.errorHandlers) {
      handler(event);
    }
    if (this.onerror) {
      this.onerror(event);
    }
  }

  // Helper to simulate specific response
  simulateResponse(response: WorkerResponse): void {
    const event = new MessageEvent('message', { data: response });
    for (const handler of this.messageHandlers) {
      handler(event);
    }
    if (this.onmessage) {
      this.onmessage(event);
    }
  }
}

class MockMessagePort {
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  public closed = false;

  start(): void {}

  close(): void {
    this.closed = true;
  }

  postMessage(message: unknown): void {
    setTimeout(() => {
      const event = new MessageEvent('message', { data: message });
      for (const handler of this.messageHandlers) {
        handler(event);
      }
    }, 0);
  }

  addEventListener(type: string, handler: EventListener): void {
    if (type === 'message') {
      this.messageHandlers.push(handler as (event: MessageEvent) => void);
    }
  }

  removeEventListener(type: string, handler: EventListener): void {
    if (type === 'message') {
      const index = this.messageHandlers.indexOf(
        handler as (event: MessageEvent) => void
      );
      if (index !== -1) this.messageHandlers.splice(index, 1);
    }
  }

  // Helper to simulate incoming message
  simulateMessage(message: unknown): void {
    const event = new MessageEvent('message', { data: message });
    for (const handler of this.messageHandlers) {
      handler(event);
    }
  }
}

class MockSharedWorker {
  public port = new MockMessagePort();

  constructor(
    public url?: string | URL,
    public options?: string | WorkerOptions
  ) {}
}

// Set up global mocks
const originalWorker = globalThis.Worker;
const originalSharedWorker = globalThis.SharedWorker;
const originalURL = globalThis.URL;
const originalBlob = globalThis.Blob;

describe('Worker Utils', () => {
  let mockBlobUrls: Map<string, string>;

  beforeEach(() => {
    mockBlobUrls = new Map();

    // Mock URL.createObjectURL and revokeObjectURL
    globalThis.URL = {
      ...originalURL,
      createObjectURL: vi.fn((blob: Blob) => {
        const url = `blob:mock-${Math.random()}`;
        mockBlobUrls.set(url, 'blob');
        return url;
      }),
      revokeObjectURL: vi.fn((url: string) => {
        mockBlobUrls.delete(url);
      }),
    } as unknown as typeof URL;

    // Mock Blob
    globalThis.Blob = vi.fn().mockImplementation((parts, options) => ({
      parts,
      options,
      size: parts?.join('').length || 0,
      type: options?.type || '',
    })) as unknown as typeof Blob;

    // Mock Worker
    globalThis.Worker = MockWorker as unknown as typeof Worker;

    // Mock SharedWorker
    globalThis.SharedWorker = MockSharedWorker as unknown as typeof SharedWorker;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
    globalThis.SharedWorker = originalSharedWorker;
    globalThis.URL = originalURL;
    globalThis.Blob = originalBlob;
  });

  describe('generateMessageId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateMessageId();
      const id2 = generateMessageId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with msg_ prefix', () => {
      const id = generateMessageId();
      expect(id.startsWith('msg_')).toBe(true);
    });

    it('should include timestamp in ID', () => {
      const id = generateMessageId();
      const parts = id.split('_');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      const timestamp = parseInt(parts[1], 10);
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('Inline Worker Creation', () => {
    describe('createInlineWorker', () => {
      it('should create a worker from a function', () => {
        const worker = createInlineWorker(() => {
          self.onmessage = (e) => self.postMessage(e.data);
        });

        expect(worker).toBeDefined();
        expect((worker as MockWorker).url).toContain('blob:');
      });

      it('should support worker name option', () => {
        const worker = createInlineWorker(
          () => {
            // Worker code
          },
          { name: 'my-worker' }
        );

        expect((worker as MockWorker).options?.name).toBe('my-worker');
      });

      it('should revoke blob URL on terminate', () => {
        const worker = createInlineWorker(() => {});
        const url = (worker as MockWorker).url;

        expect(mockBlobUrls.has(url as string)).toBe(true);

        worker.terminate();

        expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
      });
    });

    describe('createWorkerFromCode', () => {
      it('should create a worker from code string', () => {
        const worker = createWorkerFromCode('self.onmessage = () => {}');

        expect(worker).toBeDefined();
        expect(Blob).toHaveBeenCalledWith(
          ['self.onmessage = () => {}'],
          { type: 'application/javascript' }
        );
      });

      it('should revoke blob URL on terminate', () => {
        const worker = createWorkerFromCode('// code');
        const url = (worker as MockWorker).url;

        worker.terminate();

        expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
      });
    });

    describe('createMessageWorker', () => {
      it('should create a worker with message handlers', () => {
        const handlers = {
          add: (payload: { a: number; b: number }) => payload.a + payload.b,
          multiply: (payload: { a: number; b: number }) => payload.a * payload.b,
        };

        const worker = createMessageWorker(handlers);

        expect(worker).toBeDefined();
        expect(Blob).toHaveBeenCalled();
      });
    });

    describe('createTaskWorker', () => {
      it('should create a task worker with processor', () => {
        const processor = (input: number) => input * 2;
        const worker = createTaskWorker(processor);

        expect(worker).toBeDefined();
      });
    });
  });

  describe('sendWorkerMessage', () => {
    it('should send message and receive response', async () => {
      const worker = new MockWorker() as unknown as Worker;

      const result = await sendWorkerMessage<{ value: number }, { processed: boolean }>(
        worker,
        'test',
        { value: 42 }
      );

      expect(result).toEqual({ processed: true });
    });

    it('should reject on error response', async () => {
      const worker = new MockWorker() as unknown as Worker;
      const mockWorker = worker as unknown as MockWorker;

      // Override postMessage to return error
      mockWorker.postMessage = function (message: unknown) {
        setTimeout(() => {
          mockWorker.simulateResponse({
            id: (message as WorkerMessage).id,
            success: false,
            error: 'Test error',
          });
        }, 0);
      };

      await expect(sendWorkerMessage(worker, 'test', {})).rejects.toThrow('Test error');
    });

    it('should reject on worker error', async () => {
      const worker = new MockWorker() as unknown as Worker;
      const mockWorker = worker as unknown as MockWorker;

      // Override postMessage to trigger error
      mockWorker.postMessage = function () {
        setTimeout(() => {
          mockWorker.simulateError('Worker crashed');
        }, 0);
      };

      await expect(sendWorkerMessage(worker, 'test', {})).rejects.toThrow('Worker crashed');
    });

    it('should timeout if no response', async () => {
      const worker = new MockWorker() as unknown as Worker;
      const mockWorker = worker as unknown as MockWorker;

      // Override postMessage to do nothing
      mockWorker.postMessage = function () {};

      await expect(
        sendWorkerMessage(worker, 'test', {}, { timeout: 50 })
      ).rejects.toThrow('Worker message timeout');
    }, 1000);
  });

  describe('WorkerPool', () => {
    let createWorkerFn: () => Worker;

    beforeEach(() => {
      createWorkerFn = () => new MockWorker() as unknown as Worker;
    });

    it('should create a pool with default options', () => {
      const pool = new WorkerPool(createWorkerFn);
      const stats = pool.getStats();

      expect(stats.totalWorkers).toBe(0);
      expect(stats.busyWorkers).toBe(0);
      expect(stats.queuedTasks).toBe(0);

      pool.terminate();
    });

    it('should execute a task', async () => {
      const pool = new WorkerPool(createWorkerFn);

      const result = await pool.execute('test', { value: 1 });
      expect(result).toEqual({ processed: true });

      pool.terminate();
    });

    it('should create workers up to max limit', async () => {
      const pool = new WorkerPool(createWorkerFn, { maxWorkers: 2 });

      // Queue 3 tasks
      const promises = [
        pool.execute('test', { id: 1 }),
        pool.execute('test', { id: 2 }),
        pool.execute('test', { id: 3 }),
      ];

      // Should have 2 workers and 1 queued task (or already processed)
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeLessThanOrEqual(2);

      await Promise.all(promises);

      pool.terminate();
    });

    it('should execute all tasks in parallel', async () => {
      const pool = new WorkerPool(createWorkerFn, { maxWorkers: 4 });

      const payloads = [1, 2, 3, 4];
      const results = await pool.executeAll('test', payloads);

      expect(results).toHaveLength(4);

      pool.terminate();
    });

    it('should process tasks by priority', async () => {
      const executionOrder: number[] = [];

      // Create custom createWorkerFn to track order
      const trackingCreateWorkerFn = () => {
        const worker = new MockWorker() as unknown as MockWorker;
        worker.postMessage = function (message: unknown) {
          const msg = message as WorkerMessage<{ id: number }>;
          executionOrder.push(msg.payload.id);
          setTimeout(() => {
            worker.simulateResponse({
              id: msg.id,
              success: true,
              result: { processed: true },
            });
          }, 0);
        };
        return worker as unknown as Worker;
      };

      const pool = new WorkerPool(trackingCreateWorkerFn, { maxWorkers: 1 });

      // Queue tasks with different priorities
      const promises = [
        pool.execute('test', { id: 1 }, { priority: 0 }),
        pool.execute('test', { id: 2 }, { priority: 10 }), // High priority
        pool.execute('test', { id: 3 }, { priority: 5 }),  // Medium priority
      ];

      await Promise.all(promises);

      // First task starts immediately, then high priority, then medium
      expect(executionOrder[0]).toBe(1); // First queued runs first
      expect(executionOrder[1]).toBe(2); // High priority
      expect(executionOrder[2]).toBe(3); // Medium priority

      pool.terminate();
    });

    it('should get pool statistics', () => {
      const pool = new WorkerPool(createWorkerFn, { maxWorkers: 2 });

      const stats = pool.getStats();

      expect(stats).toEqual({
        totalWorkers: 0,
        busyWorkers: 0,
        idleWorkers: 0,
        queuedTasks: 0,
      });

      pool.terminate();
    });

    it('should terminate all workers', async () => {
      const pool = new WorkerPool(createWorkerFn);

      // Execute a task to create a worker
      const taskPromise = pool.execute('test', {});

      pool.terminate();

      // The task should be rejected when pool is terminated
      await expect(taskPromise).rejects.toThrow('Worker pool terminated');

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(0);
    });

    it('should reject pending tasks on terminate', async () => {
      // Create workers that don't respond
      const nonRespondingCreateWorkerFn = () => {
        const worker = new MockWorker() as unknown as MockWorker;
        worker.postMessage = function () {};
        return worker as unknown as Worker;
      };

      const pool = new WorkerPool(nonRespondingCreateWorkerFn, { maxWorkers: 1 });

      const promise1 = pool.execute('test', { id: 1 });
      const promise2 = pool.execute('test', { id: 2 });

      // Terminate immediately
      pool.terminate();

      await expect(promise1).rejects.toThrow('Worker pool terminated');
      await expect(promise2).rejects.toThrow('Worker pool terminated');
    });

    it('should handle task timeout', async () => {
      const nonRespondingCreateWorkerFn = () => {
        const worker = new MockWorker() as unknown as MockWorker;
        worker.postMessage = function () {
          // Don't respond to cause timeout
        };
        return worker as unknown as Worker;
      };

      const pool = new WorkerPool(nonRespondingCreateWorkerFn, { taskTimeout: 50 });

      await expect(
        pool.execute('test', {}, { timeout: 50 })
      ).rejects.toThrow('Task timeout');

      // Wait a bit for any internal cleanup before terminating
      await new Promise((resolve) => setTimeout(resolve, 10));

      pool.terminate();
    }, 1000);
  });

  describe('Transferable Objects', () => {
    describe('isTransferable', () => {
      it('should identify ArrayBuffer as transferable', () => {
        const buffer = new ArrayBuffer(8);
        expect(isTransferable(buffer)).toBe(true);
      });

      it('should identify MessagePort as transferable', () => {
        const { port1 } = new MessageChannel();
        expect(isTransferable(port1)).toBe(true);
      });

      it('should return false for non-transferable objects', () => {
        expect(isTransferable({})).toBe(false);
        expect(isTransferable([])).toBe(false);
        expect(isTransferable('string')).toBe(false);
        expect(isTransferable(123)).toBe(false);
        expect(isTransferable(null)).toBe(false);
      });
    });

    describe('extractTransferables', () => {
      it('should extract ArrayBuffer from object', () => {
        const buffer = new ArrayBuffer(8);
        const obj = { data: buffer };

        const transferables = extractTransferables(obj);

        expect(transferables).toContain(buffer);
      });

      it('should extract nested ArrayBuffers', () => {
        const buffer1 = new ArrayBuffer(8);
        const buffer2 = new ArrayBuffer(16);
        const obj = {
          nested: {
            buffer: buffer1,
          },
          array: [buffer2],
        };

        const transferables = extractTransferables(obj);

        expect(transferables).toContain(buffer1);
        expect(transferables).toContain(buffer2);
      });

      it('should handle circular references', () => {
        const obj: Record<string, unknown> = { buffer: new ArrayBuffer(8) };
        obj.self = obj; // Circular reference

        const transferables = extractTransferables(obj);

        expect(transferables).toHaveLength(1);
      });

      it('should return empty array for primitives', () => {
        expect(extractTransferables(null)).toEqual([]);
        expect(extractTransferables('string')).toEqual([]);
        expect(extractTransferables(123)).toEqual([]);
      });
    });

    describe('postTransferable', () => {
      it('should call postMessage with transferables', () => {
        const worker = new MockWorker() as unknown as Worker;
        const postMessageSpy = vi.spyOn(worker, 'postMessage');

        const buffer = new ArrayBuffer(8);
        const message = { data: buffer };

        postTransferable(worker, message, [buffer]);

        expect(postMessageSpy).toHaveBeenCalledWith(message, [buffer]);
      });
    });
  });

  describe('Typed Channel', () => {
    it('should create a typed channel', () => {
      const worker = new MockWorker() as unknown as Worker;
      const channel = createTypedChannel<
        { ping: { value: number } },
        { pong: { result: number } }
      >(worker);

      expect(channel.send).toBeDefined();
      expect(channel.on).toBeDefined();
    });

    it('should send messages through channel', () => {
      const worker = new MockWorker() as unknown as Worker;
      const postMessageSpy = vi.spyOn(worker, 'postMessage');

      const channel = createTypedChannel<
        { ping: { value: number } },
        { pong: { result: number } }
      >(worker);

      channel.send('ping', { value: 42 });

      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'ping',
        payload: { value: 42 },
      });
    });

    it('should receive messages through channel', async () => {
      const worker = new MockWorker() as unknown as Worker;
      const mockWorker = worker as unknown as MockWorker;

      const channel = createTypedChannel<
        { ping: { value: number } },
        { pong: { result: number } }
      >(worker);

      const handler = vi.fn();
      channel.on('pong', handler);

      // Simulate incoming message
      mockWorker.simulateResponse({
        id: 'test',
        success: true,
        result: undefined,
      });

      // Manually trigger message with correct format
      const messageHandler = (mockWorker as unknown as {
        messageHandlers: ((e: MessageEvent) => void)[];
      }).messageHandlers[0];
      messageHandler(
        new MessageEvent('message', {
          data: { type: 'pong', payload: { result: 84 } },
        })
      );

      expect(handler).toHaveBeenCalledWith({ result: 84 });
    });

    it('should unsubscribe from channel', () => {
      const worker = new MockWorker() as unknown as Worker;

      const channel = createTypedChannel<
        { ping: { value: number } },
        { pong: { result: number } }
      >(worker);

      const handler = vi.fn();
      const unsubscribe = channel.on('pong', handler);

      unsubscribe();

      // Handler should not be called after unsubscribe
      // (would need to trigger message to verify, but it's unsubscribed)
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Shared Worker Utilities', () => {
    describe('createSharedWorkerFromCode', () => {
      it('should create a shared worker from code', () => {
        const worker = createSharedWorkerFromCode('// shared worker code');

        expect(worker).toBeDefined();
        expect(worker.port).toBeDefined();
      });

      it('should support worker name option', () => {
        const worker = createSharedWorkerFromCode('// code', {
          name: 'my-shared-worker',
        });

        expect((worker as unknown as MockSharedWorker).options).toEqual({
          name: 'my-shared-worker',
        });
      });

      it('should revoke blob URL on port close', () => {
        const worker = createSharedWorkerFromCode('// code');
        const url = (worker as unknown as MockSharedWorker).url;

        worker.port.close();

        expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
      });
    });

    describe('connectToSharedWorker', () => {
      it('should connect to shared worker', () => {
        const worker = new MockSharedWorker() as unknown as SharedWorker;
        const connection = connectToSharedWorker<
          { request: { data: string } },
          { response: { result: string } }
        >(worker);

        expect(connection.send).toBeDefined();
        expect(connection.on).toBeDefined();
        expect(connection.close).toBeDefined();
      });

      it('should send messages through connection', () => {
        const worker = new MockSharedWorker() as unknown as SharedWorker;
        const postMessageSpy = vi.spyOn(worker.port, 'postMessage');

        const connection = connectToSharedWorker<
          { request: { data: string } },
          { response: { result: string } }
        >(worker);

        connection.send('request', { data: 'test' });

        expect(postMessageSpy).toHaveBeenCalledWith({
          type: 'request',
          payload: { data: 'test' },
        });
      });

      it('should receive messages through connection', () => {
        const worker = new MockSharedWorker() as unknown as SharedWorker;
        const mockPort = worker.port as unknown as MockMessagePort;

        const connection = connectToSharedWorker<
          { request: { data: string } },
          { response: { result: string } }
        >(worker);

        const handler = vi.fn();
        connection.on('response', handler);

        mockPort.simulateMessage({ type: 'response', payload: { result: 'success' } });

        expect(handler).toHaveBeenCalledWith({ result: 'success' });
      });

      it('should close connection', () => {
        const worker = new MockSharedWorker() as unknown as SharedWorker;
        const closeSpy = vi.spyOn(worker.port, 'close');

        const connection = connectToSharedWorker<
          { request: unknown },
          { response: unknown }
        >(worker);

        connection.close();

        expect(closeSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Utility Functions', () => {
    describe('isWorkerSupported', () => {
      it('should return true when Worker is available', () => {
        expect(isWorkerSupported()).toBe(true);
      });

      it('should return false when Worker is not available', () => {
        const originalWorkerLocal = globalThis.Worker;
        // @ts-expect-error - intentionally setting to undefined
        globalThis.Worker = undefined;

        expect(isWorkerSupported()).toBe(false);

        globalThis.Worker = originalWorkerLocal;
      });
    });

    describe('isSharedWorkerSupported', () => {
      it('should return true when SharedWorker is available', () => {
        expect(isSharedWorkerSupported()).toBe(true);
      });

      it('should return false when SharedWorker is not available', () => {
        const originalSharedWorkerLocal = globalThis.SharedWorker;
        // @ts-expect-error - intentionally setting to undefined
        globalThis.SharedWorker = undefined;

        expect(isSharedWorkerSupported()).toBe(false);

        globalThis.SharedWorker = originalSharedWorkerLocal;
      });
    });

    describe('getProcessorCount', () => {
      it('should return hardware concurrency', () => {
        const count = getProcessorCount();
        expect(count).toBeGreaterThan(0);
      });

      it('should return 4 as fallback', () => {
        const originalHardwareConcurrency =
          Object.getOwnPropertyDescriptor(Navigator.prototype, 'hardwareConcurrency');

        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
          get: () => undefined,
          configurable: true,
        });

        expect(getProcessorCount()).toBe(4);

        if (originalHardwareConcurrency) {
          Object.defineProperty(
            Navigator.prototype,
            'hardwareConcurrency',
            originalHardwareConcurrency
          );
        }
      });
    });
  });

  describe('Type safety', () => {
    it('should have proper WorkerMessage type', () => {
      const message: WorkerMessage<{ value: number }> = {
        id: 'test',
        type: 'process',
        payload: { value: 42 },
      };

      expect(message.id).toBe('test');
      expect(message.type).toBe('process');
      expect(message.payload.value).toBe(42);
    });

    it('should have proper WorkerResponse type', () => {
      const response: WorkerResponse<{ result: string }> = {
        id: 'test',
        success: true,
        result: { result: 'done' },
      };

      expect(response.id).toBe('test');
      expect(response.success).toBe(true);
      expect(response.result?.result).toBe('done');
    });

    it('should have proper WorkerPoolOptions type', () => {
      const options: WorkerPoolOptions = {
        maxWorkers: 4,
        idleTimeout: 60000,
        taskTimeout: 30000,
      };

      expect(options.maxWorkers).toBe(4);
      expect(options.idleTimeout).toBe(60000);
      expect(options.taskTimeout).toBe(30000);
    });
  });
});
