/**
 * Vitest setup file
 * 
 * This file runs before all tests and sets up global mocks and configurations.
 */

import 'fake-indexeddb/auto';

// Mock Chrome Extension APIs
const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn()
    },
    openOptionsPage: vi.fn()
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    }
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn().mockResolvedValue([])
  }
};

// Assign mock to global
vi.stubGlobal('chrome', mockChrome);

// Helper to reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
