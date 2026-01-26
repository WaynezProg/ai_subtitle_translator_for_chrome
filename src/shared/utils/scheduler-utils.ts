/**
 * Task Scheduler Utilities
 *
 * Provides scheduling and task management capabilities:
 * - Delayed execution
 * - Periodic/interval tasks
 * - Cron-like scheduling
 * - Task prioritization
 * - Task cancellation
 * - Deadline-based scheduling
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Task priority
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Task definition
 */
export interface Task<T = unknown> {
  id: string;
  name: string;
  fn: () => Promise<T>;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  scheduledAt?: number;
  startedAt?: number;
  completedAt?: number;
  result?: T;
  error?: Error;
  retries: number;
  maxRetries: number;
  timeout?: number;
}

/**
 * Task options
 */
export interface TaskOptions {
  name?: string;
  priority?: TaskPriority;
  delay?: number;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Scheduled task handle
 */
export interface ScheduledTask {
  id: string;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  isPaused: () => boolean;
}

/**
 * Interval options
 */
export interface IntervalOptions {
  immediate?: boolean;
  maxRuns?: number;
  errorHandler?: (error: Error) => void;
}

/**
 * Cron-like schedule options
 */
export interface CronOptions {
  hours?: number[];
  minutes?: number[];
  daysOfWeek?: number[]; // 0 = Sunday
  timezone?: string;
}

// ============================================================================
// Task ID Generation
// ============================================================================

let taskIdCounter = 0;

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task_${Date.now()}_${++taskIdCounter}`;
}

// ============================================================================
// Delayed Execution
// ============================================================================

/**
 * Execute a function after a delay
 */
export function delay<T>(fn: () => T | Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, ms);
  });
}

/**
 * Create a cancellable delayed execution
 */
export function delayedTask<T>(
  fn: () => T | Promise<T>,
  ms: number
): { promise: Promise<T>; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  let cancelled = false;
  let rejectFn: (error: Error) => void;

  const promise = new Promise<T>((resolve, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(async () => {
      if (cancelled) return;
      try {
        const result = await fn();
        if (!cancelled) resolve(result);
      } catch (error) {
        if (!cancelled) reject(error);
      }
    }, ms);
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      clearTimeout(timeoutId);
      rejectFn(new Error('Task cancelled'));
    },
  };
}

/**
 * Execute with timeout
 */
export function withDeadline<T>(
  fn: () => Promise<T>,
  deadlineMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Task exceeded deadline of ${deadlineMs}ms`));
    }, deadlineMs);

    fn()
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

// ============================================================================
// Interval Execution
// ============================================================================

/**
 * Execute a function at regular intervals
 */
export function interval(
  fn: () => void | Promise<void>,
  ms: number,
  options: IntervalOptions = {}
): ScheduledTask {
  const { immediate = false, maxRuns = Infinity, errorHandler } = options;
  const id = generateTaskId();

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let paused = false;
  let runCount = 0;

  const execute = async () => {
    if (paused || runCount >= maxRuns) return;
    runCount++;

    try {
      await fn();
    } catch (error) {
      if (errorHandler) {
        errorHandler(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (runCount >= maxRuns) {
      stop();
    }
  };

  const start = () => {
    if (immediate) {
      execute();
    }
    intervalId = setInterval(execute, ms);
  };

  const stop = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  start();

  return {
    id,
    cancel: stop,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    isPaused: () => paused,
  };
}

/**
 * Execute a function repeatedly until condition is met
 */
export function repeatUntil(
  fn: () => void | Promise<void>,
  condition: () => boolean | Promise<boolean>,
  ms: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const done = await condition();
        if (done) {
          resolve();
          return;
        }
        await fn();
        setTimeout(check, ms);
      } catch (error) {
        reject(error);
      }
    };
    check();
  });
}

// ============================================================================
// Task Scheduler
// ============================================================================

/**
 * Priority-based task scheduler
 */
export class TaskScheduler {
  private tasks: Map<string, Task> = new Map();
  private queue: string[] = [];
  private running = false;
  private maxConcurrent: number;
  private activeCount = 0;

  constructor(options: { maxConcurrent?: number } = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 1;
  }

