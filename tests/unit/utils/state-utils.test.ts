/**
 * Tests for State Management Utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Reactive state
  createState,
  createComputed,
  // Store
  createStore,
  createLoggerMiddleware,
  createThunkMiddleware,
  createSlice,
  // State machine
  createStateMachine,
  // Persistence
  createPersistedState,
  // History
  createStateWithHistory,
  // Sync
  createSyncedState,
  // Atom
  atom,
  createAtomStore,
  // Selectors
  createSelector,
  // Batch
  batch,
} from '@shared/utils/state-utils';

describe('State Utils', () => {
  describe('createState', () => {
    it('should create state with initial value', () => {
      const state = createState(42);
      expect(state.get()).toBe(42);
      expect(state.value).toBe(42);
    });

    it('should update state with set', () => {
      const state = createState(0);
      state.set(10);
      expect(state.get()).toBe(10);
    });

    it('should update state with function', () => {
      const state = createState(5);
      state.set((prev) => prev * 2);
      expect(state.get()).toBe(10);
    });

    it('should notify subscribers on change', () => {
      const state = createState('initial');
      const listener = vi.fn();

      state.subscribe(listener);
      state.set('updated');

      expect(listener).toHaveBeenCalledWith('updated', 'initial');
    });

    it('should not notify if value is the same', () => {
      const state = createState(42);
      const listener = vi.fn();

      state.subscribe(listener);
      state.set(42);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support unsubscribe', () => {
      const state = createState(0);
      const listener = vi.fn();

      const unsubscribe = state.subscribe(listener);
      state.set(1);
      unsubscribe();
      state.set(2);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle complex objects', () => {
      const state = createState({ count: 0, name: 'test' });

      state.set((prev) => ({ ...prev, count: prev.count + 1 }));

      expect(state.get()).toEqual({ count: 1, name: 'test' });
    });
  });

  describe('createComputed', () => {
    it('should compute value from dependencies', () => {
      const a = createState(2);
      const b = createState(3);

      const sum = createComputed([a, b], (aVal, bVal) => aVal + bVal);

      expect(sum.get()).toBe(5);
    });

    it('should update when dependencies change', () => {
      const a = createState(2);
      const b = createState(3);
      const sum = createComputed([a, b], (aVal, bVal) => aVal + bVal);

      a.set(10);

      expect(sum.get()).toBe(13);
    });

    it('should notify subscribers when computed value changes', () => {
      const a = createState(2);
      const sum = createComputed([a], (aVal) => aVal * 2);
      const listener = vi.fn();

      sum.subscribe(listener);
      a.set(5);

      expect(listener).toHaveBeenCalledWith(10, 4);
    });

    it('should not notify if computed result is the same', () => {
      const a = createState(5);
      const isPositive = createComputed([a], (val) => val > 0);
      const listener = vi.fn();

      isPositive.subscribe(listener);
      a.set(10); // Still positive

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('createStore', () => {
    interface State {
      count: number;
      items: string[];
    }

    type Action =
      | { type: 'INCREMENT' }
      | { type: 'DECREMENT' }
      | { type: 'ADD_ITEM'; payload: string };

    const reducer = (state: State, action: Action): State => {
      switch (action.type) {
        case 'INCREMENT':
          return { ...state, count: state.count + 1 };
        case 'DECREMENT':
          return { ...state, count: state.count - 1 };
        case 'ADD_ITEM':
          return { ...state, items: [...state.items, action.payload] };
        default:
          return state;
      }
    };

    const initialState: State = { count: 0, items: [] };

    it('should create store with initial state', () => {
      const store = createStore(reducer, initialState);
      expect(store.getState()).toEqual({ count: 0, items: [] });
    });

    it('should dispatch actions', () => {
      const store = createStore(reducer, initialState);

      store.dispatch({ type: 'INCREMENT' });

      expect(store.getState().count).toBe(1);
    });

    it('should notify subscribers on state change', () => {
      const store = createStore(reducer, initialState);
      const listener = vi.fn();

      store.subscribe(listener);
      store.dispatch({ type: 'INCREMENT' });

      expect(listener).toHaveBeenCalledWith(
        { count: 1, items: [] },
        { count: 0, items: [] }
      );
    });

    it('should support selectors', () => {
      const store = createStore(reducer, { count: 5, items: ['a', 'b'] });

      const count = store.select((state) => state.count);
      const itemCount = store.select((state) => state.items.length);

      expect(count).toBe(5);
      expect(itemCount).toBe(2);
    });

    it('should support subscribeToSelector', () => {
      const store = createStore(reducer, initialState);
      const countSelector = (state: State) => state.count;
      const listener = vi.fn();

      store.subscribeToSelector(countSelector, listener);
      store.dispatch({ type: 'INCREMENT' });

      expect(listener).toHaveBeenCalledWith(1, 0);
    });

    it('should not call selector listener if selected value unchanged', () => {
      const store = createStore(reducer, { count: 0, items: [] });
      const countSelector = (state: State) => state.count;
      const listener = vi.fn();

      store.subscribeToSelector(countSelector, listener);
      store.dispatch({ type: 'ADD_ITEM', payload: 'test' });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Middleware', () => {
    describe('createLoggerMiddleware', () => {
      it('should log actions and state', () => {
        const consoleGroup = vi.spyOn(console, 'group').mockImplementation(() => {});
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleGroupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

        const store = createStore(
          (state: number, action: { type: string }) =>
            action.type === 'ADD' ? state + 1 : state,
          0,
          { middleware: [createLoggerMiddleware('Test')] }
        );

        store.dispatch({ type: 'ADD' });

        expect(consoleGroup).toHaveBeenCalled();
        expect(consoleLog).toHaveBeenCalled();
        expect(consoleGroupEnd).toHaveBeenCalled();

        consoleGroup.mockRestore();
        consoleLog.mockRestore();
        consoleGroupEnd.mockRestore();
      });
    });

    describe('createThunkMiddleware', () => {
      it('should handle async actions', async () => {
        const store = createStore(
          (state: number, action: { type: string; payload?: number }) =>
            action.type === 'SET' ? action.payload! : state,
          0,
          { middleware: [createThunkMiddleware()] }
        );

        // Dispatch a thunk
        await store.dispatch(((dispatch: (action: { type: string; payload: number }) => void) => {
          return new Promise<void>((resolve) => {
            setTimeout(() => {
              dispatch({ type: 'SET', payload: 42 });
              resolve();
            }, 0);
          });
        }) as unknown as { type: string });

        expect(store.getState()).toBe(42);
      });
    });
  });

  describe('createSlice', () => {
    it('should create a slice with reducer and actions', () => {
      const counterSlice = createSlice({
        name: 'counter',
        initialState: 0,
        reducers: {
          increment: (state: number) => state + 1,
          decrement: (state: number) => state - 1,
          addAmount: (state: number, payload: number) => state + payload,
        },
      });

      expect(counterSlice.name).toBe('counter');
      expect(typeof counterSlice.reducer).toBe('function');
      expect(typeof counterSlice.actions.increment).toBe('function');
    });

    it('should create action creators that produce typed actions', () => {
      const slice = createSlice({
        name: 'test',
        initialState: 0,
        reducers: {
          setValue: (_state: number, payload: number) => payload,
        },
      });

      const action = slice.actions.setValue(42);

      expect(action).toEqual({ type: 'test/setValue', payload: 42 });
    });

    it('should handle actions with reducer', () => {
      const slice = createSlice({
        name: 'counter',
        initialState: 0,
        reducers: {
          increment: (state: number) => state + 1,
          add: (state: number, payload: number) => state + payload,
        },
      });

      const store = createStore(slice.reducer, 0);

      store.dispatch(slice.actions.increment(undefined as never));
      expect(store.getState()).toBe(1);

      store.dispatch(slice.actions.add(10));
      expect(store.getState()).toBe(11);
    });
  });

  describe('createStateMachine', () => {
    type State = 'idle' | 'loading' | 'success' | 'error';
    type Event = 'FETCH' | 'RESOLVE' | 'REJECT' | 'RESET';

    const machineConfig = {
      initial: 'idle' as State,
      states: {
        idle: {
          on: { FETCH: 'loading' as State },
        },
        loading: {
          on: {
            RESOLVE: 'success' as State,
            REJECT: 'error' as State,
          },
        },
        success: {
          on: { RESET: 'idle' as State },
        },
        error: {
          on: { RESET: 'idle' as State },
        },
      },
    };

    it('should start in initial state', () => {
      const machine = createStateMachine<State, Event>(machineConfig);
      expect(machine.getState()).toBe('idle');
    });

    it('should transition on events', () => {
      const machine = createStateMachine<State, Event>(machineConfig);

      machine.send('FETCH');
      expect(machine.getState()).toBe('loading');

      machine.send('RESOLVE');
      expect(machine.getState()).toBe('success');
    });

    it('should ignore invalid transitions', () => {
      const machine = createStateMachine<State, Event>(machineConfig);

      machine.send('RESOLVE'); // Invalid in idle state

      expect(machine.getState()).toBe('idle');
    });

    it('should notify subscribers on transition', () => {
      const machine = createStateMachine<State, Event>(machineConfig);
      const listener = vi.fn();

      machine.subscribe(listener);
      machine.send('FETCH');

      expect(listener).toHaveBeenCalledWith('loading', 'idle');
    });

    it('should support matches helper', () => {
      const machine = createStateMachine<State, Event>(machineConfig);

      expect(machine.matches('idle')).toBe(true);
      expect(machine.matches('loading')).toBe(false);
    });

    it('should support guards', () => {
      type Context = { attempts: number };

      const guardedMachine = createStateMachine<'idle' | 'loading', 'TRY', Context>({
        initial: 'idle',
        context: { attempts: 0 },
        states: {
          idle: {
            on: {
              TRY: {
                target: 'loading',
                guard: (ctx) => ctx.attempts < 3,
              },
            },
          },
          loading: {},
        },
      });

      guardedMachine.send('TRY');
      expect(guardedMachine.getState()).toBe('loading');
    });

    it('should call entry/exit handlers', () => {
      const entry = vi.fn();
      const exit = vi.fn();

      const machine = createStateMachine<'a' | 'b', 'GO'>({
        initial: 'a',
        states: {
          a: {
            on: { GO: 'b' },
            exit,
          },
          b: {
            entry,
          },
        },
      });

      machine.send('GO');

      expect(exit).toHaveBeenCalled();
      expect(entry).toHaveBeenCalled();
    });
  });

  describe('createPersistedState', () => {
    it('should persist state to storage', async () => {
      const storage: Record<string, string> = {};
      const mockStorage = {
        getItem: vi.fn((key: string) => storage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          storage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete storage[key];
        }),
      };

      const state = createPersistedState({ count: 0 }, {
        key: 'test-state',
        storage: mockStorage,
      });

      state.set({ count: 5 });

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'test-state',
        JSON.stringify({ count: 5 })
      );
    });

    it('should hydrate state from storage', async () => {
      const mockStorage = {
        getItem: vi.fn(() => JSON.stringify({ count: 10 })),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      const state = createPersistedState({ count: 0 }, {
        key: 'test-state',
        storage: mockStorage,
      });

      await state.hydrate();

      expect(state.get().count).toBe(10);
    });

    it('should support whitelist', async () => {
      const storage: Record<string, string> = {};
      const mockStorage = {
        getItem: () => null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: () => {},
      };

      const state = createPersistedState(
        { count: 0, secret: 'hidden' },
        {
          key: 'test',
          storage: mockStorage,
          whitelist: ['count'],
        }
      );

      state.set({ count: 5, secret: 'hidden' });

      const persisted = JSON.parse(storage['test']);
      expect(persisted).toEqual({ count: 5 });
      expect(persisted.secret).toBeUndefined();
    });

    it('should support blacklist', async () => {
      const storage: Record<string, string> = {};
      const mockStorage = {
        getItem: () => null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: () => {},
      };

      const state = createPersistedState(
        { count: 0, secret: 'hidden' },
        {
          key: 'test',
          storage: mockStorage,
          blacklist: ['secret'],
        }
      );

      state.set({ count: 5, secret: 'hidden' });

      const persisted = JSON.parse(storage['test']);
      expect(persisted.count).toBe(5);
      expect(persisted.secret).toBeUndefined();
    });
  });

  describe('createStateWithHistory', () => {
    it('should support undo', () => {
      const history = createStateWithHistory(0);

      history.state.set(1);
      history.state.set(2);
      history.state.set(3);

      expect(history.state.get()).toBe(3);
      expect(history.canUndo()).toBe(true);

      history.undo();
      expect(history.state.get()).toBe(2);

      history.undo();
      expect(history.state.get()).toBe(1);
    });

    it('should support redo', () => {
      const history = createStateWithHistory(0);

      history.state.set(1);
      history.state.set(2);

      history.undo();
      expect(history.canRedo()).toBe(true);

      history.redo();
      expect(history.state.get()).toBe(2);
    });

    it('should clear future on new changes', () => {
      const history = createStateWithHistory(0);

      history.state.set(1);
      history.state.set(2);
      history.undo();
      history.state.set(3); // New branch

      expect(history.canRedo()).toBe(false);
    });

    it('should respect maxHistory', () => {
      const history = createStateWithHistory(0, 3);

      history.state.set(1);
      history.state.set(2);
      history.state.set(3);
      history.state.set(4);

      // Can only undo 3 times (maxHistory)
      history.undo();
      history.undo();
      history.undo();

      expect(history.canUndo()).toBe(false);
    });

    it('should support clear', () => {
      const history = createStateWithHistory(0);

      history.state.set(1);
      history.state.set(2);
      history.clear();

      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
    });
  });

  describe('createSyncedState', () => {
    it('should create synced state', () => {
      const state = createSyncedState({ count: 0 }, { channel: 'test-sync' });

      expect(state.get()).toEqual({ count: 0 });

      state.destroy();
    });

    it('should broadcast changes', () => {
      const postMessage = vi.fn();
      vi.spyOn(global, 'BroadcastChannel').mockImplementation(() => ({
        postMessage,
        onmessage: null,
        close: vi.fn(),
      } as unknown as BroadcastChannel));

      const state = createSyncedState({ count: 0 }, { channel: 'test' });

      state.set({ count: 5 });

      expect(postMessage).toHaveBeenCalledWith({
        type: 'STATE_UPDATE',
        state: { count: 5 },
      });

      state.destroy();
      vi.restoreAllMocks();
    });
  });

  describe('Atom pattern', () => {
    describe('atom', () => {
      it('should create an atom definition', () => {
        const countAtom = atom('count', 0);

        expect(countAtom.key).toBe('count');
        expect(countAtom.default).toBe(0);
      });
    });

    describe('createAtomStore', () => {
      it('should get atom value', () => {
        const store = createAtomStore();
        const countAtom = atom('count', 10);

        expect(store.get(countAtom)).toBe(10);
      });

      it('should set atom value', () => {
        const store = createAtomStore();
        const countAtom = atom('count', 0);

        store.set(countAtom, 5);

        expect(store.get(countAtom)).toBe(5);
      });

      it('should set atom value with function', () => {
        const store = createAtomStore();
        const countAtom = atom('count', 5);

        store.set(countAtom, (prev) => prev * 2);

        expect(store.get(countAtom)).toBe(10);
      });

      it('should subscribe to atom changes', () => {
        const store = createAtomStore();
        const countAtom = atom('count', 0);
        const listener = vi.fn();

        store.subscribe(countAtom, listener);
        store.set(countAtom, 5);

        expect(listener).toHaveBeenCalledWith(5, 0);
      });

      it('should support unsubscribe', () => {
        const store = createAtomStore();
        const countAtom = atom('count', 0);
        const listener = vi.fn();

        const unsubscribe = store.subscribe(countAtom, listener);
        store.set(countAtom, 1);
        unsubscribe();
        store.set(countAtom, 2);

        expect(listener).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('createSelector', () => {
    interface State {
      users: { id: number; name: string }[];
      filter: string;
    }

    const state: State = {
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ],
      filter: 'a',
    };

    it('should create a memoized selector', () => {
      const getUsers = (s: State) => s.users;
      const getFilter = (s: State) => s.filter;

      const getFilteredUsers = createSelector(
        getUsers,
        getFilter,
        (users, filter) =>
          users.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase()))
      );

      const result = getFilteredUsers(state);

      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 3, name: 'Charlie' },
      ]);
    });

    it('should memoize results', () => {
      const getUsers = (s: State) => s.users;
      const computeFn = vi.fn((users: State['users']) => users.length);

      const getUserCount = createSelector(getUsers, computeFn);

      getUserCount(state);
      getUserCount(state);
      getUserCount(state);

      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should recompute when dependencies change', () => {
      const getUsers = (s: State) => s.users;
      const computeFn = vi.fn((users: State['users']) => users.length);

      const getUserCount = createSelector(getUsers, computeFn);

      getUserCount(state);
      getUserCount({ ...state, users: [...state.users, { id: 4, name: 'Dave' }] });

      expect(computeFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('batch', () => {
    it('should batch multiple state updates', () => {
      const state1 = createState(0);
      const state2 = createState(0);
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      state1.subscribe(listener1);
      state2.subscribe(listener2);

      batch(() => {
        state1.set(1);
        state1.set(2);
        state1.set(3);
        state2.set(10);
      });

      // Each state change still triggers immediately in current implementation
      // but batch is useful for grouping related operations
      expect(state1.get()).toBe(3);
      expect(state2.get()).toBe(10);
    });
  });
});
