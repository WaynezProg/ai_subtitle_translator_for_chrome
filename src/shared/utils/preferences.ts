/**
 * User Preferences Storage
 * 
 * Manages user preferences and settings using chrome.storage.local.
 * Includes ToS acceptance tracking per FR-031.
 */

import { STORAGE_KEYS, DEFAULT_TARGET_LANGUAGE, UI_CONSTANTS } from './constants';
import type { ProviderType } from '../types/auth';
import type { RenderOptions } from '../../content/adapters/types';
import { createLogger } from './logger';

const log = createLogger('Preferences');

// ============================================================================
// Types
// ============================================================================

/**
 * User settings structure
 */
export interface UserSettings {
  /** Target translation language (BCP 47) */
  targetLanguage: string;
  
  /** Subtitle rendering options */
  renderOptions: RenderOptions;
  
  /** Whether subtitles are currently visible */
  subtitlesVisible: boolean;
  
  /** Selected provider type */
  selectedProvider?: ProviderType;
  
  /** Automatic translation on video load */
  autoTranslate: boolean;
}

/**
 * Subscription disclaimer acceptance record
 */
export interface SubscriptionDisclaimer {
  /** Provider type that was accepted */
  providerType: 'claude-subscription' | 'chatgpt-subscription';
  
  /** Timestamp when accepted */
  acceptedAt: string;
  
  /** Version of the disclaimer that was accepted */
  disclaimerVersion: string;
}

// ============================================================================
// Constants
// ============================================================================

const CURRENT_DISCLAIMER_VERSION = '1.0.0';

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  fontSize: UI_CONSTANTS.DEFAULT_FONT_SIZE,
  fontColor: '#FFFFFF',
  position: 'bottom',
  bilingual: true,
  bilingualOrder: 'original-first',
  background: 'box',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const DEFAULT_SETTINGS: UserSettings = {
  targetLanguage: DEFAULT_TARGET_LANGUAGE,
  renderOptions: DEFAULT_RENDER_OPTIONS,
  subtitlesVisible: true,
  autoTranslate: false,
};

// ============================================================================
// Settings Functions
// ============================================================================

/**
 * Get user settings from storage
 */
export async function getUserSettings(): Promise<UserSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.USER_SETTINGS);
    const stored = result[STORAGE_KEYS.USER_SETTINGS];
    
    if (!stored) {
      return { ...DEFAULT_SETTINGS };
    }
    
    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      renderOptions: {
        ...DEFAULT_RENDER_OPTIONS,
        ...stored.renderOptions,
      },
    };
  } catch (error) {
    console.error('[Preferences] Failed to get user settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save user settings to storage
 */
export async function saveUserSettings(settings: Partial<UserSettings>): Promise<void> {
  try {
    const current = await getUserSettings();
    const updated = {
      ...current,
      ...settings,
      renderOptions: {
        ...current.renderOptions,
        ...(settings.renderOptions || {}),
      },
    };
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.USER_SETTINGS]: updated,
    });
  } catch (error) {
    console.error('[Preferences] Failed to save user settings:', error);
    throw error;
  }
}

/**
 * Update specific render options
 */
export async function updateRenderOptions(options: Partial<RenderOptions>): Promise<void> {
  const settings = await getUserSettings();
  await saveUserSettings({
    renderOptions: {
      ...settings.renderOptions,
      ...options,
    },
  });
}

/**
 * Reset settings to defaults
 */
export async function resetSettings(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.USER_SETTINGS);
}

// ============================================================================
// ToS Disclaimer Functions
// ============================================================================

/**
 * Check if user has accepted the subscription disclaimer
 */
export async function hasAcceptedSubscriptionDisclaimer(
  providerType: 'claude-subscription' | 'chatgpt-subscription'
): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TOS_ACCEPTED);
    const disclaimers = result[STORAGE_KEYS.TOS_ACCEPTED] as SubscriptionDisclaimer[] | undefined;
    
    if (!disclaimers) {
      return false;
    }
    
    // Find acceptance for this provider with current version
    return disclaimers.some(
      d => d.providerType === providerType && d.disclaimerVersion === CURRENT_DISCLAIMER_VERSION
    );
  } catch (error) {
    console.error('[Preferences] Failed to check disclaimer status:', error);
    return false;
  }
}

/**
 * Record user's acceptance of the subscription disclaimer
 */
export async function acceptSubscriptionDisclaimer(
  providerType: 'claude-subscription' | 'chatgpt-subscription'
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TOS_ACCEPTED);
    const disclaimers = (result[STORAGE_KEYS.TOS_ACCEPTED] as SubscriptionDisclaimer[]) || [];
    
    // Remove any existing acceptance for this provider
    const filtered = disclaimers.filter(d => d.providerType !== providerType);
    
    // Add new acceptance
    filtered.push({
      providerType,
      acceptedAt: new Date().toISOString(),
      disclaimerVersion: CURRENT_DISCLAIMER_VERSION,
    });
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.TOS_ACCEPTED]: filtered,
    });
    
    log.debug(`Subscription disclaimer accepted for ${providerType}`);
  } catch (error) {
    log.error('Failed to save disclaimer acceptance', { error });
    throw error;
  }
}

/**
 * Revoke subscription disclaimer acceptance
 */
export async function revokeSubscriptionDisclaimer(
  providerType: 'claude-subscription' | 'chatgpt-subscription'
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TOS_ACCEPTED);
    const disclaimers = (result[STORAGE_KEYS.TOS_ACCEPTED] as SubscriptionDisclaimer[]) || [];
    
    const filtered = disclaimers.filter(d => d.providerType !== providerType);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.TOS_ACCEPTED]: filtered,
    });
  } catch (error) {
    console.error('[Preferences] Failed to revoke disclaimer:', error);
    throw error;
  }
}

/**
 * Get all subscription disclaimer acceptances
 */
export async function getSubscriptionDisclaimers(): Promise<SubscriptionDisclaimer[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TOS_ACCEPTED);
    return (result[STORAGE_KEYS.TOS_ACCEPTED] as SubscriptionDisclaimer[]) || [];
  } catch (error) {
    console.error('[Preferences] Failed to get disclaimers:', error);
    return [];
  }
}

// ============================================================================
// Recent Translations
// ============================================================================

export interface RecentTranslation {
  videoId: string;
  platform: string;
  title?: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedAt: string;
  cueCount: number;
}

const MAX_RECENT_TRANSLATIONS = 20;

/**
 * Get recent translations
 */
export async function getRecentTranslations(): Promise<RecentTranslation[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.RECENT_TRANSLATIONS);
    return (result[STORAGE_KEYS.RECENT_TRANSLATIONS] as RecentTranslation[]) || [];
  } catch (error) {
    console.error('[Preferences] Failed to get recent translations:', error);
    return [];
  }
}

/**
 * Add a translation to recent history
 */
export async function addRecentTranslation(translation: Omit<RecentTranslation, 'translatedAt'>): Promise<void> {
  try {
    const recent = await getRecentTranslations();
    
    // Remove existing entry for same video
    const filtered = recent.filter(t => t.videoId !== translation.videoId);
    
    // Add new entry at the beginning
    filtered.unshift({
      ...translation,
      translatedAt: new Date().toISOString(),
    });
    
    // Limit to max entries
    const limited = filtered.slice(0, MAX_RECENT_TRANSLATIONS);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.RECENT_TRANSLATIONS]: limited,
    });
  } catch (error) {
    console.error('[Preferences] Failed to add recent translation:', error);
  }
}

/**
 * Clear recent translations history
 */
export async function clearRecentTranslations(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.RECENT_TRANSLATIONS);
}
