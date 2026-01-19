/**
 * Settings Panel Component
 *
 * In-player subtitle settings panel for adjusting display options
 * and selecting cached translations.
 *
 * @see specs/player-ui - In-Player Settings Panel
 * @see specs/subtitle-settings - All setting controls
 */

import type { RenderOptions } from '../adapters/types';
import type { CachedTranslationInfo } from '../../shared/types/messages';
import type { Platform } from '../../shared/types/subtitle';

// ============================================================================
// Types
// ============================================================================

export interface SettingsPanelOptions {
  /** Current render options */
  renderOptions: RenderOptions;

  /** Callback when settings change */
  onSettingsChange: (options: Partial<RenderOptions>) => void;

  /** Callback when cached translation is selected */
  onCacheSelect: (cacheId: string) => void | Promise<void>;

  /** Callback when translate button is clicked */
  onTranslate: () => void | Promise<void>;

  /** Platform for styling */
  platform: Platform;
}

export interface SettingsPanel {
  /** Mount the panel to the player */
  mount(container: HTMLElement): void;

  /** Unmount and cleanup */
  unmount(): void;

  /** Show the panel */
  show(): void;

  /** Hide the panel */
  hide(): void;

  /** Toggle panel visibility */
  toggle(): void;

  /** Check if panel is visible */
  isVisible(): boolean;

  /** Update cached translations list */
  updateCachedTranslations(translations: CachedTranslationInfo[]): void;

  /** Update current settings display */
  updateSettings(options: Partial<RenderOptions>): void;

  /** Set translation state */
  setTranslationState(state: 'idle' | 'translating' | 'complete' | 'error'): void;

  /** Set translation progress */
  setProgress(percent: number): void;
}

// ============================================================================
// Constants
// ============================================================================

const PANEL_ID = 'ai-subtitle-settings-panel';

const PRESET_COLORS = [
  { label: '白', value: '#FFFFFF' },
  { label: '黃', value: '#FFFF00' },
  { label: '綠', value: '#00FF00' },
  { label: '青', value: '#00FFFF' },
];

const FONT_OPTIONS = [
  { label: '系統字體', value: 'system-ui, -apple-system, sans-serif' },
  { label: '思源黑體', value: '"Noto Sans TC", "Noto Sans SC", sans-serif' },
  { label: '等寬字體', value: 'ui-monospace, monospace' },
  { label: '襯線字體', value: 'Georgia, "Times New Roman", serif' },
];

const BACKGROUND_OPTIONS = [
  { label: '無背景', value: 'none' },
  { label: '陰影', value: 'shadow' },
  { label: '半透明框', value: 'box' },
];

const POSITION_OPTIONS = [
  { label: '上方', value: 'top' },
  { label: '下方', value: 'bottom' },
];

// ============================================================================
// Implementation
// ============================================================================