  /**
   * Schedule a task for execution
   */
  schedule<T>(
    fn: () => Promise<T>,
    options: TaskOptions = {}
  ): Promise<T> {
    const {
      name = 'unnamed',
      priority = 'normal',
      delay: delayMs,
      timeout,
      maxRetries = 0,
    } = options;

    const id = generateTaskId();
    const task: Task<T> = {
      id,
      name,
      fn,
      priority,
      status: 'pending',
      createdAt: Date.now(),
      scheduledAt: delayMs ? Date.now() + delayMs : undefined,
      retries: 0,
      maxRetries,
      timeout,
    };

    this.tasks.set(id, task as Task);
    this.insertByPriority(id, priority);

    if (delayMs) {
      setTimeout(() => this.processQueue(), delayMs);
    } else {
      this.processQueue();
    }

    return new Promise<T>((resolve, reject) => {
      const checkResult = () => {
        const t = this.tasks.get(id);
        if (!t) {
          reject(new Error('Task not found'));
          return;
        }

        if (t.status === 'completed') {
          resolve(t.result as T);
        } else if (t.status === 'failed') {
          reject(t.error);
        } else if (t.status === 'cancelled') {
          reject(new Error('Task cancelled'));
        } else {
          setTimeout(checkResult, 10);
        }
      };
      checkResult();
    });
  }

  /**
   * Cancel a scheduled task
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    task.status = 'cancelled';
    this.queue = this.queue.filter((id) => id !== taskId);
    return true;
  }

  /**
   * Get task status
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get pending tasks
   */
  getPendingTasks(): Task[] {
    return this.getAllTasks().filter((t) => t.status === 'pending');
  }

  /**
   * Clear completed tasks
   */
  clearCompleted(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        this.tasks.delete(id);
      }
    }
  }

  /**
   * Cancel all pending tasks
   */
  cancelAll(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'pending') {
        task.status = 'cancelled';
      }
    }
    this.queue = [];
  }

  private insertByPriority(id: string, priority: TaskPriority): void {
    const priorityOrder: Record<TaskPriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3,
    };

    const insertPriority = priorityOrder[priority];
    let insertIndex = this.queue.length;

    for (let i = 0; i < this.queue.length; i++) {
      const existingTask = this.tasks.get(this.queue[i]);
      if (existingTask && priorityOrder[existingTask.priority] > insertPriority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, id);
  }

  private async processQueue(): Promise<void> {
    if (this.running && this.activeCount >= this.maxConcurrent) return;
    this.running = true;

    while (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const taskId = this.queue.shift();
      if (!taskId) break;

      const task = this.tasks.get(taskId);
      if (!task || task.status !== 'pending') continue;

      // Check if scheduled for later
      if (task.scheduledAt && Date.now() < task.scheduledAt) {
        this.queue.unshift(taskId);
        break;
      }

      this.activeCount++;
      this.executeTask(task).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }

    if (this.queue.length === 0 && this.activeCount === 0) {
      this.running = false;
    }
  }

  private async executeTask(task: Task): Promise<void> {
    task.status = 'running';
    task.startedAt = Date.now();

    try {
      const executeWithTimeout = task.timeout
        ? withDeadline(task.fn, task.timeout)
        : task.fn();

      task.result = await executeWithTimeout;
      task.status = 'completed';
      task.completedAt = Date.now();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (task.retries < task.maxRetries) {
        task.retries++;
        task.status = 'pending';
        this.queue.push(task.id);
      } else {
        task.error = err;
        task.status = 'failed';
        task.completedAt = Date.now();
      }
    }
  }
}

