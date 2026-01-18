/**
 * ToS Warning Dialog Component
 * 
 * Displays a one-time Terms of Service warning for subscription-based
 * translation (Claude Pro / ChatGPT Plus), per FR-031.
 * 
 * Risk Acknowledgment:
 * - Using subscription accounts may violate provider's Terms of Service
 * - Service may change or become unavailable without notice
 * - User accepts all responsibility for using this feature
 */

// ============================================================================
// Types
// ============================================================================

export interface TosDialogOptions {
  /** Provider type being configured */
  providerType: 'claude-subscription' | 'chatgpt-subscription';
  
  /** Callback when user accepts */
  onAccept: () => void;
  
  /** Callback when user declines */
  onDecline: () => void;
}

export interface TosDialogTexts {
  title: string;
  warnings: string[];
  checkboxLabel: string;
  acceptButton: string;
  declineButton: string;
}

// ============================================================================
// Constants
// ============================================================================

const DIALOG_ID = 'ai-subtitle-tos-dialog';
const OVERLAY_ID = 'ai-subtitle-tos-overlay';

const TEXTS: Record<'claude-subscription' | 'chatgpt-subscription', TosDialogTexts> = {
  'claude-subscription': {
    title: '使用 Claude Pro 訂閱翻譯',
    warnings: [
      '此功能透過非官方方式存取您的 Claude Pro 訂閱',
      '可能違反 Anthropic 的服務條款',
      '服務可能隨時變更或失效，恕不另行通知',
      '本擴充功能開發者不對任何後果負責',
    ],
    checkboxLabel: '我了解並接受上述風險，願意繼續使用此功能',
    acceptButton: '確認並繼續',
    declineButton: '取消',
  },
  'chatgpt-subscription': {
    title: '使用 ChatGPT Plus 訂閱翻譯',
    warnings: [
      '此功能透過非官方方式存取您的 ChatGPT Plus 訂閱',
      '可能違反 OpenAI 的服務條款',
      '服務可能隨時變更或失效，恕不另行通知',
      '本擴充功能開發者不對任何後果負責',
    ],
    checkboxLabel: '我了解並接受上述風險，願意繼續使用此功能',
    acceptButton: '確認並繼續',
    declineButton: '取消',
  },
};

// ============================================================================
// Dialog Styles
// ============================================================================

const DIALOG_STYLES = `
  #${OVERLAY_ID} {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  #${DIALOG_ID} {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 480px;
    width: 90%;
    padding: 24px;
    animation: tos-dialog-appear 0.2s ease-out;
  }

  @keyframes tos-dialog-appear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  #${DIALOG_ID} .tos-title {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin: 0 0 16px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #${DIALOG_ID} .tos-title::before {
    content: '⚠️';
    font-size: 24px;
  }

  #${DIALOG_ID} .tos-warnings {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  #${DIALOG_ID} .tos-warnings ul {
    margin: 0;
    padding: 0 0 0 20px;
    color: #856404;
  }

  #${DIALOG_ID} .tos-warnings li {
    margin-bottom: 8px;
    line-height: 1.5;
  }

  #${DIALOG_ID} .tos-warnings li:last-child {
    margin-bottom: 0;
  }

  #${DIALOG_ID} .tos-checkbox-container {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 20px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
  }

  #${DIALOG_ID} .tos-checkbox {
    width: 20px;
    height: 20px;
    margin-top: 2px;
    cursor: pointer;
  }

  #${DIALOG_ID} .tos-checkbox-label {
    color: #333;
    font-size: 14px;
    line-height: 1.5;
    cursor: pointer;
  }

  #${DIALOG_ID} .tos-buttons {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  #${DIALOG_ID} .tos-button {
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
  }

  #${DIALOG_ID} .tos-button--decline {
    background: #e9ecef;
    color: #495057;
  }

  #${DIALOG_ID} .tos-button--decline:hover {
    background: #dee2e6;
  }

  #${DIALOG_ID} .tos-button--accept {
    background: #0066cc;
    color: #ffffff;
  }

  #${DIALOG_ID} .tos-button--accept:hover:not(:disabled) {
    background: #0052a3;
  }

  #${DIALOG_ID} .tos-button--accept:disabled {
    background: #ccc;
    color: #666;
    cursor: not-allowed;
  }
`;