export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  const { onSettingsChange, onCacheSelect, onTranslate } = options;
  let currentOptions = { ...options.renderOptions };
  let panel: HTMLDivElement | null = null;
  let visible = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let cachedTranslations: CachedTranslationInfo[] = [];
  let translationState: 'idle' | 'translating' | 'complete' | 'error' = 'idle';
  let translationProgress = 0;

  /**
   * Debounced settings change handler
   */
  function handleSettingsChange(changes: Partial<RenderOptions>): void {
    currentOptions = { ...currentOptions, ...changes };

    // Debounce to avoid rapid updates
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      onSettingsChange(changes);
    }, 150);
  }

  /**
   * Create the panel element
   */
  function createPanelElement(): HTMLDivElement {
    const panelEl = document.createElement('div');
    panelEl.id = PANEL_ID;
    panelEl.className = 'ai-subtitle-settings-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'settings-header';

    const title = document.createElement('span');
    title.className = 'settings-title';
    title.textContent = '字幕翻譯設定';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'settings-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = '關閉';
    closeBtn.addEventListener('click', () => {
      visible = false;
      panelEl.classList.remove('visible');
    });
    header.appendChild(closeBtn);

    panelEl.appendChild(header);

    // Translation section
    const translationSection = createTranslationSection();
    panelEl.appendChild(translationSection);

    // Display settings section
    const displaySection = createDisplaySection();
    panelEl.appendChild(displaySection);

    return panelEl;
  }

  /**
   * Create translation section
   */
  function createTranslationSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header';
    sectionHeader.textContent = '翻譯';
    section.appendChild(sectionHeader);

    // Translate button
    const translateBtn = document.createElement('button');
    translateBtn.className = 'translate-action-btn';
    translateBtn.id = 'settings-translate-btn';
    translateBtn.addEventListener('click', () => {
      Promise.resolve(onTranslate()).catch((error) => {
        console.error('[SettingsPanel] Translation error:', error);
      });
    });
    updateTranslateButton(translateBtn);
    section.appendChild(translateBtn);

    // Cache section
    const cacheSection = document.createElement('div');
    cacheSection.className = 'cache-section';
    cacheSection.id = 'settings-cache-section';
    updateCacheSection(cacheSection);
    section.appendChild(cacheSection);

    return section;
  }

  /**
   * Clear all children from an element (Trusted Types compliant)
   */
  function clearChildren(element: HTMLElement): void {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Update translate button based on state
   */
  function updateTranslateButton(btn: HTMLButtonElement): void {
    clearChildren(btn);

    const icon = document.createElement('span');
    icon.className = 'btn-icon';

    const label = document.createElement('span');
    label.className = 'btn-label';

    switch (translationState) {
      case 'idle':
        icon.textContent = '🌐';
        label.textContent = '開始翻譯';
        btn.disabled = false;
        break;
      case 'translating':
        icon.textContent = '⏳';
        label.textContent = `翻譯中... ${translationProgress}%`;
        btn.disabled = true;
        break;
      case 'complete':
        icon.textContent = '✅';
        label.textContent = '翻譯完成';
        btn.disabled = true;
        break;
      case 'error':
        icon.textContent = '❌';
        label.textContent = '翻譯失敗，點擊重試';
        btn.disabled = false;
        break;
    }

    btn.appendChild(icon);
    btn.appendChild(label);
  }

  /**
   * Update cache section
   */
  function updateCacheSection(container: HTMLElement): void {
    clearChildren(container);

    if (cachedTranslations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cache-empty';
      empty.textContent = '沒有快取翻譯';
      container.appendChild(empty);
      return;
    }

    const cacheLabel = document.createElement('div');
    cacheLabel.className = 'cache-label';
    cacheLabel.textContent = `已有快取: ${cachedTranslations.length} 個版本`;
    container.appendChild(cacheLabel);

    const cacheList = document.createElement('div');
    cacheList.className = 'cache-list';

    for (const cache of cachedTranslations) {
      const item = document.createElement('button');
      item.className = 'cache-item';
      item.addEventListener('click', () => {
        Promise.resolve(onCacheSelect(cache.id)).catch((error) => {
          console.error('[SettingsPanel] Cache select error:', error);
        });
      });

      const info = document.createElement('div');
      info.className = 'cache-info';

      const langPair = document.createElement('span');
      langPair.className = 'cache-lang';
      langPair.textContent = `${cache.sourceLanguage} → ${cache.targetLanguage}`;
      info.appendChild(langPair);

      const provider = document.createElement('span');
      provider.className = 'cache-provider';
      provider.textContent = cache.provider;
      info.appendChild(provider);

      item.appendChild(info);

      const meta = document.createElement('div');
      meta.className = 'cache-meta';
      const date = new Date(cache.translatedAt);
      meta.textContent = `${cache.cueCount} 句 · ${date.toLocaleDateString('zh-TW')}`;
      item.appendChild(meta);

      cacheList.appendChild(item);
    }

    container.appendChild(cacheList);
  }

  /**
   * Create display settings section
   */
  function createDisplaySection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-header';
    sectionHeader.textContent = '顯示設定';
    section.appendChild(sectionHeader);

    // Font size slider
    section.appendChild(createFontSizeControl());

    // Font color picker
    section.appendChild(createFontColorControl());

    // Font family select
    section.appendChild(createFontFamilyControl());

    // Background style select
    section.appendChild(createBackgroundControl());

    // Position select
    section.appendChild(createPositionControl());

    // Bilingual mode toggle
    section.appendChild(createBilingualControl());

    return section;
  }

  /**
   * Create font size slider control
   */
  function createFontSizeControl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.textContent = '字體大小';
    label.htmlFor = 'settings-font-size';
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'settings-control slider-control';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'settings-font-size';
    slider.min = '16';
    slider.max = '48';
    slider.step = '2';
    slider.value = String(currentOptions.fontSize);
    control.appendChild(slider);

    const value = document.createElement('span');
    value.className = 'slider-value';
    value.textContent = `${currentOptions.fontSize}px`;
    control.appendChild(value);

    slider.addEventListener('input', () => {
      const fontSize = parseInt(slider.value, 10);
      value.textContent = `${fontSize}px`;
      handleSettingsChange({ fontSize });
    });

    row.appendChild(control);
    return row;
  }

  /**
   * Create font color picker control
   */
  function createFontColorControl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.textContent = '字體顏色';
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'settings-control color-control';

    // Preset colors
    const presetContainer = document.createElement('div');
    presetContainer.className = 'color-presets';

    for (const color of PRESET_COLORS) {
      const btn = document.createElement('button');
      btn.className = 'color-preset';
      btn.style.backgroundColor = color.value;
      btn.title = color.label;
      btn.dataset.color = color.value;

      if (currentOptions.fontColor === color.value) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        // Remove active from all
        presetContainer.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        handleSettingsChange({ fontColor: color.value });

        // Update custom input
        const customInput = control.querySelector('.color-custom') as HTMLInputElement;
        if (customInput) customInput.value = color.value;
      });

      presetContainer.appendChild(btn);
    }
    control.appendChild(presetContainer);

    // Custom color input
    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'color-custom';
    customInput.placeholder = '#RRGGBB';
    customInput.value = currentOptions.fontColor || '#FFFFFF';
    customInput.maxLength = 7;

    customInput.addEventListener('input', () => {
      const value = customInput.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
        customInput.classList.remove('invalid');
        presetContainer.querySelectorAll('.color-preset').forEach(b => b.classList.remove('active'));
        handleSettingsChange({ fontColor: value });
      } else if (value.length === 7) {
        customInput.classList.add('invalid');
      }
    });

    control.appendChild(customInput);
    row.appendChild(control);
    return row;
  }

  /**
   * Create font family select control
   */
  function createFontFamilyControl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.textContent = '字體樣式';
    label.htmlFor = 'settings-font-family';
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'settings-control';

    const select = document.createElement('select');
    select.id = 'settings-font-family';

    for (const font of FONT_OPTIONS) {
      const option = document.createElement('option');
      option.value = font.value;
      option.textContent = font.label;
      if (currentOptions.fontFamily === font.value) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      handleSettingsChange({ fontFamily: select.value });
    });

    control.appendChild(select);
    row.appendChild(control);
    return row;
  }

  /**
   * Create background style select control
   */
  function createBackgroundControl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.textContent = '背景樣式';
    label.htmlFor = 'settings-background';
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'settings-control';

    const select = document.createElement('select');
    select.id = 'settings-background';

    for (const bg of BACKGROUND_OPTIONS) {
      const option = document.createElement('option');
      option.value = bg.value;
      option.textContent = bg.label;
      if (currentOptions.background === bg.value) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      handleSettingsChange({ background: select.value as RenderOptions['background'] });
    });

    control.appendChild(select);
    row.appendChild(control);
    return row;
  }

  /**
   * Create position select control
   */
  function createPositionControl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.textContent = '位置';
    label.htmlFor = 'settings-position';
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'settings-control';

    const select = document.createElement('select');
    select.id = 'settings-position';

    for (const pos of POSITION_OPTIONS) {
      const option = document.createElement('option');
      option.value = pos.value;
      option.textContent = pos.label;
      if (currentOptions.position === pos.value) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      handleSettingsChange({ position: select.value as RenderOptions['position'] });
    });

    control.appendChild(select);
    row.appendChild(control);
    return row;
  }

  /**
   * Create bilingual mode toggle control
   */
  function createBilingualControl(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('label');
    label.textContent = '雙語模式';
    label.htmlFor = 'settings-bilingual';
    row.appendChild(label);

    const control = document.createElement('div');
    control.className = 'settings-control bilingual-control';

    // Toggle switch
    const toggle = document.createElement('label');
    toggle.className = 'toggle-switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'settings-bilingual';
    checkbox.checked = currentOptions.bilingual;
    toggle.appendChild(checkbox);

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    toggle.appendChild(slider);

    control.appendChild(toggle);

    // Order select (hidden when bilingual is off)
    const orderSelect = document.createElement('select');
    orderSelect.id = 'settings-bilingual-order';
    orderSelect.className = 'bilingual-order';
    if (!currentOptions.bilingual) {
      orderSelect.style.display = 'none';
    }

    const orderOptions = [
      { label: '原文在上', value: 'original-first' },
      { label: '譯文在上', value: 'translation-first' },
    ];

    for (const opt of orderOptions) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (currentOptions.bilingualOrder === opt.value) {
        option.selected = true;
      }
      orderSelect.appendChild(option);
    }

    orderSelect.addEventListener('change', () => {
      handleSettingsChange({ bilingualOrder: orderSelect.value as RenderOptions['bilingualOrder'] });
    });

    control.appendChild(orderSelect);

    checkbox.addEventListener('change', () => {
      const bilingual = checkbox.checked;
      orderSelect.style.display = bilingual ? 'block' : 'none';
      handleSettingsChange({ bilingual });
    });

    row.appendChild(control);
    return row;
  }

  return {
    mount(container: HTMLElement): void {
      if (panel) return;

      // Check for existing panel
      const existing = document.getElementById(PANEL_ID);
      if (existing) {
        existing.remove();
      }

      panel = createPanelElement();
      container.appendChild(panel);

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (panel && visible && !panel.contains(e.target as Node)) {
          const settingsBtn = document.querySelector('.ai-subtitle-settings-btn');
          if (!settingsBtn?.contains(e.target as Node)) {
            visible = false;
            panel.classList.remove('visible');
          }
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && visible && panel) {
          visible = false;
          panel.classList.remove('visible');
        }
      });

      console.log('[SettingsPanel] Mounted');
    },

    unmount(): void {
      if (!panel) return;

      panel.remove();
      panel = null;
      visible = false;

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      console.log('[SettingsPanel] Unmounted');
    },

    show(): void {
      if (panel) {
        visible = true;
        panel.classList.add('visible');
      }
    },

    hide(): void {
      if (panel) {
        visible = false;
        panel.classList.remove('visible');
      }
    },

    toggle(): void {
      if (visible) {
        this.hide();
      } else {
        this.show();
      }
    },

    isVisible(): boolean {
      return visible;
    },

    updateCachedTranslations(translations: CachedTranslationInfo[]): void {
      cachedTranslations = translations;
      const cacheSection = panel?.querySelector('#settings-cache-section');
      if (cacheSection) {
        updateCacheSection(cacheSection as HTMLElement);
      }
    },

    updateSettings(newOptions: Partial<RenderOptions>): void {
      currentOptions = { ...currentOptions, ...newOptions };

      // Update UI elements
      if (panel) {
        const fontSizeSlider = panel.querySelector('#settings-font-size') as HTMLInputElement;
        if (fontSizeSlider && newOptions.fontSize !== undefined) {
          fontSizeSlider.value = String(newOptions.fontSize);
          const valueEl = fontSizeSlider.parentElement?.querySelector('.slider-value');
          if (valueEl) valueEl.textContent = `${newOptions.fontSize}px`;
        }

        // Update other controls as needed...
      }
    },

    setTranslationState(state: 'idle' | 'translating' | 'complete' | 'error'): void {
      translationState = state;
      const btn = panel?.querySelector('#settings-translate-btn') as HTMLButtonElement;
      if (btn) {
        updateTranslateButton(btn);
      }
    },

    setProgress(percent: number): void {
      translationProgress = Math.max(0, Math.min(100, percent));
      if (translationState === 'translating') {
        const btn = panel?.querySelector('#settings-translate-btn') as HTMLButtonElement;
        if (btn) {
          updateTranslateButton(btn);
        }
      }
    },
  };
}
