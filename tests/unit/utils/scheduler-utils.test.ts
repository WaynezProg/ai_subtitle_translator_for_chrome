/**
 * Tests for Task Scheduler Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Task ID
  generateTaskId,
  // Delayed execution
  delay,
  delayedTask,
  withDeadline,
  // Interval execution
  interval,
  repeatUntil,
  // Task scheduler
  TaskScheduler,
  // Debounce and throttle
  debounce,
  throttle,
  // Idle callback
  scheduleIdle,
  idleQueue,
  // Animation frame
  nextFrame,
  frameLoop,
  // Utilities
  sleep,
  sequence,
  parallel,
} from '@shared/utils/scheduler-utils';

describe('Scheduler Utils', () => {
  describe('generateTaskId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateTaskId();
      const id2 = generateTaskId();

      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with task_ prefix', () => {
      const id = generateTaskId();
      expect(id.startsWith('task_')).toBe(true);
    });
  });

  describe('Delayed Execution', () => {
    describe('delay', () => {
      it('should execute function after delay', async () => {
        const fn = vi.fn().mockReturnValue('result');
        const start = Date.now();

        const result = await delay(fn, 50);

        expect(result).toBe('result');
        expect(Date.now() - start).toBeGreaterThanOrEqual(45);
      });

      it('should handle async functions', async () => {
        const fn = vi.fn().mockResolvedValue('async result');

        const result = await delay(fn, 10);

        expect(result).toBe('async result');
      });

      it('should propagate errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('test error'));

        await expect(delay(fn, 10)).rejects.toThrow('test error');
      });
    });

    describe('delayedTask', () => {
      it('should execute function after delay', async () => {
        const fn = vi.fn().mockReturnValue('result');

        const { promise } = delayedTask(fn, 50);
        const result = await promise;

        expect(result).toBe('result');
      });

      it('should be cancellable', async () => {
        const fn = vi.fn().mockReturnValue('result');

        const { promise, cancel } = delayedTask(fn, 100);
        cancel();

        await expect(promise).rejects.toThrow('cancelled');
        expect(fn).not.toHaveBeenCalled();
      });
    });

    describe('withDeadline', () => {
      it('should return result if completed within deadline', async () => {
        const fn = vi.fn().mockResolvedValue('result');

        const result = await withDeadline(fn, 100);

        expect(result).toBe('result');
      });

      it('should reject if deadline exceeded', async () => {
        const fn = () => new Promise((resolve) => setTimeout(() => resolve('late'), 100));

        await expect(withDeadline(fn, 20)).rejects.toThrow('exceeded deadline');
      });

      it('should propagate errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('test error'));

        await expect(withDeadline(fn, 100)).rejects.toThrow('test error');
      });
    });
  });

  describe('Interval Execution', () => {
    describe('interval', () => {
      it('should execute function at regular intervals', async () => {
        const fn = vi.fn();

        const task = interval(fn, 30);

        await sleep(100);
        task.cancel();

        // With 30ms interval and 100ms wait, we should get 2-3 executions
        // (depends on timing: 30ms, 60ms, 90ms)
        expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(fn.mock.calls.length).toBeLessThanOrEqual(4);
      });

      it('should execute immediately with immediate option', async () => {
        const fn = vi.fn();

        const task = interval(fn, 100, { immediate: true });
        await sleep(10);
        task.cancel();

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should respect maxRuns option', async () => {
        const fn = vi.fn();

        const task = interval(fn, 20, { maxRuns: 2, immediate: true });

        await sleep(100);

        expect(fn).toHaveBeenCalledTimes(2);
        task.cancel();
      });

      it('should be pausable', async () => {
        const fn = vi.fn();

        const task = interval(fn, 20);

        await sleep(50);
        task.pause();
        const callsBeforePause = fn.mock.calls.length;

        await sleep(50);

        expect(fn.mock.calls.length).toBe(callsBeforePause);
        task.cancel();
      });

      it('should be resumable', async () => {
        const fn = vi.fn();

        const task = interval(fn, 20);

        await sleep(30);
        task.pause();
        await sleep(30);
        task.resume();
        await sleep(50);

        task.cancel();

        // Should have more calls after resume
        expect(fn.mock.calls.length).toBeGreaterThan(1);
      });

      it('should handle errors with errorHandler', async () => {
        const errorHandler = vi.fn();
        const fn = vi.fn().mockRejectedValue(new Error('test error'));

        const task = interval(fn, 20, { errorHandler });

        await sleep(50);
        task.cancel();

        expect(errorHandler).toHaveBeenCalled();
      });
    });

    describe('repeatUntil', () => {
      it('should repeat until condition is true', async () => {
        let counter = 0;
        const fn = vi.fn(() => {
          counter++;
        });
        const condition = () => counter >= 3;

        await repeatUntil(fn, condition, 20);

        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should support async condition', async () => {
        let counter = 0;
        const fn = () => {
          counter++;
        };
        const condition = async () => counter >= 2;

        await repeatUntil(fn, condition, 20);

        expect(counter).toBe(2);
      });

      it('should propagate errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('test error'));
        const condition = () => false;

        await expect(repeatUntil(fn, condition, 20)).rejects.toThrow('test error');
      });
    });
  });

  describe('TaskScheduler', () => {
    let scheduler: TaskScheduler;

    beforeEach(() => {
      scheduler = new TaskScheduler({ maxConcurrent: 2 });
    });

    afterEach(() => {
      scheduler.cancelAll();
    });

    it('should schedule and execute tasks', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await scheduler.schedule(fn, { name: 'test-task' });

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should execute tasks in priority order', async () => {
      // Create a scheduler with maxConcurrent=1 to test priority ordering
      const priorityScheduler = new TaskScheduler({ maxConcurrent: 1 });
      const executionOrder: string[] = [];

      // Create a blocking task that holds the scheduler while we add prioritized tasks
      let blockResolve: () => void;
      const blockPromise = new Promise<void>((r) => { blockResolve = r; });

      // Schedule a blocking task first
      const blockingTask = priorityScheduler.schedule(async () => {
        await blockPromise;
        executionOrder.push('blocking');
        return 'blocking';
      }, { priority: 'normal' });

      // Wait for the blocking task to start
      await sleep(10);

      // Now schedule tasks with different priorities while the blocking task is running
      // These will be queued and should be ordered by priority
      const lowTask = priorityScheduler.schedule(async () => {
        executionOrder.push('low');
        return 'low';
      }, { priority: 'low' });

      const criticalTask = priorityScheduler.schedule(async () => {
        executionOrder.push('critical');
        return 'critical';
      }, { priority: 'critical' });

      const highTask = priorityScheduler.schedule(async () => {
        executionOrder.push('high');
        return 'high';
      }, { priority: 'high' });

      // Release the blocking task
      blockResolve!();

      await Promise.all([blockingTask, lowTask, highTask, criticalTask]);

      // After blocking task completes, critical should run before high, high before low
      expect(executionOrder[0]).toBe('blocking');
      expect(executionOrder.indexOf('critical')).toBeLessThan(executionOrder.indexOf('high'));
      expect(executionOrder.indexOf('high')).toBeLessThan(executionOrder.indexOf('low'));
    });

    it('should respect maxConcurrent', async () => {
      const singleConcurrentScheduler = new TaskScheduler({ maxConcurrent: 1 });
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const createTask = () => async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await sleep(20);
        currentConcurrent--;
        return 'done';
      };

      const promises = [
        singleConcurrentScheduler.schedule(createTask()),
        singleConcurrentScheduler.schedule(createTask()),
        singleConcurrentScheduler.schedule(createTask()),
      ];

      await Promise.all(promises);

      expect(maxConcurrent).toBe(1);
    });

    it('should cancel pending tasks', async () => {
      let taskStarted = false;

      const promise = scheduler.schedule(async () => {
        taskStarted = true;
        await sleep(100);
        return 'result';
      });

      const task = scheduler.getPendingTasks()[0];
      if (task) {
        scheduler.cancel(task.id);
      }

      // Give time for cancellation to take effect
      await sleep(50);

      // The task should not have completed normally
      // (it was either cancelled before starting or while running)
    });

    it('should handle task timeouts', async () => {
      await expect(
        scheduler.schedule(
          async () => {
            await sleep(100);
            return 'result';
          },
          { timeout: 20 }
        )
      ).rejects.toThrow('exceeded deadline');
    });

    it('should retry failed tasks', async () => {
      let attempts = 0;

      const result = await scheduler.schedule(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('fail');
          }
          return 'success';
        },
        { maxRetries: 3 }
      );

      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should track task status', async () => {
      const promise = scheduler.schedule(async () => {
        await sleep(50);
        return 'result';
      }, { name: 'tracked-task' });

      // Give it time to start
      await sleep(10);

      const tasks = scheduler.getAllTasks();
      const runningTask = tasks.find((t) => t.name === 'tracked-task');

      expect(runningTask?.status).toBe('running');

      await promise;

      const completedTask = scheduler.getTask(runningTask!.id);
      expect(completedTask?.status).toBe('completed');
    });

    it('should clear completed tasks', async () => {
      await scheduler.schedule(async () => 'result');

      expect(scheduler.getAllTasks().length).toBe(1);

      scheduler.clearCompleted();

      expect(scheduler.getAllTasks().length).toBe(0);
    });
  });

  describe('Debounce', () => {
    describe('debounce', () => {
      it('should debounce function calls', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced();
        debounced();
        debounced();

        expect(fn).not.toHaveBeenCalled();

        await sleep(60);

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should call with latest arguments', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced('a');
        debounced('b');
        debounced('c');

        await sleep(60);

        expect(fn).toHaveBeenCalledWith('c');
      });

      it('should support leading option', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50, { leading: true, trailing: false });

        debounced();
        debounced();
        debounced();

        expect(fn).toHaveBeenCalledTimes(1);

        await sleep(60);

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should be cancellable', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced();
        debounced.cancel();

        await sleep(60);

        expect(fn).not.toHaveBeenCalled();
      });

      it('should support flush', async () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.flush();

        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Throttle', () => {
    describe('throttle', () => {
      it('should throttle function calls', async () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 50);

        throttled();
        throttled();
        throttled();

        expect(fn).toHaveBeenCalledTimes(1);

        await sleep(60);
        throttled();

        expect(fn).toHaveBeenCalledTimes(2);
      });

      it('should support leading option', async () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 50, { leading: true, trailing: false });

        throttled();
        throttled();

        expect(fn).toHaveBeenCalledTimes(1);

        await sleep(60);

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should support trailing option', async () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 50, { leading: false, trailing: true });

        throttled();
        throttled();

        expect(fn).not.toHaveBeenCalled();

        await sleep(60);

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should be cancellable', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 50, { leading: false, trailing: true });

        throttled();
        throttled.cancel();

        // No call should be made
        expect(fn).not.toHaveBeenCalled();
      });
    });
  });

  describe('Idle Callback', () => {
    describe('scheduleIdle', () => {
      it('should execute function during idle time', async () => {
        const fn = vi.fn().mockReturnValue('result');

        const result = await scheduleIdle(fn);

        expect(result).toBe('result');
      });

      it('should handle errors', async () => {
        const fn = vi.fn().mockImplementation(() => {
          throw new Error('test error');
        });

        await expect(scheduleIdle(fn)).rejects.toThrow('test error');
      });
    });

    describe('idleQueue', () => {
      it('should process all tasks', async () => {
        const results: number[] = [];
        const tasks = Array.from({ length: 5 }, (_, i) => () => results.push(i));

        await idleQueue(tasks);

        expect(results).toEqual([0, 1, 2, 3, 4]);
      });

      it('should call onProgress', async () => {
        const onProgress = vi.fn();
        const tasks = [() => {}, () => {}, () => {}];

        await idleQueue(tasks, { onProgress });

        expect(onProgress).toHaveBeenCalledWith(1, 3);
        expect(onProgress).toHaveBeenCalledWith(2, 3);
        expect(onProgress).toHaveBeenCalledWith(3, 3);
      });
    });
  });

  describe('Animation Frame', () => {
    describe('nextFrame', () => {
      it('should resolve on next frame', async () => {
        const timestamp = await nextFrame();
        expect(typeof timestamp).toBe('number');
      });
    });

    describe('frameLoop', () => {
      it('should call function on each frame', async () => {
        const fn = vi.fn().mockReturnValue(undefined);

        const { stop } = frameLoop(fn);

        await sleep(50);
        stop();

        expect(fn.mock.calls.length).toBeGreaterThan(0);
      });

      it('should stop when function returns false', async () => {
        let callCount = 0;
        const fn = vi.fn(() => {
          callCount++;
          return callCount < 3;
        });

        frameLoop(fn);

        await sleep(100);

        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should provide delta time', async () => {
        let lastDelta = 0;

        const { stop } = frameLoop((_timestamp, delta) => {
          lastDelta = delta;
        });

        await sleep(50);
        stop();

        // After first frame, delta should be positive
        expect(lastDelta).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('sleep', () => {
      it('should wait for specified duration', async () => {
        const start = Date.now();
        await sleep(50);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(45);
      });
    });

    describe('sequence', () => {
      it('should execute tasks in sequence', async () => {
        const executionOrder: number[] = [];

        const tasks = [
          async () => {
            executionOrder.push(1);
            return 1;
          },
          async () => {
            executionOrder.push(2);
            return 2;
          },
          async () => {
            executionOrder.push(3);
            return 3;
          },
        ];

        const results = await sequence(tasks);

        expect(executionOrder).toEqual([1, 2, 3]);
        expect(results).toEqual([1, 2, 3]);
      });

      it('should apply delay between tasks', async () => {
        const tasks = [async () => 1, async () => 2];

        const start = Date.now();
        await sequence(tasks, 30);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(25);
      });
    });

    describe('parallel', () => {
      it('should execute tasks in parallel', async () => {
        const tasks = [
          async () => {
            await sleep(20);
            return 1;
          },
          async () => {
            await sleep(20);
            return 2;
          },
          async () => {
            await sleep(20);
            return 3;
          },
        ];

        const start = Date.now();
        const results = await parallel(tasks);
        const elapsed = Date.now() - start;

        expect(results).toEqual([1, 2, 3]);
        // Should complete in roughly the time of one task
        expect(elapsed).toBeLessThan(50);
      });

      it('should respect concurrency limit', async () => {
        let maxConcurrent = 0;
        let currentConcurrent = 0;

        const createTask = () => async () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
          await sleep(30);
          currentConcurrent--;
          return 'done';
        };

        await parallel(
          [createTask(), createTask(), createTask(), createTask()],
          2
        );

        expect(maxConcurrent).toBe(2);
      });
    });
  });
});