// ============================================================================
// Dialog Implementation
// ============================================================================

/**
 * Show the ToS warning dialog
 */
export function showTosWarningDialog(options: TosDialogOptions): void {
  const { providerType, onAccept, onDecline } = options;
  const texts = TEXTS[providerType];
  
  // Remove existing dialog if any
  removeDialog();
  
  // Inject styles
  injectStyles();
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  
  // Create dialog
  const dialog = document.createElement('div');
  dialog.id = DIALOG_ID;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-labelledby', 'tos-title');
  dialog.setAttribute('aria-modal', 'true');
  
  // Build dialog content using DOM APIs (Trusted Types compliant)
  // Title
  const title = document.createElement('h2');
  title.className = 'tos-title';
  title.id = 'tos-title';
  title.textContent = texts.title;
  dialog.appendChild(title);

  // Warnings container
  const warningsDiv = document.createElement('div');
  warningsDiv.className = 'tos-warnings';
  const warningsList = document.createElement('ul');
  texts.warnings.forEach(warning => {
    const li = document.createElement('li');
    li.textContent = warning;
    warningsList.appendChild(li);
  });
  warningsDiv.appendChild(warningsList);
  dialog.appendChild(warningsDiv);

  // Checkbox container
  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'tos-checkbox-container';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'tos-accept-checkbox';
  checkbox.className = 'tos-checkbox';
  checkboxContainer.appendChild(checkbox);

  const checkboxLabel = document.createElement('label');
  checkboxLabel.htmlFor = 'tos-accept-checkbox';
  checkboxLabel.className = 'tos-checkbox-label';
  checkboxLabel.textContent = texts.checkboxLabel;
  checkboxContainer.appendChild(checkboxLabel);

  dialog.appendChild(checkboxContainer);

  // Buttons container
  const buttonsDiv = document.createElement('div');
  buttonsDiv.className = 'tos-buttons';

  const declineButton = document.createElement('button');
  declineButton.type = 'button';
  declineButton.className = 'tos-button tos-button--decline';
  declineButton.textContent = texts.declineButton;
  buttonsDiv.appendChild(declineButton);

  const acceptButton = document.createElement('button');
  acceptButton.type = 'button';
  acceptButton.className = 'tos-button tos-button--accept';
  acceptButton.disabled = true;
  acceptButton.textContent = texts.acceptButton;
  buttonsDiv.appendChild(acceptButton);

  dialog.appendChild(buttonsDiv);
  
  // Wire up checkbox
  checkbox.addEventListener('change', () => {
    acceptButton.disabled = !checkbox.checked;
  });
  
  // Wire up buttons
  acceptButton.addEventListener('click', () => {
    removeDialog();
    onAccept();
  });
  
  declineButton.addEventListener('click', () => {
    removeDialog();
    onDecline();
  });
  
  // Handle escape key
  const handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      removeDialog();
      onDecline();
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Store escape handler for cleanup
  overlay.dataset.escapeHandler = 'true';
  (overlay as HTMLElement & { escapeHandler?: (e: KeyboardEvent) => void }).escapeHandler = handleEscape;
  
  // Add to DOM
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  
  // Focus checkbox for accessibility
  checkbox.focus();
}

/**
 * Remove the dialog from DOM
 */
function removeDialog(): void {
  const overlay = document.getElementById(OVERLAY_ID) as HTMLElement & { escapeHandler?: (e: KeyboardEvent) => void } | null;
  
  if (overlay) {
    // Remove escape handler
    if (overlay.escapeHandler) {
      document.removeEventListener('keydown', overlay.escapeHandler);
    }
    overlay.remove();
  }
  
  // Remove styles
  const styleElement = document.getElementById('ai-subtitle-tos-styles');
  if (styleElement) {
    styleElement.remove();
  }
}

/**
 * Inject dialog styles
 */
function injectStyles(): void {
  if (document.getElementById('ai-subtitle-tos-styles')) {
    return;
  }
  
  const styleElement = document.createElement('style');
  styleElement.id = 'ai-subtitle-tos-styles';
  styleElement.textContent = DIALOG_STYLES;
  document.head.appendChild(styleElement);
}

/**
 * Check if dialog is currently shown
 */
export function isTosDialogVisible(): boolean {
  return document.getElementById(OVERLAY_ID) !== null;
}