// ============================================================================
// Debounce and Throttle
// ============================================================================

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void; flush: () => void } {
  const { leading = false, trailing = true } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let result: ReturnType<T>;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;

  const invokeFunc = (time: number) => {
    const args = lastArgs!;
    const thisArg = lastThis;

    lastArgs = lastThis = null;
    lastInvokeTime = time;
    result = fn.apply(thisArg, args) as ReturnType<T>;
    return result;
  };

  const shouldInvoke = (time: number) => {
    const timeSinceLastCall = lastCallTime === undefined ? 0 : time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      timeSinceLastInvoke >= wait
    );
  };

  const startTimer = (pendingFunc: () => void, waitTime: number) => {
    timeoutId = setTimeout(pendingFunc, waitTime);
  };

  const cancelTimer = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const trailingEdge = (time: number) => {
    timeoutId = null;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = null;
    return result;
  };

  const timerExpired = () => {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    const timeSinceLastCall = time - lastCallTime!;
    const timeWaiting = wait - timeSinceLastCall;
    startTimer(timerExpired, timeWaiting);
  };

  const leadingEdge = (time: number) => {
    lastInvokeTime = time;
    startTimer(timerExpired, wait);

    return leading ? invokeFunc(time) : result;
  };

  const debounced = function (this: unknown, ...args: Parameters<T>) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastThis = this;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        return leadingEdge(time);
      }
    }

    if (timeoutId === null) {
      startTimer(timerExpired, wait);
    }

    return result;
  } as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    cancelTimer();
    lastInvokeTime = 0;
    lastCallTime = undefined;
    lastArgs = lastThis = null;
  };

  debounced.flush = () => {
    if (timeoutId !== null) {
      return trailingEdge(Date.now());
    }
    return result;
  };

  return debounced;
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number,
  options: { leading?: boolean; trailing?: boolean } = {}
): T & { cancel: () => void } {
  const { leading = true, trailing = true } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: unknown = null;
  let result: ReturnType<T>;
  let lastCallTime = 0;

  const invokeFunc = () => {
    const args = lastArgs!;
    const thisArg = lastThis;
    lastArgs = lastThis = null;
    lastCallTime = Date.now();
    result = fn.apply(thisArg, args) as ReturnType<T>;
    return result;
  };

  const trailingCall = () => {
    timeoutId = null;
    if (trailing && lastArgs) {
      invokeFunc();
      timeoutId = setTimeout(trailingCall, wait);
    }
  };

  const throttled = function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - lastCallTime);

    lastArgs = args;
    lastThis = this;

    if (remaining <= 0 || remaining > wait) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (leading) {
        invokeFunc();
      }
      if (trailing && !timeoutId) {
        timeoutId = setTimeout(trailingCall, wait);
      }
    } else if (!timeoutId && trailing) {
      timeoutId = setTimeout(trailingCall, remaining);
    }

    return result;
  } as T & { cancel: () => void };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastCallTime = 0;
    lastArgs = lastThis = null;
  };

  return throttled;
}

// ============================================================================
// Idle Callback
// ============================================================================

/**
 * Schedule work during browser idle time
 */
export function scheduleIdle<T>(
  fn: () => T,
  options: { timeout?: number } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const callback = () => {
      try {
        resolve(fn());
      } catch (error) {
        reject(error);
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(callback, { timeout: options.timeout });
    } else {
      // Fallback for environments without requestIdleCallback
      setTimeout(callback, 1);
    }
  });
}

/**
 * Run tasks during idle periods
 */
export function idleQueue(
  tasks: Array<() => void>,
  options: { timeout?: number; onProgress?: (completed: number, total: number) => void } = {}
): Promise<void> {
  const { timeout = 50, onProgress } = options;

  return new Promise((resolve, reject) => {
    let index = 0;

    const processNext = (deadline?: IdleDeadline) => {
      try {
        while (index < tasks.length) {
          // Check if we have time remaining
          if (deadline && deadline.timeRemaining() <= 0 && !deadline.didTimeout) {
            scheduleNextBatch();
            return;
          }

          tasks[index]();
          index++;
          onProgress?.(index, tasks.length);
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    };

    const scheduleNextBatch = () => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(processNext, { timeout });
      } else {
        setTimeout(() => processNext(), 1);
      }
    };

    scheduleNextBatch();
  });
}

// ============================================================================
// Animation Frame Scheduling
// ============================================================================

/**
 * Schedule work on next animation frame
 */
export function nextFrame(): Promise<number> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(resolve);
    } else {
      setTimeout(() => resolve(Date.now()), 16);
    }
  });
}

/**
 * Run a function on every animation frame
 */
export function frameLoop(
  fn: (timestamp: number, delta: number) => boolean | void
): { stop: () => void } {
  let lastTimestamp = 0;
  let running = true;
  let frameId: number;

  const loop = (timestamp: number) => {
    if (!running) return;

    const delta = lastTimestamp ? timestamp - lastTimestamp : 0;
    lastTimestamp = timestamp;

    const shouldContinue = fn(timestamp, delta);
    if (shouldContinue === false) {
      running = false;
      return;
    }

    frameId = requestAnimationFrame(loop);
  };

  frameId = requestAnimationFrame(loop);

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wait for a specific amount of time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute tasks in sequence with optional delay between each
 */
export async function sequence<T>(
  tasks: Array<() => Promise<T>>,
  delayBetween: number = 0
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < tasks.length; i++) {
    if (i > 0 && delayBetween > 0) {
      await sleep(delayBetween);
    }
    results.push(await tasks[i]());
  }

  return results;
}

/**
 * Execute tasks in parallel with a concurrency limit
 */
export async function parallel<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number = Infinity
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < tasks.length; i++) {
    const index = i;

    const promise = tasks[index]().then((result) => {
      results[index] = result;
      executing.delete(promise);
    });

    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
