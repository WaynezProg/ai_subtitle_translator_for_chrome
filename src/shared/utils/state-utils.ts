/**
 * State Management Utilities
 *
 * Provides reactive state management, stores, computed values,
 * and state synchronization utilities for the extension.
 */

// =============================================================================
// Types
// =============================================================================

export type StateListener<T> = (state: T, prevState: T) => void;
export type Selector<T, R> = (state: T) => R;
export type Reducer<T, A> = (state: T, action: A) => T;
export type Unsubscribe = () => void;

// =============================================================================
// Reactive State (Signal-like pattern)
// =============================================================================

export interface ReactiveState<T> {
  get(): T;
  set(value: T | ((prev: T) => T)): void;
  subscribe(listener: StateListener<T>): Unsubscribe;
  readonly value: T;
}

/**
 * Create a reactive state value
 */
export function createState<T>(initialValue: T): ReactiveState<T> {
  let value = initialValue;
  const listeners = new Set<StateListener<T>>();

  const notify = (prevValue: T) => {
    listeners.forEach((listener) => listener(value, prevValue));
  };

  return {
    get(): T {
      return value;
    },

    set(newValue: T | ((prev: T) => T)): void {
      const prevValue = value;
      value = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(value)
        : newValue;

      if (!Object.is(value, prevValue)) {
        notify(prevValue);
      }
    },

    subscribe(listener: StateListener<T>): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get value(): T {
      return value;
    },
  };
}

// =============================================================================
// Computed State
// =============================================================================

export interface ComputedState<T> {
  get(): T;
  subscribe(listener: StateListener<T>): Unsubscribe;
  readonly value: T;
}

/**
 * Create a computed state derived from other reactive states
 */
export function createComputed<T, R>(
  dependencies: ReactiveState<T>[],
  compute: (...values: T[]) => R
): ComputedState<R> {
  const listeners = new Set<StateListener<R>>();
  let cachedValue: R = compute(...dependencies.map(d => d.get()));

  const recompute = () => {
    const prevValue = cachedValue;
    cachedValue = compute(...dependencies.map(d => d.get()));
    if (!Object.is(cachedValue, prevValue)) {
      listeners.forEach((listener) => listener(cachedValue, prevValue));
    }
  };

  // Subscribe to all dependencies
  dependencies.forEach(dep => dep.subscribe(recompute));

  return {
    get(): R {
      return cachedValue;
    },

    subscribe(listener: StateListener<R>): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get value(): R {
      return cachedValue;
    },
  };
}

// =============================================================================
// Store (Redux-like pattern)
// =============================================================================

export interface Store<T, A = unknown> {
  getState(): T;
  dispatch(action: A): void;
  subscribe(listener: StateListener<T>): Unsubscribe;
  select<R>(selector: Selector<T, R>): R;
  subscribeToSelector<R>(
    selector: Selector<T, R>,
    listener: StateListener<R>
  ): Unsubscribe;
}

export interface StoreOptions<T> {
  middleware?: Middleware<T>[];
  devTools?: boolean;
}

export type Middleware<T> = (
  store: { getState: () => T; dispatch: (action: unknown) => void }
) => (next: (action: unknown) => void) => (action: unknown) => void;

/**
 * Create a Redux-like store
 */
export function createStore<T, A = { type: string }>(
  reducer: Reducer<T, A>,
  initialState: T,
  options: StoreOptions<T> = {}
): Store<T, A> {
  let state = initialState;
  const listeners = new Set<StateListener<T>>();
  const selectorListeners = new Map<Selector<T, unknown>, Set<StateListener<unknown>>>();

  const getState = () => state;

  let dispatch = (action: A) => {
    const prevState = state;
    state = reducer(state, action);

    if (state !== prevState) {
      listeners.forEach((listener) => listener(state, prevState));

      selectorListeners.forEach((selectorListenerSet, selector) => {
        const prevValue = selector(prevState);
        const newValue = selector(state);
        if (!Object.is(prevValue, newValue)) {
          selectorListenerSet.forEach((listener) => listener(newValue, prevValue));
        }
      });
    }
  };

  // Apply middleware
  if (options.middleware) {
    const middlewareAPI = { getState, dispatch: (action: A) => dispatch(action) };
    const chain = options.middleware.map((m) => m(middlewareAPI as { getState: () => T; dispatch: (action: unknown) => void }));
    dispatch = chain.reduceRight(
      (next, middleware) => middleware(next as (action: unknown) => void),
      dispatch as (action: unknown) => void
    ) as (action: A) => void;
  }

  return {
    getState,
    dispatch,

    subscribe(listener: StateListener<T>): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    select<R>(selector: Selector<T, R>): R {
      return selector(state);
    },

    subscribeToSelector<R>(
      selector: Selector<T, R>,
      listener: StateListener<R>
    ): Unsubscribe {
      let selectorListenerSet = selectorListeners.get(selector as Selector<T, unknown>);
      if (!selectorListenerSet) {
        selectorListenerSet = new Set();
        selectorListeners.set(selector as Selector<T, unknown>, selectorListenerSet);
      }
      selectorListenerSet.add(listener as StateListener<unknown>);

      return () => {
        selectorListenerSet!.delete(listener as StateListener<unknown>);
        if (selectorListenerSet!.size === 0) {
          selectorListeners.delete(selector as Selector<T, unknown>);
        }
      };
    },
  };
}

