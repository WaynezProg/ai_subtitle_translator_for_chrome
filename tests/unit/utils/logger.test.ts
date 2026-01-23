/**
 * Logger Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  setLogLevel,
  enableModules,
  disableModules,
  resetModuleFilters,
  setLogHandler,
  clearLogHandler,
  enableAllLogs,
  disableAllLogs,
  createTimer,
  loggerConfig,
  type LogEntry,
} from '../../../src/shared/utils/logger';

describe('Logger', () => {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  beforeEach(() => {
    // Mock console methods
    console.log = vi.fn();
    console.info = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();

    // Reset config to defaults
    loggerConfig.minLevel = 'debug';
    loggerConfig.timestamps = false;
    loggerConfig.modulePrefix = true;
    resetModuleFilters();
    clearLogHandler();
  });

  afterEach(() => {
    // Restore console methods
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  describe('createLogger', () => {
    it('should create a logger with all methods', () => {
      const log = createLogger('TestModule');

      expect(log.debug).toBeDefined();
      expect(log.info).toBeDefined();
      expect(log.warn).toBeDefined();
      expect(log.error).toBeDefined();
      expect(log.setLevel).toBeDefined();
    });

    it('should log debug messages', () => {
      const log = createLogger('TestModule');

      log.debug('Debug message');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DEBUG'));
    });

    it('should log info messages', () => {
      const log = createLogger('TestModule');

      log.info('Info message');

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('INFO'));
    });

    it('should log warn messages', () => {
      const log = createLogger('TestModule');

      log.warn('Warning message');

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('WARN'));
    });

    it('should log error messages', () => {
      const log = createLogger('TestModule');

      log.error('Error message');

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ERROR'));
    });

    it('should include module name in output', () => {
      const log = createLogger('MyModule');

      log.info('Test');

      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('MyModule'));
    });

    it('should log data objects', () => {
      const log = createLogger('TestModule');

      log.info('Message', { key: 'value' });

      expect(console.info).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ key: 'value' }));
    });

    it('should log errors with stack trace', () => {
      const log = createLogger('TestModule');
      const error = new Error('Test error');

      log.error('Error occurred', error);

      expect(console.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
          }),
        })
      );
    });
  });

  describe('Log level filtering', () => {
    it('should respect minimum log level', () => {
      setLogLevel('warn');
      const log = createLogger('TestModule');

      log.debug('Debug');
      log.info('Info');
      log.warn('Warning');
      log.error('Error');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should allow setting module-specific level', () => {
      // Reset global to debug first to allow module override
      setLogLevel('debug');
      const log = createLogger('TestModule');

      // Set module level to debug explicitly
      log.setLevel('debug');
      log.debug('Should appear');

      expect(console.log).toHaveBeenCalled();
    });

    it('should disable all logs when level is none', () => {
      disableAllLogs();
      const log = createLogger('TestModule');

      log.debug('Debug');
      log.info('Info');
      log.warn('Warning');
      log.error('Error');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should enable all logs', () => {
      disableAllLogs();
      enableAllLogs();
      const log = createLogger('TestModule');

      log.debug('Debug');

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Module filtering', () => {
    it('should filter by enabled modules', () => {
      enableModules('EnabledModule');

      const enabledLog = createLogger('EnabledModule');
      const disabledLog = createLogger('DisabledModule');

      enabledLog.info('Enabled');
      disabledLog.info('Disabled');

      expect(console.info).toHaveBeenCalledTimes(1);
    });

    it('should filter by disabled modules', () => {
      disableModules('DisabledModule');

      const enabledLog = createLogger('EnabledModule');
      const disabledLog = createLogger('DisabledModule');

      enabledLog.info('Enabled');
      disabledLog.info('Disabled');

      expect(console.info).toHaveBeenCalledTimes(1);
    });

    it('should reset module filters', () => {
      disableModules('TestModule');
      resetModuleFilters();

      const log = createLogger('TestModule');
      log.info('Test');

      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('Custom log handler', () => {
    it('should use custom handler when set', () => {
      const handler = vi.fn();
      setLogHandler(handler);

      const log = createLogger('TestModule');
      log.info('Test message');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          module: 'TestModule',
          message: 'Test message',
        })
      );
      expect(console.info).not.toHaveBeenCalled();
    });

    it('should clear custom handler', () => {
      const handler = vi.fn();
      setLogHandler(handler);
      clearLogHandler();

      const log = createLogger('TestModule');
      log.info('Test');

      expect(handler).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('Data serialization', () => {
    it('should truncate long strings', () => {
      const handler = vi.fn();
      setLogHandler(handler);

      const log = createLogger('TestModule');
      const longString = 'a'.repeat(1000);
      log.info('Test', { long: longString });

      const entry = handler.mock.calls[0][0] as LogEntry;
      expect((entry.data?.long as string).length).toBeLessThan(600);
      expect(entry.data?.long).toContain('[truncated]');
    });

    it('should limit array length', () => {
      const handler = vi.fn();
      setLogHandler(handler);

      const log = createLogger('TestModule');
      const longArray = Array.from({ length: 20 }, (_, i) => i);
      log.info('Test', { arr: longArray });

      const entry = handler.mock.calls[0][0] as LogEntry;
      expect((entry.data?.arr as number[]).length).toBe(10);
    });

    it('should handle circular references gracefully', () => {
      const log = createLogger('TestModule');
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj; // Circular reference

      // Should not throw
      expect(() => log.info('Test', { obj })).not.toThrow();
    });
  });

  describe('createTimer', () => {
    it('should measure operation duration', async () => {
      const handler = vi.fn();
      setLogHandler(handler);

      const timer = createTimer('TestModule', 'TestOperation');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      timer();

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          message: 'TestOperation completed',
          data: expect.objectContaining({
            durationMs: expect.any(String),
          }),
        })
      );
    });
  });
});
