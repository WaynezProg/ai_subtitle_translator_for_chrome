/**
 * Dependency Injection Utilities
 *
 * Provides a lightweight dependency injection container for better
 * testability, modularity, and loose coupling in the extension.
 */

// =============================================================================
// Types
// =============================================================================

export type Constructor<T = unknown> = new (...args: unknown[]) => T;
export type Factory<T = unknown> = () => T;
export type AsyncFactory<T = unknown> = () => Promise<T>;

export type Provider<T = unknown> =
  | { type: 'class'; value: Constructor<T> }
  | { type: 'factory'; value: Factory<T> }
  | { type: 'asyncFactory'; value: AsyncFactory<T> }
  | { type: 'value'; value: T };

export type Lifetime = 'singleton' | 'transient' | 'scoped';

export interface Registration<T = unknown> {
  token: Token<T>;
  provider: Provider<T>;
  lifetime: Lifetime;
  dependencies?: Token[];
}

export type Token<T = unknown> = string | symbol | Constructor<T>;

export interface ContainerOptions {
  parent?: Container;
  autoRegister?: boolean;
}

// =============================================================================
// Token Utilities
// =============================================================================

/**
 * Create a unique token for dependency injection
 */
export function createToken<T>(name: string): Token<T> {
  return Symbol.for(`di:${name}`);
}

/**
 * Get token name for debugging
 */
export function getTokenName(token: Token): string {
  if (typeof token === 'string') {
    return token;
  }
  if (typeof token === 'symbol') {
    return token.description || token.toString();
  }
  return token.name;
}

// =============================================================================
// Container Class
// =============================================================================

export class Container {
  private registrations = new Map<Token, Registration>();
  private singletons = new Map<Token, unknown>();
  private scopedInstances = new Map<Token, unknown>();
  private resolving = new Set<Token>();
  private parent?: Container;
  private autoRegister: boolean;

  constructor(options: ContainerOptions = {}) {
    this.parent = options.parent;
    this.autoRegister = options.autoRegister ?? false;
  }

