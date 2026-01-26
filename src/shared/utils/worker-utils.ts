/**
 * Web Worker Utilities
 *
 * Provides utilities for working with Web Workers, including:
 * - Worker pool management for parallel task execution
 * - Promisified worker communication
 * - Inline worker creation from functions
 * - Worker thread messaging with typed messages
 * - Task queue with priority support
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Message sent to a worker
 */
export interface WorkerMessage<T = unknown> {
  id: string;
  type: string;
  payload: T;
}

/**
 * Response from a worker
 */
export interface WorkerResponse<T = unknown> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * Worker task definition
 */
export interface WorkerTask<TInput = unknown, TOutput = unknown> {
  id: string;
  type: string;
  payload: TInput;
  priority?: number;
  resolve: (value: TOutput) => void;
  reject: (error: Error) => void;
  timeout?: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Worker pool options
 */
export interface WorkerPoolOptions {
  maxWorkers?: number;
  idleTimeout?: number;
  taskTimeout?: number;
}

/**
 * Worker wrapper for managing a single worker
 */
export interface WorkerWrapper {
  worker: Worker;
  busy: boolean;
  currentTask?: WorkerTask;
  lastUsed: number;
}

/**
 * Task handler function type
 */
export type TaskHandler<TInput = unknown, TOutput = unknown> = (
  payload: TInput
) => TOutput | Promise<TOutput>;

/**
 * Worker handlers map
 */
export type WorkerHandlers = Map<string, TaskHandler>;

// ============================================================================
// Inline Worker Creation
// ============================================================================

/**
 * Create a worker from an inline function
 */
export function createInlineWorker(
  fn: () => void,
  options?: { name?: string }
): Worker {
  const code = `(${fn.toString()})();`;
  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  const worker = new Worker(url, { name: options?.name });

  // Clean up blob URL when worker is terminated
  const originalTerminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    URL.revokeObjectURL(url);
    originalTerminate();
  };

  return worker;
}

/**
 * Create a worker from a string of code
 */
export function createWorkerFromCode(
  code: string,
  options?: { name?: string }
): Worker {
  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  const worker = new Worker(url, { name: options?.name });

  const originalTerminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    URL.revokeObjectURL(url);
    originalTerminate();
  };

  return worker;
}

/**
 * Create a worker with message handling boilerplate
 */
export function createMessageWorker(
  handlers: Record<string, TaskHandler>
): Worker {
  const handlersCode = Object.entries(handlers)
    .map(([type, handler]) => `"${type}": ${handler.toString()}`)
    .join(',\n');

  const code = `
    const handlers = {
      ${handlersCode}
    };

    self.onmessage = async function(event) {
      const { id, type, payload } = event.data;

      try {
        const handler = handlers[type];
        if (!handler) {
          throw new Error('Unknown message type: ' + type);
        }

        const result = await handler(payload);
        self.postMessage({ id, success: true, result });
      } catch (error) {
        self.postMessage({
          id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
  `;

  return createWorkerFromCode(code);
}

// ============================================================================
// Promisified Worker Communication
// ============================================================================

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Send a message to a worker and wait for response
 */
export function sendWorkerMessage<TInput, TOutput>(
  worker: Worker,
  type: string,
  payload: TInput,
  options?: { timeout?: number }
): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    const id = generateMessageId();
    const timeout = options?.timeout ?? 30000;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleMessage = (event: MessageEvent<WorkerResponse<TOutput>>) => {
      if (event.data.id !== id) return;

      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (timeoutId) clearTimeout(timeoutId);

      if (event.data.success) {
        resolve(event.data.result as TOutput);
      } else {
        reject(new Error(event.data.error ?? 'Unknown worker error'));
      }
    };

    const handleError = (event: ErrorEvent) => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      if (timeoutId) clearTimeout(timeoutId);

      reject(new Error(event.message ?? 'Worker error'));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        reject(new Error('Worker message timeout'));
      }, timeout);
    }

    const message: WorkerMessage<TInput> = { id, type, payload };
    worker.postMessage(message);
  });
}

// ============================================================================
// Worker Pool
// ============================================================================

/**
 * Worker pool for managing multiple workers
 */
