/**
 * Subtitle Download Utility
 *
 * Provides functionality to download subtitles as SRT files.
 */

import type { Cue } from '../types/subtitle';
import {
  generateSRT,
  generateSubtitleFilename,
  type SRTGenerationMode,
} from './srt-generator';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for subtitle download
 */
export interface SubtitleDownloadOptions {
  /** Cues to download */
  cues: Cue[];
  /** Download mode */
  mode: SRTGenerationMode;
  /** Video title (for filename) */
  videoTitle?: string;
  /** Video ID (fallback for filename) */
  videoId: string;
  /** Source language code */
  sourceLanguage: string;
  /** Target language code (for translated/bilingual modes) */
  targetLanguage?: string;
}

/**
 * Result of download operation
 */
export interface DownloadResult {
  success: boolean;
  filename?: string;
  error?: string;
}

// ============================================================================
// Download Implementation
// ============================================================================

/**
 * Download subtitles as SRT file
 */
export function downloadSubtitleAsSRT(options: SubtitleDownloadOptions): DownloadResult {
  const { cues, mode, videoTitle, videoId, sourceLanguage, targetLanguage } = options;

  // Validate inputs
  if (!cues || cues.length === 0) {
    return {
      success: false,
      error: 'No subtitles available to download',
    };
  }

  // Check if translation is available for translated/bilingual modes
  if (mode === 'translated' || mode === 'bilingual') {
    const hasTranslation = cues.some(cue => cue.translatedText && cue.translatedText.trim().length > 0);
    if (!hasTranslation && mode === 'translated') {
      return {
        success: false,
        error: 'No translated subtitles available',
      };
    }
  }

  try {
    // Generate SRT content
    const content = generateSRT(cues, {
      mode,
      includeBOM: true,
      useWindowsLineEndings: true,
    });

    // Generate filename
    const filename = generateSubtitleFilename(
      videoTitle,
      videoId,
      sourceLanguage,
      targetLanguage,
      mode
    );

    // Trigger download
    triggerDownload(content, filename, 'text/plain;charset=utf-8');

    return {
      success: true,
      filename,
    };
  } catch (error) {
    console.error('[SubtitleDownload] Download failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Trigger file download using Blob URL
 */
function triggerDownload(content: string, filename: string, mimeType: string): void {
  // Create Blob
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  // Create and click download link
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  // Cleanup
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Quick Download Helpers
// ============================================================================

/**
 * Download original subtitles
 */
export function downloadOriginalSubtitle(
  cues: Cue[],
  videoTitle: string | undefined,
  videoId: string,
  sourceLanguage: string
): DownloadResult {
  return downloadSubtitleAsSRT({
    cues,
    mode: 'original',
    videoTitle,
    videoId,
    sourceLanguage,
  });
}

/**
 * Download translated subtitles
 */
export function downloadTranslatedSubtitle(
  cues: Cue[],
  videoTitle: string | undefined,
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string
): DownloadResult {
  return downloadSubtitleAsSRT({
    cues,
    mode: 'translated',
    videoTitle,
    videoId,
    sourceLanguage,
    targetLanguage,
  });
}

/**
 * Download bilingual subtitles
 */
export function downloadBilingualSubtitle(
  cues: Cue[],
  videoTitle: string | undefined,
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string
): DownloadResult {
  return downloadSubtitleAsSRT({
    cues,
    mode: 'bilingual',
    videoTitle,
    videoId,
    sourceLanguage,
    targetLanguage,
  });
}