// =============================================================================
// Common Middleware
// =============================================================================

/**
 * Logger middleware
 */
export function createLoggerMiddleware<T>(
  name: string = 'Store'
): Middleware<T> {
  return (store) => (next) => (action) => {
    console.group(`[${name}] Action:`, (action as { type?: string }).type || action);
    console.log('Previous State:', store.getState());
    next(action);
    console.log('Next State:', store.getState());
    console.groupEnd();
  };
}

/**
 * Thunk middleware for async actions
 */
export function createThunkMiddleware<T>(): Middleware<T> {
  return (store) => (next) => (action) => {
    if (typeof action === 'function') {
      return (action as (dispatch: typeof store.dispatch, getState: typeof store.getState) => unknown)(store.dispatch, store.getState);
    }
    return next(action);
  };
}

// =============================================================================
// Slice (Reducer slice pattern)
// =============================================================================

export interface SliceConfig<T, A extends Record<string, (state: T, payload: unknown) => T>> {
  name: string;
  initialState: T;
  reducers: A;
}

export type SliceActions<A extends Record<string, (state: unknown, payload: unknown) => unknown>> = {
  [K in keyof A]: A[K] extends (state: unknown, payload: infer P) => unknown
    ? (payload: P) => { type: string; payload: P }
    : never;
};

/**
 * Create a reducer slice
 */
export function createSlice<
  T,
  A extends Record<string, (state: T, payload: never) => T>
>(config: SliceConfig<T, A>): {
  reducer: Reducer<T, { type: string; payload?: unknown }>;
  actions: SliceActions<A>;
  name: string;
} {
  const { name, initialState, reducers } = config;

  const actions = {} as SliceActions<A>;
  const actionTypes: Record<string, (state: T, payload: unknown) => T> = {};

  for (const key of Object.keys(reducers)) {
    const type = `${name}/${key}`;
    actionTypes[type] = reducers[key];
    (actions as Record<string, (payload: unknown) => { type: string; payload: unknown }>)[key] = (payload: unknown) => ({ type, payload });
  }

  const reducer = (state: T = initialState, action: { type: string; payload?: unknown }): T => {
    const handler = actionTypes[action.type];
    if (handler) {
      return handler(state, action.payload);
    }
    return state;
  };

  return { reducer, actions, name };
}

// =============================================================================
// State Machine
// =============================================================================

export type StateMachineConfig<S extends string, E extends string, C = undefined> = {
  initial: S;
  context?: C;
  states: {
    [K in S]: {
      on?: {
        [Key in E]?: S | { target: S; guard?: (context: C) => boolean };
      };
      entry?: (context: C) => void;
      exit?: (context: C) => void;
    };
  };
};

export interface StateMachine<S extends string, E extends string, C = undefined> {
  getState(): S;
  getContext(): C;
  send(event: E): void;
  subscribe(listener: (state: S, prevState: S) => void): Unsubscribe;
  matches(state: S): boolean;
}

/**
 * Create a finite state machine
 */