export class WorkerPool {
  private workers: WorkerWrapper[] = [];
  private taskQueue: WorkerTask[] = [];
  private createWorker: () => Worker;
  private maxWorkers: number;
  private idleTimeout: number;
  private taskTimeout: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(createWorker: () => Worker, options: WorkerPoolOptions = {}) {
    this.createWorker = createWorker;
    this.maxWorkers = options.maxWorkers ?? navigator.hardwareConcurrency ?? 4;
    this.idleTimeout = options.idleTimeout ?? 60000;
    this.taskTimeout = options.taskTimeout ?? 30000;

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupIdleWorkers(), 10000);
  }

  /**
   * Execute a task on the pool
   */
  execute<TInput, TOutput>(
    type: string,
    payload: TInput,
    options?: { priority?: number; timeout?: number }
  ): Promise<TOutput> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<TInput, TOutput> = {
        id: generateMessageId(),
        type,
        payload,
        priority: options?.priority ?? 0,
        timeout: options?.timeout ?? this.taskTimeout,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      this.enqueueTask(task);
      this.processQueue();
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  executeAll<TInput, TOutput>(
    type: string,
    payloads: TInput[],
    options?: { priority?: number; timeout?: number }
  ): Promise<TOutput[]> {
    return Promise.all(
      payloads.map((payload) => this.execute<TInput, TOutput>(type, payload, options))
    );
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number;
    busyWorkers: number;
    idleWorkers: number;
    queuedTasks: number;
  } {
    const busyWorkers = this.workers.filter((w) => w.busy).length;
    return {
      totalWorkers: this.workers.length,
      busyWorkers,
      idleWorkers: this.workers.length - busyWorkers,
      queuedTasks: this.taskQueue.length,
    };
  }

  /**
   * Terminate all workers and clear the queue
   */
  terminate(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Reject all pending tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool terminated'));
      if (task.timeoutId) clearTimeout(task.timeoutId);
    }
    this.taskQueue = [];

    // Terminate all workers
    for (const wrapper of this.workers) {
      if (wrapper.currentTask) {
        wrapper.currentTask.reject(new Error('Worker pool terminated'));
        if (wrapper.currentTask.timeoutId) {
          clearTimeout(wrapper.currentTask.timeoutId);
        }
      }
      wrapper.worker.terminate();
    }
    this.workers = [];
  }

  /**
   * Add a task to the queue
   */
  private enqueueTask(task: WorkerTask): void {
    // Insert based on priority (higher priority = earlier in queue)
    const index = this.taskQueue.findIndex((t) => (t.priority ?? 0) < (task.priority ?? 0));
    if (index === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(index, 0, task);
    }
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Find an available worker
    let worker = this.workers.find((w) => !w.busy);

    // Create a new worker if none available and under limit
    if (!worker && this.workers.length < this.maxWorkers) {
      worker = this.createWorkerWrapper();
      this.workers.push(worker);
    }

    if (!worker) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    this.runTask(worker, task);
  }

  /**
   * Create a worker wrapper
   */
  private createWorkerWrapper(): WorkerWrapper {
    const worker = this.createWorker();
    return {
      worker,
      busy: false,
      lastUsed: Date.now(),
    };
  }

  /**
   * Run a task on a worker
   */
  private runTask(wrapper: WorkerWrapper, task: WorkerTask): void {
    wrapper.busy = true;
    wrapper.currentTask = task;

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== task.id) return;

      wrapper.worker.removeEventListener('message', handleMessage);
      wrapper.worker.removeEventListener('error', handleError);
      if (task.timeoutId) clearTimeout(task.timeoutId);

      wrapper.busy = false;
      wrapper.currentTask = undefined;
      wrapper.lastUsed = Date.now();

      if (event.data.success) {
        task.resolve(event.data.result);
      } else {
        task.reject(new Error(event.data.error ?? 'Unknown worker error'));
      }

      // Process next task
      this.processQueue();
    };

    const handleError = (event: ErrorEvent) => {
      wrapper.worker.removeEventListener('message', handleMessage);
      wrapper.worker.removeEventListener('error', handleError);
      if (task.timeoutId) clearTimeout(task.timeoutId);

      wrapper.busy = false;
      wrapper.currentTask = undefined;

      // Recreate the worker since it errored
      wrapper.worker.terminate();
      wrapper.worker = this.createWorker();
      wrapper.lastUsed = Date.now();

      task.reject(new Error(event.message ?? 'Worker error'));

      // Process next task
      this.processQueue();
    };

    wrapper.worker.addEventListener('message', handleMessage);
    wrapper.worker.addEventListener('error', handleError);

    // Set up timeout
    if (task.timeout && task.timeout > 0) {
      task.timeoutId = setTimeout(() => {
        wrapper.worker.removeEventListener('message', handleMessage);
        wrapper.worker.removeEventListener('error', handleError);

        wrapper.busy = false;
        wrapper.currentTask = undefined;

        // Recreate the worker since it timed out
        wrapper.worker.terminate();
        wrapper.worker = this.createWorker();
        wrapper.lastUsed = Date.now();

        task.reject(new Error('Task timeout'));

        // Process next task
        this.processQueue();
      }, task.timeout);
    }

    const message: WorkerMessage = {
      id: task.id,
      type: task.type,
      payload: task.payload,
    };
    wrapper.worker.postMessage(message);
  }

  /**
   * Clean up idle workers
   */
  private cleanupIdleWorkers(): void {
    const now = Date.now();
    const idleWorkers = this.workers.filter(
      (w) => !w.busy && now - w.lastUsed > this.idleTimeout
    );

    // Keep at least one worker
    const toRemove = Math.min(idleWorkers.length, this.workers.length - 1);
    for (let i = 0; i < toRemove; i++) {
      const worker = idleWorkers[i];
      worker.worker.terminate();
      const index = this.workers.indexOf(worker);
      if (index !== -1) {
        this.workers.splice(index, 1);
      }
    }
  }
}

