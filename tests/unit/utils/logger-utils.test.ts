/**
 * Tests for Logger Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Log level utilities
  shouldLog,
  parseLogLevel,
  // Formatters
  defaultFormatter,
  jsonFormatter,
  compactFormatter,
  prettyFormatter,
  // Transports
  createConsoleTransport,
  createMemoryTransport,
  createCallbackTransport,
  createFilterTransport,
  createBatchTransport,
  // Logger class
  Logger,
  createLogger,
  createSilentLogger,
  createDebugLogger,
  // Global logger
  getGlobalLogger,
  setGlobalLogger,
  configureGlobalLogger,
  log,
  // Utilities
  redactSensitiveData,
  truncateLogData,
  createScopedLogger,
  type LogEntry,
  type LogLevel,
} from '@shared/utils/logger-utils';

describe('Logger Utils', () => {
  describe('shouldLog', () => {
    it('should return true when message level >= config level', () => {
      expect(shouldLog('debug', 'info')).toBe(true);
      expect(shouldLog('debug', 'error')).toBe(true);
      expect(shouldLog('info', 'info')).toBe(true);
      expect(shouldLog('warn', 'error')).toBe(true);
    });

    it('should return false when message level < config level', () => {
      expect(shouldLog('info', 'debug')).toBe(false);
      expect(shouldLog('error', 'info')).toBe(false);
      expect(shouldLog('warn', 'debug')).toBe(false);
    });

    it('should handle silent level', () => {
      expect(shouldLog('silent', 'fatal')).toBe(false);
      expect(shouldLog('silent', 'error')).toBe(false);
    });
  });

  describe('parseLogLevel', () => {
    it('should parse valid log levels', () => {
      expect(parseLogLevel('debug')).toBe('debug');
      expect(parseLogLevel('INFO')).toBe('info');
      expect(parseLogLevel('WARN')).toBe('warn');
      expect(parseLogLevel('Error')).toBe('error');
    });

    it('should default to info for invalid levels', () => {
      expect(parseLogLevel('invalid')).toBe('info');
      expect(parseLogLevel('')).toBe('info');
      expect(parseLogLevel('verbose')).toBe('info');
    });
  });

  describe('Formatters', () => {
    const baseEntry: LogEntry = {
      level: 'info',
      message: 'Test message',
      timestamp: new Date('2024-01-15T10:30:00Z').getTime(),
    };

    describe('defaultFormatter', () => {
      it('should format basic entry', () => {
        const result = defaultFormatter(baseEntry);
        expect(result).toContain('[INFO]');
        expect(result).toContain('Test message');
      });

      it('should include context', () => {
        const result = defaultFormatter({ ...baseEntry, context: 'MyModule' });
        expect(result).toContain('[MyModule]');
      });

      it('should include data', () => {
        const result = defaultFormatter({ ...baseEntry, data: { key: 'value' } });
        expect(result).toContain('"key":"value"');
      });

      it('should include duration', () => {
        const result = defaultFormatter({ ...baseEntry, duration: 123.456 });
        expect(result).toContain('(123.46ms)');
      });
    });

    describe('jsonFormatter', () => {
      it('should format as JSON', () => {
        const result = jsonFormatter(baseEntry);
        const parsed = JSON.parse(result);

        expect(parsed.level).toBe('info');
        expect(parsed.message).toBe('Test message');
      });

      it('should include error details', () => {
        const error = new Error('Test error');
        const result = jsonFormatter({ ...baseEntry, error });
        const parsed = JSON.parse(result);

        expect(parsed.error.name).toBe('Error');
        expect(parsed.error.message).toBe('Test error');
      });
    });

    describe('compactFormatter', () => {
      it('should format compactly', () => {
        const result = compactFormatter(baseEntry);
        expect(result).toMatch(/^I \d+:\d+:\d+ .* Test message$/);
      });
    });

    describe('prettyFormatter', () => {
      it('should format with colors', () => {
        const result = prettyFormatter(baseEntry);
        expect(result).toContain('\x1b['); // Contains color codes
        expect(result).toContain('INFO');
        expect(result).toContain('Test message');
      });
    });
  });

  describe('Transports', () => {
    describe('createConsoleTransport', () => {
      beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('should log to console.info for info level', () => {
        const transport = createConsoleTransport(false);
        transport({
          level: 'info',
          message: 'Test',
          timestamp: Date.now(),
        });

        expect(console.info).toHaveBeenCalled();
      });

      it('should log to console.warn for warn level', () => {
        const transport = createConsoleTransport(false);
        transport({
          level: 'warn',
          message: 'Warning',
          timestamp: Date.now(),
        });

        expect(console.warn).toHaveBeenCalled();
      });

      it('should log to console.error for error level', () => {
        const transport = createConsoleTransport(false);
        transport({
          level: 'error',
          message: 'Error',
          timestamp: Date.now(),
        });

        expect(console.error).toHaveBeenCalled();
      });
    });

    describe('createMemoryTransport', () => {
      it('should store entries in memory', () => {
        const transport = createMemoryTransport();

        transport({ level: 'info', message: 'Test 1', timestamp: Date.now() });
        transport({ level: 'info', message: 'Test 2', timestamp: Date.now() });

        expect(transport.entries).toHaveLength(2);
        expect(transport.entries[0].message).toBe('Test 1');
      });

      it('should respect max entries', () => {
        const transport = createMemoryTransport(3);

        for (let i = 0; i < 5; i++) {
          transport({ level: 'info', message: `Test ${i}`, timestamp: Date.now() });
        }

        expect(transport.entries).toHaveLength(3);
        expect(transport.entries[0].message).toBe('Test 2');
      });

      it('should clear entries', () => {
        const transport = createMemoryTransport();

        transport({ level: 'info', message: 'Test', timestamp: Date.now() });
        transport.clear();

        expect(transport.entries).toHaveLength(0);
      });
    });

    describe('createCallbackTransport', () => {
      it('should call callback with entry', () => {
        const callback = vi.fn();
        const transport = createCallbackTransport(callback);
        const entry: LogEntry = { level: 'info', message: 'Test', timestamp: Date.now() };

        transport(entry);

        expect(callback).toHaveBeenCalledWith(entry);
      });
    });

    describe('createFilterTransport', () => {
      it('should filter entries', () => {
        const inner = vi.fn();
        const transport = createFilterTransport(
          inner,
          (entry) => entry.level === 'error'
        );

        transport({ level: 'info', message: 'Info', timestamp: Date.now() });
        transport({ level: 'error', message: 'Error', timestamp: Date.now() });

        expect(inner).toHaveBeenCalledTimes(1);
        expect(inner).toHaveBeenCalledWith(
          expect.objectContaining({ level: 'error' })
        );
      });
    });

    describe('createBatchTransport', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should batch entries', () => {
        const onFlush = vi.fn();
        const transport = createBatchTransport(onFlush, {
          maxSize: 100,
          flushInterval: 1000,
        });

        transport({ level: 'info', message: 'Test 1', timestamp: Date.now() });
        transport({ level: 'info', message: 'Test 2', timestamp: Date.now() });

        expect(onFlush).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);

        expect(onFlush).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ message: 'Test 1' }),
            expect.objectContaining({ message: 'Test 2' }),
          ])
        );
      });

      it('should flush when max size reached', () => {
        const onFlush = vi.fn();
        const transport = createBatchTransport(onFlush, { maxSize: 2 });

        transport({ level: 'info', message: 'Test 1', timestamp: Date.now() });
        transport({ level: 'info', message: 'Test 2', timestamp: Date.now() });

        expect(onFlush).toHaveBeenCalled();
      });

      it('should support manual flush', () => {
        const onFlush = vi.fn();
        const transport = createBatchTransport(onFlush, { maxSize: 100 });

        transport({ level: 'info', message: 'Test', timestamp: Date.now() });
        transport.flush();

        expect(onFlush).toHaveBeenCalled();
      });
    });
  });

  describe('Logger class', () => {
    let logger: Logger;
    let transport: ReturnType<typeof createMemoryTransport>;

    beforeEach(() => {
      transport = createMemoryTransport();
      logger = new Logger({
        level: 'trace',
        transports: [transport],
      });
    });

    describe('log methods', () => {
      it('should log trace messages', () => {
        logger.trace('Trace message');
        expect(transport.entries[0].level).toBe('trace');
      });

      it('should log debug messages', () => {
        logger.debug('Debug message');
        expect(transport.entries[0].level).toBe('debug');
      });

      it('should log info messages', () => {
        logger.info('Info message');
        expect(transport.entries[0].level).toBe('info');
      });

      it('should log warn messages', () => {
        logger.warn('Warn message');
        expect(transport.entries[0].level).toBe('warn');
      });

      it('should log error messages', () => {
        logger.error('Error message');
        expect(transport.entries[0].level).toBe('error');
      });

      it('should log error with Error object', () => {
        const error = new Error('Test error');
        logger.error('Error occurred', error);

        expect(transport.entries[0].error).toBe(error);
      });

      it('should log fatal messages', () => {
        logger.fatal('Fatal error');
        expect(transport.entries[0].level).toBe('fatal');
      });

      it('should include data in log', () => {
        logger.info('Message', { key: 'value' });
        expect(transport.entries[0].data).toEqual({ key: 'value' });
      });
    });

    describe('level filtering', () => {
      it('should respect log level', () => {
        const strictLogger = new Logger({
          level: 'error',
          transports: [transport],
        });

        strictLogger.debug('Debug');
        strictLogger.info('Info');
        strictLogger.warn('Warn');
        strictLogger.error('Error');

        expect(transport.entries).toHaveLength(1);
        expect(transport.entries[0].level).toBe('error');
      });
    });

    describe('enabled flag', () => {
      it('should not log when disabled', () => {
        logger.setEnabled(false);
        logger.info('Should not appear');

        expect(transport.entries).toHaveLength(0);
      });

      it('should resume logging when re-enabled', () => {
        logger.setEnabled(false);
        logger.info('Hidden');
        logger.setEnabled(true);
        logger.info('Visible');

        expect(transport.entries).toHaveLength(1);
        expect(transport.entries[0].message).toBe('Visible');
      });
    });

    describe('child logger', () => {
      it('should create child with context', () => {
        const parent = new Logger({
          level: 'debug',
          context: 'Parent',
          transports: [transport],
        });

        const child = parent.child('Child');
        child.info('Message');

        expect(transport.entries[0].context).toBe('Parent:Child');
      });

      it('should inherit parent config', () => {
        const parent = new Logger({
          level: 'error',
          transports: [transport],
        });

        const child = parent.child('Child');
        child.debug('Debug');
        child.error('Error');

        expect(transport.entries).toHaveLength(1);
      });
    });

    describe('timing', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should measure time with time/timeEnd', () => {
        logger.time('operation');
        vi.advanceTimersByTime(100);
        const duration = logger.timeEnd('operation');

        expect(duration).toBeGreaterThanOrEqual(100);
        expect(transport.entries[0].duration).toBeDefined();
      });

      it('should warn for non-existent timer', () => {
        logger.timeEnd('nonexistent');
        expect(transport.entries[0].level).toBe('warn');
      });
    });

    describe('measure', () => {
      it('should measure async function', async () => {
        vi.useRealTimers();

        const result = await logger.measure('async-op', async () => {
          await new Promise((r) => setTimeout(r, 10));
          return 'done';
        });

        expect(result).toBe('done');
        expect(transport.entries[0].duration).toBeGreaterThanOrEqual(10);

        vi.useFakeTimers();
      });

      it('should log error on failure', async () => {
        vi.useRealTimers();

        await expect(
          logger.measure('failing-op', async () => {
            throw new Error('Fail');
          })
        ).rejects.toThrow('Fail');

        expect(transport.entries[0].level).toBe('error');
        expect(transport.entries[0].data?.success).toBe(false);

        vi.useFakeTimers();
      });
    });

    describe('measureSync', () => {
      it('should measure sync function', () => {
        const result = logger.measureSync('sync-op', () => {
          let sum = 0;
          for (let i = 0; i < 1000; i++) sum += i;
          return sum;
        });

        expect(result).toBe(499500);
        expect(transport.entries[0].duration).toBeDefined();
      });
    });

    describe('addTransport', () => {
      it('should add transport dynamically', () => {
        const newTransport = vi.fn();
        const remove = logger.addTransport(newTransport);

        logger.info('Test');

        expect(newTransport).toHaveBeenCalled();

        remove();
        logger.info('After remove');

        expect(newTransport).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Factory functions', () => {
    describe('createLogger', () => {
      it('should create logger with config', () => {
        const logger = createLogger({ level: 'warn' });
        expect(logger).toBeInstanceOf(Logger);
      });
    });

    describe('createSilentLogger', () => {
      it('should create silent logger', () => {
        const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
        const logger = createSilentLogger();

        logger.info('Should not appear');

        expect(consoleInfo).not.toHaveBeenCalled();
        consoleInfo.mockRestore();
      });
    });

    describe('createDebugLogger', () => {
      it('should create debug-level logger', () => {
        const transport = createMemoryTransport();
        const logger = createDebugLogger('Test');
        logger.addTransport(transport);

        logger.debug('Debug message');

        expect(transport.entries).toHaveLength(1);
      });
    });
  });

  describe('Global logger', () => {
    afterEach(() => {
      setGlobalLogger(createLogger());
    });

    it('should provide global logger', () => {
      const logger = getGlobalLogger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should allow setting global logger', () => {
      const transport = createMemoryTransport();
      const custom = createLogger({ transports: [transport] });

      setGlobalLogger(custom);
      getGlobalLogger().info('Test');

      expect(transport.entries).toHaveLength(1);
    });

    it('should configure global logger', () => {
      const transport = createMemoryTransport();
      configureGlobalLogger({ level: 'error', transports: [transport] });

      getGlobalLogger().info('Should not appear');
      getGlobalLogger().error('Should appear');

      expect(transport.entries).toHaveLength(1);
    });

    describe('log convenience object', () => {
      it('should provide shorthand methods', () => {
        const transport = createMemoryTransport();
        setGlobalLogger(createLogger({ transports: [transport] }));

        log.info('Info');
        log.warn('Warn');
        log.error('Error');

        expect(transport.entries).toHaveLength(3);
      });
    });
  });

  describe('Utilities', () => {
    describe('redactSensitiveData', () => {
      it('should redact sensitive keys', () => {
        const data = {
          username: 'john',
          password: 'secret123',
          apiKey: 'key-abc-123',
        };

        const redacted = redactSensitiveData(data);

        expect(redacted.username).toBe('john');
        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.apiKey).toBe('[REDACTED]');
      });

      it('should handle nested objects', () => {
        const data = {
          user: {
            name: 'john',
            credentials: {
              password: 'secret',
            },
          },
        };

        const redacted = redactSensitiveData(data);

        expect((redacted.user as Record<string, unknown>).name).toBe('john');
        expect(
          ((redacted.user as Record<string, unknown>).credentials as Record<string, unknown>).password
        ).toBe('[REDACTED]');
      });

      it('should use custom sensitive keys', () => {
        const data = { customSecret: 'value' };
        const redacted = redactSensitiveData(data, ['customSecret']);

        expect(redacted.customSecret).toBe('[REDACTED]');
      });
    });

    describe('truncateLogData', () => {
      it('should truncate long strings', () => {
        const data = { text: 'a'.repeat(500) };
        const truncated = truncateLogData(data, 100);

        expect((truncated.text as string).length).toBeLessThan(150);
        expect(truncated.text).toContain('... (500 chars)');
      });

      it('should truncate long arrays', () => {
        const data = { items: Array.from({ length: 50 }, (_, i) => i) };
        const truncated = truncateLogData(data);

        expect((truncated.items as unknown[]).length).toBe(11); // 10 + message
        expect((truncated.items as unknown[])[10]).toBe('... (50 items)');
      });

      it('should handle nested objects', () => {
        const data = {
          nested: {
            longText: 'x'.repeat(300),
          },
        };

        const truncated = truncateLogData(data, 50);

        expect(
          ((truncated.nested as Record<string, unknown>).longText as string).length
        ).toBeLessThan(100);
      });
    });

    describe('createScopedLogger', () => {
      it('should prefix all messages with scope', () => {
        const transport = createMemoryTransport();
        const logger = createLogger({ transports: [transport] });
        const scoped = createScopedLogger(logger, 'MyScope');

        scoped.info('Message');
        scoped.error('Error');

        expect(transport.entries[0].message).toBe('[MyScope] Message');
        expect(transport.entries[1].message).toBe('[MyScope] Error');
      });
    });
  });
});