export function createStateMachine<S extends string, E extends string, C = undefined>(
  config: StateMachineConfig<S, E, C>
): StateMachine<S, E, C> {
  let currentState = config.initial;
  let context = (config.context ?? undefined) as C;
  const listeners = new Set<(state: S, prevState: S) => void>();

  const transition = (event: E) => {
    const stateConfig = config.states[currentState];
    if (!stateConfig.on) return;

    const transition = stateConfig.on[event];
    if (!transition) return;

    let targetState: S;
    if (typeof transition === 'string') {
      targetState = transition;
    } else {
      if (transition.guard && !transition.guard(context)) {
        return;
      }
      targetState = transition.target;
    }

    const prevState = currentState;

    // Exit current state
    if (stateConfig.exit) {
      stateConfig.exit(context);
    }

    currentState = targetState;

    // Enter new state
    const newStateConfig = config.states[currentState];
    if (newStateConfig.entry) {
      newStateConfig.entry(context);
    }

    listeners.forEach((listener) => listener(currentState, prevState));
  };

  return {
    getState(): S {
      return currentState;
    },

    getContext(): C {
      return context;
    },

    send(event: E): void {
      transition(event);
    },

    subscribe(listener: (state: S, prevState: S) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    matches(state: S): boolean {
      return currentState === state;
    },
  };
}

// =============================================================================
// State Persistence
// =============================================================================

export interface PersistConfig<T> {
  key: string;
  storage: {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, value: string): Promise<void> | void;
    removeItem(key: string): Promise<void> | void;
  };
  serialize?: (state: T) => string;
  deserialize?: (data: string) => T;
  whitelist?: (keyof T)[];
  blacklist?: (keyof T)[];
}

/**
 * Create a persisted state
 */
export function createPersistedState<T extends Record<string, unknown>>(
  initialState: T,
  config: PersistConfig<T>
): ReactiveState<T> & { hydrate(): Promise<void>; persist(): Promise<void> } {
  const state = createState(initialState);
  const {
    key,
    storage,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    whitelist,
    blacklist,
  } = config;

  const filterState = (s: T): Partial<T> => {
    if (whitelist) {
      const filtered: Partial<T> = {};
      for (const k of whitelist) {
        filtered[k] = s[k];
      }
      return filtered;
    }
    if (blacklist) {
      const filtered = { ...s };
      for (const k of blacklist) {
        delete filtered[k];
      }
      return filtered;
    }
    return s;
  };

  const hydrate = async () => {
    try {
      const data = await storage.getItem(key);
      if (data) {
        const persisted = deserialize(data);
        state.set({ ...state.get(), ...persisted });
      }
    } catch (error) {
      console.error('[PersistedState] Hydration failed:', error);
    }
  };

  const persist = async () => {
    try {
      const filtered = filterState(state.get());
      await storage.setItem(key, serialize(filtered as T));
    } catch (error) {
      console.error('[PersistedState] Persistence failed:', error);
    }
  };

  // Auto-persist on changes
  state.subscribe(() => {
    persist();
  });

  return {
    ...state,
    hydrate,
    persist,
  };
}

// =============================================================================
// State History (Undo/Redo)
// =============================================================================

export interface StateHistory<T> {
  state: ReactiveState<T>;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  clear(): void;
}

/**
 * Create a state with undo/redo history
 */
export function createStateWithHistory<T>(
  initialState: T,
  maxHistory: number = 50
): StateHistory<T> {
  let value = initialState;
  const listeners = new Set<StateListener<T>>();
  const past: T[] = [];
  const future: T[] = [];
  let isUndoRedo = false;

  const state: ReactiveState<T> = {
    get(): T {
      return value;
    },

    set(newValue: T | ((prev: T) => T)): void {
      const prevValue = value;
      value = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(value)
        : newValue;

      if (!Object.is(value, prevValue)) {
        if (!isUndoRedo) {
          past.push(prevValue);
          if (past.length > maxHistory) {
            past.shift();
          }
          // Clear future on new changes
          future.length = 0;
        }
        listeners.forEach((listener) => listener(value, prevValue));
      }
    },

    subscribe(listener: StateListener<T>): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    get value(): T {
      return value;
    },
  };

  return {
    state,

    undo(): void {
      if (past.length === 0) return;
      const prevState = past.pop()!;
      future.push(value);
      isUndoRedo = true;
      state.set(prevState);
      isUndoRedo = false;
    },

    redo(): void {
      if (future.length === 0) return;
      const nextState = future.pop()!;
      past.push(value);
      isUndoRedo = true;
      state.set(nextState);
      isUndoRedo = false;
    },

    canUndo(): boolean {
      return past.length > 0;
    },

    canRedo(): boolean {
      return future.length > 0;
    },

    clear(): void {
      past.length = 0;
      future.length = 0;
    },
  };
}

// =============================================================================
// State Synchronization
// =============================================================================

export interface SyncConfig {
  channel: string;
  transform?: (state: unknown) => unknown;
}

/**
 * Create a state synchronized across browser tabs using BroadcastChannel
 */
