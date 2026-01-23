/**
 * Adapter Registry
 * 
 * Manages platform adapters and provides adapter lookup by URL.
 */

import type { PlatformAdapter } from './types';
import type { Platform } from '../../shared/types/subtitle';
import { createLogger } from '../../shared/utils/logger';

const log = createLogger('AdapterRegistry');

/**
 * Registry for platform adapters
 * 
 * Manages registration and lookup of platform-specific adapters.
 */
export class AdapterRegistry {
  private adapters: PlatformAdapter[] = [];
  private currentAdapter: PlatformAdapter | null = null;
  
  /**
   * Register a platform adapter
   */
  registerAdapter(adapter: PlatformAdapter): void {
    // Check for duplicate platform
    const existing = this.adapters.find(a => a.platform === adapter.platform);
    if (existing) {
      log.warn(`Replacing existing adapter for platform: ${adapter.platform}`);
      this.adapters = this.adapters.filter(a => a.platform !== adapter.platform);
    }

    this.adapters.push(adapter);
    log.debug(`Registered adapter for: ${adapter.platform}`);
  }
  
  /**
   * Unregister a platform adapter
   */
  unregisterAdapter(platform: Platform): void {
    this.adapters = this.adapters.filter(a => a.platform !== platform);
  }
  
  /**
   * Find the appropriate adapter for a URL
   */
  getAdapter(url: string): PlatformAdapter | null {
    return this.adapters.find(adapter => adapter.canHandle(url)) ?? null;
  }
  
  /**
   * Get adapter by platform
   */
  getAdapterByPlatform(platform: Platform): PlatformAdapter | null {
    return this.adapters.find(a => a.platform === platform) ?? null;
  }
  
  /**
   * Get all registered adapters
   */
  getAllAdapters(): PlatformAdapter[] {
    return [...this.adapters];
  }
  
  /**
   * Get the currently active adapter
   */
  getCurrentAdapter(): PlatformAdapter | null {
    return this.currentAdapter;
  }
  
  /**
   * Set the current active adapter
   */
  setCurrentAdapter(adapter: PlatformAdapter | null): void {
    // Clean up previous adapter
    if (this.currentAdapter && this.currentAdapter !== adapter) {
      this.currentAdapter.destroy();
    }
    this.currentAdapter = adapter;
  }
  
  /**
   * Initialize adapter for current page
   */
  async initializeForCurrentPage(url: string): Promise<PlatformAdapter | null> {
    const adapter = this.getAdapter(url);
    
    if (!adapter) {
      log.debug('No adapter found for URL:', { url });
      return null;
    }

    try {
      await adapter.initialize();
      this.setCurrentAdapter(adapter);
      log.info(`Initialized adapter: ${adapter.platform}`);
      return adapter;
    } catch (error) {
      log.error(`Failed to initialize adapter`, error instanceof Error ? error : { error });
      return null;
    }
  }
  
  /**
   * Clean up all adapters
   */
  destroy(): void {
    if (this.currentAdapter) {
      this.currentAdapter.destroy();
      this.currentAdapter = null;
    }
  }
}

// Global registry instance
export const adapterRegistry = new AdapterRegistry();