  /**
   * Register a class
   */
  registerClass<T>(
    token: Token<T>,
    constructor: Constructor<T>,
    options: { lifetime?: Lifetime; dependencies?: Token[] } = {}
  ): this {
    this.registrations.set(token, {
      token,
      provider: { type: 'class', value: constructor },
      lifetime: options.lifetime ?? 'transient',
      dependencies: options.dependencies,
    });
    return this;
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(
    token: Token<T>,
    factory: Factory<T>,
    options: { lifetime?: Lifetime } = {}
  ): this {
    this.registrations.set(token, {
      token,
      provider: { type: 'factory', value: factory },
      lifetime: options.lifetime ?? 'transient',
    });
    return this;
  }

  /**
   * Register an async factory function
   */
  registerAsyncFactory<T>(
    token: Token<T>,
    factory: AsyncFactory<T>,
    options: { lifetime?: Lifetime } = {}
  ): this {
    this.registrations.set(token, {
      token,
      provider: { type: 'asyncFactory', value: factory },
      lifetime: options.lifetime ?? 'transient',
    });
    return this;
  }

  /**
   * Register a value (constant)
   */
  registerValue<T>(token: Token<T>, value: T): this {
    this.registrations.set(token, {
      token,
      provider: { type: 'value', value },
      lifetime: 'singleton',
    });
    this.singletons.set(token, value);
    return this;
  }

  /**
   * Register a singleton class
   */
  registerSingleton<T>(
    token: Token<T>,
    constructor: Constructor<T>,
    dependencies?: Token[]
  ): this {
    return this.registerClass(token, constructor, {
      lifetime: 'singleton',
      dependencies,
    });
  }

  /**
   * Register a transient class
   */
  registerTransient<T>(
    token: Token<T>,
    constructor: Constructor<T>,
    dependencies?: Token[]
  ): this {
    return this.registerClass(token, constructor, {
      lifetime: 'transient',
      dependencies,
    });
  }

  /**
   * Register a scoped class
   */
  registerScoped<T>(
    token: Token<T>,
    constructor: Constructor<T>,
    dependencies?: Token[]
  ): this {
    return this.registerClass(token, constructor, {
      lifetime: 'scoped',
      dependencies,
    });
  }

  /**
   * Check if a token is registered
   */
  isRegistered(token: Token): boolean {
    return this.registrations.has(token) || (this.parent?.isRegistered(token) ?? false);
  }

  /**
   * Resolve a dependency
   */
  resolve<T>(token: Token<T>): T {
    // Check for circular dependency
    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected for: ${getTokenName(token)}`);
    }

    // Check singleton cache
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    // Check scoped cache
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // Get registration
    const registration = this.getRegistration(token);
    if (!registration) {
      // Auto-register if enabled and token is a constructor
      if (this.autoRegister && typeof token === 'function') {
        this.registerClass(token, token as Constructor<T>);
        return this.resolve(token);
      }
      throw new Error(`No registration found for: ${getTokenName(token)}`);
    }

    // Resolve
    this.resolving.add(token);
    try {
      const instance = this.createInstance<T>(registration);

      // Cache based on lifetime
      if (registration.lifetime === 'singleton') {
        this.singletons.set(token, instance);
      } else if (registration.lifetime === 'scoped') {
        this.scopedInstances.set(token, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  /**
   * Resolve a dependency asynchronously
   */
  async resolveAsync<T>(token: Token<T>): Promise<T> {
    // Check for circular dependency
    if (this.resolving.has(token)) {
      throw new Error(`Circular dependency detected for: ${getTokenName(token)}`);
    }

    // Check singleton cache
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    // Check scoped cache
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // Get registration
    const registration = this.getRegistration(token);
    if (!registration) {
      throw new Error(`No registration found for: ${getTokenName(token)}`);
    }

    // Resolve
    this.resolving.add(token);
    try {
      const instance = await this.createInstanceAsync<T>(registration);

      // Cache based on lifetime
      if (registration.lifetime === 'singleton') {
        this.singletons.set(token, instance);
      } else if (registration.lifetime === 'scoped') {
        this.scopedInstances.set(token, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  /**
   * Try to resolve a dependency, returning undefined if not found
   */
  tryResolve<T>(token: Token<T>): T | undefined {
    try {
      return this.resolve(token);
    } catch {
      return undefined;
    }
  }

  /**
   * Resolve multiple dependencies
   */
  resolveAll<T>(tokens: Token<T>[]): T[] {
    return tokens.map((token) => this.resolve(token));
  }

  /**
   * Create a child container (scope)
   */
  createScope(): Container {
    return new Container({ parent: this });
  }

  /**
   * Clear scoped instances
   */
  clearScope(): void {
    this.scopedInstances.clear();
  }

  /**
   * Unregister a token
   */
  unregister(token: Token): boolean {
    this.singletons.delete(token);
    this.scopedInstances.delete(token);
    return this.registrations.delete(token);
  }

  /**
   * Clear all registrations and instances
   */
  clear(): void {
    this.registrations.clear();
    this.singletons.clear();
    this.scopedInstances.clear();
  }

  /**
   * Get all registered tokens
   */
  getTokens(): Token[] {
    const tokens = new Set<Token>(this.registrations.keys());
    if (this.parent) {
      this.parent.getTokens().forEach((t) => tokens.add(t));
    }
    return Array.from(tokens);
  }

  private getRegistration(token: Token): Registration | undefined {
    return this.registrations.get(token) ?? this.parent?.getRegistration(token);
  }

  private createInstance<T>(registration: Registration<T>): T {
    const { provider, dependencies } = registration;

    switch (provider.type) {
      case 'value':
        return provider.value;

      case 'factory':
        return provider.value();

      case 'asyncFactory':
        throw new Error(
          `Cannot resolve async factory synchronously: ${getTokenName(registration.token)}`
        );

      case 'class': {
        const deps = dependencies?.map((dep) => this.resolve(dep)) ?? [];
        return new provider.value(...deps);
      }

      default:
        throw new Error(`Unknown provider type`);
    }
  }

  private async createInstanceAsync<T>(registration: Registration<T>): Promise<T> {
    const { provider, dependencies } = registration;

    switch (provider.type) {
      case 'value':
        return provider.value;

      case 'factory':
        return provider.value();

      case 'asyncFactory':
        return provider.value();

      case 'class': {
        const deps = dependencies
          ? await Promise.all(dependencies.map((dep) => this.resolveAsync(dep)))
          : [];
        return new provider.value(...deps);
      }

      default:
        throw new Error(`Unknown provider type`);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new container
 */
export function createContainer(options?: ContainerOptions): Container {
  return new Container(options);
}

// =============================================================================
// Global Container
// =============================================================================

let globalContainer: Container | null = null;

/**
 * Get or create the global container
 */
export function getGlobalContainer(): Container {
  if (!globalContainer) {
    globalContainer = createContainer();
  }
  return globalContainer;
}

/**
 * Set the global container
 */
export function setGlobalContainer(container: Container): void {
  globalContainer = container;
}

/**
 * Reset the global container
 */
export function resetGlobalContainer(): void {
  globalContainer = null;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Register a class in the global container
 */
export function register<T>(
  token: Token<T>,
  constructor: Constructor<T>,
  options?: { lifetime?: Lifetime; dependencies?: Token[] }
): void {
  getGlobalContainer().registerClass(token, constructor, options);
}

/**
 * Register a value in the global container
 */
export function registerValue<T>(token: Token<T>, value: T): void {
  getGlobalContainer().registerValue(token, value);
}

/**
 * Register a factory in the global container
 */
export function registerFactory<T>(
  token: Token<T>,
  factory: Factory<T>,
  options?: { lifetime?: Lifetime }
): void {
  getGlobalContainer().registerFactory(token, factory, options);
}

/**
 * Resolve from the global container
 */
export function resolve<T>(token: Token<T>): T {
  return getGlobalContainer().resolve(token);
}

/**
 * Resolve asynchronously from the global container
 */
export function resolveAsync<T>(token: Token<T>): Promise<T> {
  return getGlobalContainer().resolveAsync(token);
}

// =============================================================================
// Service Locator Pattern
// =============================================================================

export interface ServiceLocator {
  get<T>(token: Token<T>): T;
  getAsync<T>(token: Token<T>): Promise<T>;
  has(token: Token): boolean;
}

/**
 * Create a service locator from a container
 */
export function createServiceLocator(container: Container): ServiceLocator {
  return {
    get<T>(token: Token<T>): T {
      return container.resolve(token);
    },
    getAsync<T>(token: Token<T>): Promise<T> {
      return container.resolveAsync(token);
    },
    has(token: Token): boolean {
      return container.isRegistered(token);
    },
  };
}

// =============================================================================
// Module Pattern
// =============================================================================

export interface Module {
  name: string;
  register(container: Container): void;
}

/**
 * Create a module
 */
export function createModule(
  name: string,
  register: (container: Container) => void
): Module {
  return { name, register };
}

/**
 * Load modules into a container
 */
export function loadModules(container: Container, modules: Module[]): void {
  modules.forEach((module) => module.register(container));
}

// =============================================================================
// Injection Helpers
// =============================================================================

/**
 * Create an injectable class wrapper
 */
export function injectable<T>(
  constructor: Constructor<T>,
  dependencies: Token[] = []
): { constructor: Constructor<T>; dependencies: Token[] } {
  return { constructor, dependencies };
}

/**
 * Inject dependencies into an object
 */
export function injectDependencies<T extends object>(
  target: T,
  container: Container,
  injections: { property: keyof T; token: Token }[]
): T {
  for (const { property, token } of injections) {
    (target as Record<keyof T, unknown>)[property] = container.resolve(token);
  }
  return target;
}

// =============================================================================
// Testing Utilities
// =============================================================================

/**
 * Create a mock container for testing
 */
export function createMockContainer(): Container & {
  mock<T>(token: Token<T>, value: T): void;
} {
  const container = createContainer();

  return Object.assign(container, {
    mock<T>(token: Token<T>, value: T): void {
      container.registerValue(token, value);
    },
  });
}

/**
 * Create a test container with mocked dependencies
 */
export function createTestContainer(
  mocks: Array<{ token: Token; value: unknown }>
): Container {
  const container = createContainer();
  mocks.forEach(({ token, value }) => {
    container.registerValue(token, value);
  });
  return container;
}

// =============================================================================
// Decorators (for use with experimental decorators)
// =============================================================================

const injectMetadata = new Map<Constructor, Token[]>();

/**
 * Mark a parameter for injection (stores metadata)
 */
export function Inject(token: Token) {
  return function (
    target: Constructor,
    _propertyKey: string | symbol | undefined,
    parameterIndex: number
  ): void {
    const existing = injectMetadata.get(target) || [];
    existing[parameterIndex] = token;
    injectMetadata.set(target, existing);
  };
}

/**
 * Get injection metadata for a class
 */
export function getInjectMetadata(target: Constructor): Token[] {
  return injectMetadata.get(target) || [];
}

/**
 * Register a class with its inject metadata
 */
export function registerWithMetadata<T>(
  container: Container,
  token: Token<T>,
  constructor: Constructor<T>,
  lifetime: Lifetime = 'transient'
): void {
  const dependencies = getInjectMetadata(constructor);
  container.registerClass(token, constructor, { lifetime, dependencies });
}