export function createSyncedState<T>(
  initialState: T,
  config: SyncConfig
): ReactiveState<T> & { destroy(): void } {
  const state = createState(initialState);
  const channel = new BroadcastChannel(config.channel);
  let isExternalUpdate = false;

  // Listen for updates from other tabs
  channel.onmessage = (event) => {
    if (event.data && event.data.type === 'STATE_UPDATE') {
      isExternalUpdate = true;
      state.set(event.data.state as T);
      isExternalUpdate = false;
    }
  };

  // Broadcast updates to other tabs
  state.subscribe((newState) => {
    if (!isExternalUpdate) {
      const transformed = config.transform ? config.transform(newState) : newState;
      channel.postMessage({ type: 'STATE_UPDATE', state: transformed });
    }
  });

  return {
    ...state,
    destroy(): void {
      channel.close();
    },
  };
}

// =============================================================================
// Atom Pattern (Jotai-like)
// =============================================================================

export interface Atom<T> {
  key: string;
  default: T;
}

export interface AtomStore {
  get<T>(atom: Atom<T>): T;
  set<T>(atom: Atom<T>, value: T | ((prev: T) => T)): void;
  subscribe<T>(atom: Atom<T>, listener: StateListener<T>): Unsubscribe;
}

/**
 * Create an atom
 */
export function atom<T>(key: string, defaultValue: T): Atom<T> {
  return { key, default: defaultValue };
}

/**
 * Create an atom store
 */
export function createAtomStore(): AtomStore {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<StateListener<unknown>>>();

  return {
    get<T>(atomDef: Atom<T>): T {
      if (!values.has(atomDef.key)) {
        values.set(atomDef.key, atomDef.default);
      }
      return values.get(atomDef.key) as T;
    },

    set<T>(atomDef: Atom<T>, value: T | ((prev: T) => T)): void {
      const prevValue = this.get(atomDef);
      const newValue = typeof value === 'function'
        ? (value as (prev: T) => T)(prevValue)
        : value;

      if (!Object.is(prevValue, newValue)) {
        values.set(atomDef.key, newValue);
        const atomListeners = listeners.get(atomDef.key);
        if (atomListeners) {
          atomListeners.forEach((listener) => listener(newValue, prevValue));
        }
      }
    },

    subscribe<T>(atomDef: Atom<T>, listener: StateListener<T>): Unsubscribe {
      if (!listeners.has(atomDef.key)) {
        listeners.set(atomDef.key, new Set());
      }
      const atomListeners = listeners.get(atomDef.key)!;
      atomListeners.add(listener as StateListener<unknown>);

      return () => {
        atomListeners.delete(listener as StateListener<unknown>);
        if (atomListeners.size === 0) {
          listeners.delete(atomDef.key);
        }
      };
    },
  };
}

// =============================================================================
// Selector Utilities
// =============================================================================

/**
 * Create a memoized selector
 */
export function createSelector<T, R1, Result>(
  selector1: Selector<T, R1>,
  combiner: (r1: R1) => Result
): Selector<T, Result>;
export function createSelector<T, R1, R2, Result>(
  selector1: Selector<T, R1>,
  selector2: Selector<T, R2>,
  combiner: (r1: R1, r2: R2) => Result
): Selector<T, Result>;
export function createSelector<T, R1, R2, R3, Result>(
  selector1: Selector<T, R1>,
  selector2: Selector<T, R2>,
  selector3: Selector<T, R3>,
  combiner: (r1: R1, r2: R2, r3: R3) => Result
): Selector<T, Result>;
export function createSelector<T>(...args: unknown[]): Selector<T, unknown> {
  const selectors = args.slice(0, -1) as Selector<T, unknown>[];
  const combiner = args[args.length - 1] as (...args: unknown[]) => unknown;

  let lastArgs: unknown[] | null = null;
  let lastResult: unknown = null;

  return (state: T) => {
    const currentArgs = selectors.map((selector) => selector(state));

    if (lastArgs && currentArgs.every((arg, i) => Object.is(arg, lastArgs![i]))) {
      return lastResult;
    }

    lastArgs = currentArgs;
    lastResult = combiner(...currentArgs);
    return lastResult;
  };
}

// =============================================================================
// Batch Updates
// =============================================================================

let batchDepth = 0;
let pendingUpdates: (() => void)[] = [];

/**
 * Batch multiple state updates
 */
export function batch(fn: () => void): void {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const updates = pendingUpdates;
      pendingUpdates = [];
      updates.forEach((update) => update());
    }
  }
}

/**
 * Schedule an update for batching
 */
export function scheduleUpdate(update: () => void): void {
  if (batchDepth > 0) {
    pendingUpdates.push(update);
  } else {
    update();
  }
}
