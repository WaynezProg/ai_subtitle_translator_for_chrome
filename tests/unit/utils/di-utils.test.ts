/**
 * Tests for Dependency Injection Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Container
  Container,
  createContainer,
  // Token utilities
  createToken,
  getTokenName,
  // Global container
  getGlobalContainer,
  setGlobalContainer,
  resetGlobalContainer,
  register,
  registerValue,
  registerFactory,
  resolve,
  resolveAsync,
  // Service locator
  createServiceLocator,
  // Module pattern
  createModule,
  loadModules,
  // Injection helpers
  injectable,
  injectDependencies,
  // Testing utilities
  createMockContainer,
  createTestContainer,
  // Decorators
  Inject,
  getInjectMetadata,
  registerWithMetadata,
  type Token,
} from '@shared/utils/di-utils';

describe('DI Utils', () => {
  describe('Token utilities', () => {
    describe('createToken', () => {
      it('should create a unique symbol token', () => {
        const token1 = createToken<string>('myService');
        const token2 = createToken<string>('myService');

        expect(typeof token1).toBe('symbol');
        // Same name creates same symbol via Symbol.for
        expect(token1).toBe(token2);
      });

      it('should create different tokens for different names', () => {
        const token1 = createToken('service1');
        const token2 = createToken('service2');

        expect(token1).not.toBe(token2);
      });
    });

    describe('getTokenName', () => {
      it('should return string token as-is', () => {
        expect(getTokenName('myToken')).toBe('myToken');
      });

      it('should return symbol description', () => {
        const token = createToken('myService');
        expect(getTokenName(token)).toContain('myService');
      });

      it('should return class name', () => {
        class MyService {}
        expect(getTokenName(MyService)).toBe('MyService');
      });
    });
  });

  describe('Container', () => {
    let container: Container;

    beforeEach(() => {
      container = createContainer();
    });

    describe('registerClass', () => {
      it('should register a class', () => {
        class MyService {}
        container.registerClass('myService', MyService);

        expect(container.isRegistered('myService')).toBe(true);
      });

      it('should resolve a registered class', () => {
        class MyService {
          getValue() {
            return 'test';
          }
        }

        container.registerClass('myService', MyService);
        const instance = container.resolve<MyService>('myService');

        expect(instance).toBeInstanceOf(MyService);
        expect(instance.getValue()).toBe('test');
      });

      it('should resolve with dependencies', () => {
        class Logger {
          log(msg: string) {
            return msg;
          }
        }

        class Service {
          constructor(public logger: Logger) {}
        }

        container.registerClass('logger', Logger);
        container.registerClass('service', Service, {
          dependencies: ['logger'],
        });

        const service = container.resolve<Service>('service');

        expect(service.logger).toBeInstanceOf(Logger);
      });
    });

    describe('registerFactory', () => {
      it('should register and resolve a factory', () => {
        const factory = () => ({ id: Math.random() });
        container.registerFactory('random', factory);

        const instance = container.resolve<{ id: number }>('random');

        expect(typeof instance.id).toBe('number');
      });

      it('should call factory each time for transient', () => {
        let callCount = 0;
        const factory = () => ({ count: ++callCount });

        container.registerFactory('counter', factory, { lifetime: 'transient' });

        const a = container.resolve<{ count: number }>('counter');
        const b = container.resolve<{ count: number }>('counter');

        expect(a.count).toBe(1);
        expect(b.count).toBe(2);
      });
    });

    describe('registerAsyncFactory', () => {
      it('should register an async factory', async () => {
        const asyncFactory = async () => {
          await new Promise((r) => setTimeout(r, 1));
          return { async: true };
        };

        container.registerAsyncFactory('asyncService', asyncFactory);

        const instance = await container.resolveAsync<{ async: boolean }>('asyncService');

        expect(instance.async).toBe(true);
      });

      it('should throw when resolving async factory synchronously', () => {
        const asyncFactory = async () => ({ value: 1 });
        container.registerAsyncFactory('asyncService', asyncFactory);

        expect(() => container.resolve('asyncService')).toThrow();
      });
    });

    describe('registerValue', () => {
      it('should register and resolve a value', () => {
        const config = { apiUrl: 'https://api.example.com' };
        container.registerValue('config', config);

        const resolved = container.resolve<typeof config>('config');

        expect(resolved).toBe(config);
      });

      it('should always return the same value', () => {
        container.registerValue('constant', 42);

        const a = container.resolve('constant');
        const b = container.resolve('constant');

        expect(a).toBe(b);
      });
    });

    describe('lifetimes', () => {
      describe('singleton', () => {
        it('should return the same instance', () => {
          class Service {
            id = Math.random();
          }

          container.registerSingleton('service', Service);

          const a = container.resolve<Service>('service');
          const b = container.resolve<Service>('service');

          expect(a).toBe(b);
          expect(a.id).toBe(b.id);
        });
      });

      describe('transient', () => {
        it('should return new instance each time', () => {
          class Service {
            id = Math.random();
          }

          container.registerTransient('service', Service);

          const a = container.resolve<Service>('service');
          const b = container.resolve<Service>('service');

          expect(a).not.toBe(b);
          expect(a.id).not.toBe(b.id);
        });
      });

      describe('scoped', () => {
        it('should return same instance within scope', () => {
          class Service {
            id = Math.random();
          }

          container.registerScoped('service', Service);
          const scope = container.createScope();

          const a = scope.resolve<Service>('service');
          const b = scope.resolve<Service>('service');

          expect(a).toBe(b);
        });

        it('should return different instances in different scopes', () => {
          class Service {
            id = Math.random();
          }

          container.registerScoped('service', Service);
          const scope1 = container.createScope();
          const scope2 = container.createScope();

          const a = scope1.resolve<Service>('service');
          const b = scope2.resolve<Service>('service');

          expect(a).not.toBe(b);
        });

        it('should clear scope', () => {
          class Service {
            id = Math.random();
          }

          container.registerScoped('service', Service);
          const scope = container.createScope();

          const a = scope.resolve<Service>('service');
          scope.clearScope();
          const b = scope.resolve<Service>('service');

          expect(a).not.toBe(b);
        });
      });
    });

    describe('circular dependency detection', () => {
      it('should detect circular dependencies', () => {
        class A {
          constructor(public b: B) {}
        }
        class B {
          constructor(public a: A) {}
        }

        container.registerClass('a', A, { dependencies: ['b'] });
        container.registerClass('b', B, { dependencies: ['a'] });

        expect(() => container.resolve('a')).toThrow(/[Cc]ircular/);
      });
    });

    describe('tryResolve', () => {
      it('should return undefined for unregistered token', () => {
        const result = container.tryResolve('nonexistent');
        expect(result).toBeUndefined();
      });

      it('should return instance for registered token', () => {
        container.registerValue('exists', 'value');
        const result = container.tryResolve('exists');
        expect(result).toBe('value');
      });
    });

    describe('resolveAll', () => {
      it('should resolve multiple tokens', () => {
        container.registerValue('a', 1);
        container.registerValue('b', 2);
        container.registerValue('c', 3);

        const results = container.resolveAll<number>(['a', 'b', 'c']);

        expect(results).toEqual([1, 2, 3]);
      });
    });

    describe('parent container', () => {
      it('should resolve from parent if not in child', () => {
        const parent = createContainer();
        const child = createContainer({ parent });

        parent.registerValue('fromParent', 'parentValue');

        expect(child.resolve('fromParent')).toBe('parentValue');
      });

      it('should override parent registration in child', () => {
        const parent = createContainer();
        const child = createContainer({ parent });

        parent.registerValue('shared', 'parent');
        child.registerValue('shared', 'child');

        expect(child.resolve('shared')).toBe('child');
        expect(parent.resolve('shared')).toBe('parent');
      });

      it('should check parent for isRegistered', () => {
        const parent = createContainer();
        const child = createContainer({ parent });

        parent.registerValue('inParent', true);

        expect(child.isRegistered('inParent')).toBe(true);
      });
    });

    describe('auto-register', () => {
      it('should auto-register classes when enabled', () => {
        const autoContainer = createContainer({ autoRegister: true });

        class AutoService {
          getValue() {
            return 'auto';
          }
        }

        const instance = autoContainer.resolve<AutoService>(AutoService);

        expect(instance).toBeInstanceOf(AutoService);
        expect(instance.getValue()).toBe('auto');
      });
    });

    describe('unregister', () => {
      it('should unregister a token', () => {
        container.registerValue('temp', 'value');
        expect(container.isRegistered('temp')).toBe(true);

        container.unregister('temp');
        expect(container.isRegistered('temp')).toBe(false);
      });
    });

    describe('clear', () => {
      it('should clear all registrations', () => {
        container.registerValue('a', 1);
        container.registerValue('b', 2);

        container.clear();

        expect(container.getTokens()).toHaveLength(0);
      });
    });

    describe('getTokens', () => {
      it('should return all registered tokens', () => {
        container.registerValue('a', 1);
        container.registerValue('b', 2);

        const tokens = container.getTokens();

        expect(tokens).toContain('a');
        expect(tokens).toContain('b');
      });

      it('should include parent tokens', () => {
        const parent = createContainer();
        const child = createContainer({ parent });

        parent.registerValue('parentToken', 1);
        child.registerValue('childToken', 2);

        const tokens = child.getTokens();

        expect(tokens).toContain('parentToken');
        expect(tokens).toContain('childToken');
      });
    });
  });

  describe('Global container', () => {
    afterEach(() => {
      resetGlobalContainer();
    });

    it('should get global container', () => {
      const container = getGlobalContainer();
      expect(container).toBeInstanceOf(Container);
    });

    it('should return same global container', () => {
      const a = getGlobalContainer();
      const b = getGlobalContainer();
      expect(a).toBe(b);
    });

    it('should set global container', () => {
      const custom = createContainer();
      setGlobalContainer(custom);
      expect(getGlobalContainer()).toBe(custom);
    });

    it('should reset global container', () => {
      const first = getGlobalContainer();
      resetGlobalContainer();
      const second = getGlobalContainer();
      expect(first).not.toBe(second);
    });

    describe('convenience functions', () => {
      it('should register and resolve', () => {
        class Service {}
        register('service', Service);

        const instance = resolve('service');
        expect(instance).toBeInstanceOf(Service);
      });

      it('should register value', () => {
        registerValue('config', { key: 'value' });

        const config = resolve<{ key: string }>('config');
        expect(config.key).toBe('value');
      });

      it('should register factory', () => {
        registerFactory('factory', () => ({ created: true }));

        const instance = resolve<{ created: boolean }>('factory');
        expect(instance.created).toBe(true);
      });

      it('should resolve async', async () => {
        const container = getGlobalContainer();
        container.registerAsyncFactory('async', async () => ({ async: true }));

        const instance = await resolveAsync<{ async: boolean }>('async');
        expect(instance.async).toBe(true);
      });
    });
  });

  describe('Service locator', () => {
    it('should create service locator from container', () => {
      const container = createContainer();
      container.registerValue('service', { name: 'test' });

      const locator = createServiceLocator(container);

      expect(locator.get<{ name: string }>('service').name).toBe('test');
    });

    it('should check if service exists', () => {
      const container = createContainer();
      container.registerValue('exists', true);

      const locator = createServiceLocator(container);

      expect(locator.has('exists')).toBe(true);
      expect(locator.has('missing')).toBe(false);
    });

    it('should get async', async () => {
      const container = createContainer();
      container.registerAsyncFactory('async', async () => 'asyncValue');

      const locator = createServiceLocator(container);
      const value = await locator.getAsync('async');

      expect(value).toBe('asyncValue');
    });
  });

  describe('Module pattern', () => {
    it('should create a module', () => {
      const module = createModule('testModule', (container) => {
        container.registerValue('fromModule', 'moduleValue');
      });

      expect(module.name).toBe('testModule');
    });

    it('should load modules into container', () => {
      const container = createContainer();

      const moduleA = createModule('moduleA', (c) => {
        c.registerValue('a', 1);
      });

      const moduleB = createModule('moduleB', (c) => {
        c.registerValue('b', 2);
      });

      loadModules(container, [moduleA, moduleB]);

      expect(container.resolve('a')).toBe(1);
      expect(container.resolve('b')).toBe(2);
    });
  });

  describe('Injection helpers', () => {
    describe('injectable', () => {
      it('should create injectable metadata', () => {
        class Logger {}
        class Service {}

        const result = injectable(Service, ['logger']);

        expect(result.constructor).toBe(Service);
        expect(result.dependencies).toEqual(['logger']);
      });
    });

    describe('injectDependencies', () => {
      it('should inject dependencies into object', () => {
        const container = createContainer();
        container.registerValue('config', { url: 'test' });
        container.registerValue('logger', { log: () => {} });

        const target = { config: null as unknown, logger: null as unknown };

        injectDependencies(target, container, [
          { property: 'config', token: 'config' },
          { property: 'logger', token: 'logger' },
        ]);

        expect(target.config).toEqual({ url: 'test' });
        expect(target.logger).toBeDefined();
      });
    });
  });

  describe('Testing utilities', () => {
    describe('createMockContainer', () => {
      it('should create container with mock method', () => {
        const mockContainer = createMockContainer();

        mockContainer.mock('service', { mocked: true });

        expect(mockContainer.resolve<{ mocked: boolean }>('service').mocked).toBe(
          true
        );
      });
    });

    describe('createTestContainer', () => {
      it('should create container with mocked values', () => {
        const container = createTestContainer([
          { token: 'config', value: { env: 'test' } },
          { token: 'logger', value: { log: vi.fn() } },
        ]);

        expect(container.resolve<{ env: string }>('config').env).toBe('test');
        expect(container.isRegistered('logger')).toBe(true);
      });
    });
  });

  describe('Decorator utilities', () => {
    describe('Inject', () => {
      it('should store injection metadata using functional approach', () => {
        const LoggerToken = createToken('Logger');
        const ConfigToken = createToken('Config');

        class Service {
          constructor(
            public logger: unknown,
            public config: unknown
          ) {}
        }

        // Use functional approach to set metadata instead of decorators
        Inject(LoggerToken)(Service, undefined as unknown as string | symbol, 0);
        Inject(ConfigToken)(Service, undefined as unknown as string | symbol, 1);

        const metadata = getInjectMetadata(Service);

        expect(metadata[0]).toBe(LoggerToken);
        expect(metadata[1]).toBe(ConfigToken);
      });
    });

    describe('registerWithMetadata', () => {
      it('should register class with inject metadata', () => {
        const container = createContainer();
        const LoggerToken = createToken('Logger');

        class Logger {
          log() {}
        }

        class Service {
          constructor(public logger: Logger) {}
        }

        // Use functional approach to set metadata
        Inject(LoggerToken)(Service, undefined as unknown as string | symbol, 0);

        container.registerValue(LoggerToken, new Logger());
        registerWithMetadata(container, 'service', Service);

        const service = container.resolve<Service>('service');
        expect(service.logger).toBeInstanceOf(Logger);
      });
    });
  });
});