// ============================================================================
// Transferable Objects
// ============================================================================

/**
 * Post a message with transferable objects
 */
export function postTransferable(
  worker: Worker,
  message: unknown,
  transferables: Transferable[]
): void {
  worker.postMessage(message, transferables);
}

/**
 * Check if an object is transferable
 */
export function isTransferable(obj: unknown): obj is Transferable {
  return (
    obj instanceof ArrayBuffer ||
    obj instanceof MessagePort ||
    (typeof ImageBitmap !== 'undefined' && obj instanceof ImageBitmap) ||
    (typeof OffscreenCanvas !== 'undefined' && obj instanceof OffscreenCanvas)
  );
}

/**
 * Extract transferables from a nested object
 */
export function extractTransferables(obj: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  const visited = new WeakSet();

  function traverse(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    if (visited.has(value as object)) return;
    visited.add(value as object);

    if (isTransferable(value)) {
      transferables.push(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item);
      }
    } else {
      for (const key of Object.keys(value as object)) {
        traverse((value as Record<string, unknown>)[key]);
      }
    }
  }

  traverse(obj);
  return transferables;
}

// ============================================================================
// Worker Thread Utilities
// ============================================================================

/**
 * Create a typed message channel between main thread and worker
 */
export function createTypedChannel<
  TToWorker extends Record<string, unknown>,
  TFromWorker extends Record<string, unknown>,
>(
  worker: Worker
): {
  send: <K extends keyof TToWorker>(type: K, payload: TToWorker[K]) => void;
  on: <K extends keyof TFromWorker>(
    type: K,
    handler: (payload: TFromWorker[K]) => void
  ) => () => void;
} {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();

  worker.addEventListener('message', (event) => {
    const { type, payload } = event.data as { type: string; payload: unknown };
    const typeHandlers = handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(payload);
      }
    }
  });

  return {
    send(type, payload) {
      worker.postMessage({ type, payload });
    },
    on(type, handler) {
      const typeStr = type as string;
      if (!handlers.has(typeStr)) {
        handlers.set(typeStr, new Set());
      }
      handlers.get(typeStr)!.add(handler as (payload: unknown) => void);
      return () => {
        handlers.get(typeStr)?.delete(handler as (payload: unknown) => void);
      };
    },
  };
}

// ============================================================================
// Shared Worker Utilities
// ============================================================================

/**
 * Create a shared worker from code
 */
export function createSharedWorkerFromCode(
  code: string,
  options?: { name?: string }
): SharedWorker {
  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  const worker = new SharedWorker(url, { name: options?.name });

  // Note: SharedWorker doesn't have a terminate method, but we can close the port
  const originalClose = worker.port.close.bind(worker.port);
  worker.port.close = () => {
    URL.revokeObjectURL(url);
    originalClose();
  };

  return worker;
}

/**
 * Connect to a shared worker with typed messages
 */
export function connectToSharedWorker<
  TToWorker extends Record<string, unknown>,
  TFromWorker extends Record<string, unknown>,
>(
  worker: SharedWorker
): {
  send: <K extends keyof TToWorker>(type: K, payload: TToWorker[K]) => void;
  on: <K extends keyof TFromWorker>(
    type: K,
    handler: (payload: TFromWorker[K]) => void
  ) => () => void;
  close: () => void;
} {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();

  worker.port.start();

  worker.port.addEventListener('message', (event) => {
    const { type, payload } = event.data as { type: string; payload: unknown };
    const typeHandlers = handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        handler(payload);
      }
    }
  });

  return {
    send(type, payload) {
      worker.port.postMessage({ type, payload });
    },
    on(type, handler) {
      const typeStr = type as string;
      if (!handlers.has(typeStr)) {
        handlers.set(typeStr, new Set());
      }
      handlers.get(typeStr)!.add(handler as (payload: unknown) => void);
      return () => {
        handlers.get(typeStr)?.delete(handler as (payload: unknown) => void);
      };
    },
    close() {
      worker.port.close();
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if Web Workers are supported
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Check if Shared Workers are supported
 */
export function isSharedWorkerSupported(): boolean {
  return typeof SharedWorker !== 'undefined';
}

/**
 * Get the number of logical processors
 */
export function getProcessorCount(): number {
  return navigator.hardwareConcurrency ?? 4;
}

/**
 * Create a simple task worker that processes items
 */
export function createTaskWorker<TInput, TOutput>(
  processor: (input: TInput) => TOutput | Promise<TOutput>
): Worker {
  const code = `
    const processor = ${processor.toString()};

    self.onmessage = async function(event) {
      const { id, type, payload } = event.data;

      try {
        const result = await processor(payload);
        self.postMessage({ id, success: true, result });
      } catch (error) {
        self.postMessage({
          id,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
  `;

  return createWorkerFromCode(code);
}
