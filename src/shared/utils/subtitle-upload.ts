/**
 * Subtitle Upload Utility
 *
 * Provides functionality to upload and parse SRT files,
 * mapping them to existing subtitle cues as translations.
 */

import type { Cue } from '../types/subtitle';
import { parseSRT, isValidSRT, SRTParseError } from '../parsers/srt-parser';

// ============================================================================
// Types
// ============================================================================

/**
 * Upload error codes
 */
export type UploadErrorCode =
  | 'INVALID_FILE_TYPE'
  | 'FILE_READ_ERROR'
  | 'PARSE_ERROR'
  | 'EMPTY_FILE'
  | 'NO_CUES_FOUND';

/**
 * Upload error
 */
export class SubtitleUploadError extends Error {
  constructor(
    public code: UploadErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SubtitleUploadError';
  }
}

/**
 * Result of subtitle upload
 */
export interface UploadResult {
  success: boolean;
  /** Parsed cues from uploaded file */
  uploadedCues?: Cue[];
  /** Warning message (e.g., cue count mismatch) */
  warning?: string;
  /** Error details */
  error?: {
    code: UploadErrorCode;
    message: string;
  };
}

/**
 * Result of mapping uploaded cues to original cues
 */
export interface MappingResult {
  /** Original cues with translatedText filled from uploaded cues */
  mappedCues: Cue[];
  /** Number of cues that were successfully mapped */
  mappedCount: number;
  /** Number of original cues */
  originalCount: number;
  /** Number of uploaded cues */
  uploadedCount: number;
  /** Warning if counts don't match */
  warning?: string;
}

// ============================================================================
// File Reading
// ============================================================================

/**
 * Read file content as text
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new SubtitleUploadError('FILE_READ_ERROR', 'Failed to read file as text'));
      }
    };

    reader.onerror = () => {
      reject(new SubtitleUploadError('FILE_READ_ERROR', 'Error reading file'));
    };

    reader.readAsText(file, 'UTF-8');
  });
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate uploaded file
 */
export function validateUploadedFile(file: File): void {
  // Check file extension
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension !== 'srt') {
    throw new SubtitleUploadError(
      'INVALID_FILE_TYPE',
      `Invalid file type: .${extension}. Please upload a .srt file.`
    );
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new SubtitleUploadError(
      'INVALID_FILE_TYPE',
      'File is too large. Maximum size is 10MB.'
    );
  }
}

// ============================================================================
// Upload Processing
// ============================================================================

/**
 * Process uploaded SRT file
 */
export async function processUploadedSRT(file: File): Promise<UploadResult> {
  try {
    // Validate file
    validateUploadedFile(file);

    // Read file content
    const content = await readFileAsText(file);

    if (!content.trim()) {
      return {
        success: false,
        error: {
          code: 'EMPTY_FILE',
          message: 'The uploaded file is empty.',
        },
      };
    }

    // Validate SRT format
    if (!isValidSRT(content)) {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Invalid SRT format. Please check the file format.',
        },
      };
    }

    // Parse SRT content
    const parseResult = parseSRT(content);

    if (parseResult.cues.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_CUES_FOUND',
          message: 'No subtitle cues found in the uploaded file.',
        },
      };
    }

    return {
      success: true,
      uploadedCues: parseResult.cues,
    };
  } catch (error) {
    if (error instanceof SubtitleUploadError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      };
    }

    if (error instanceof SRTParseError) {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: error.message,
        },
      };
    }

    console.error('[SubtitleUpload] Unexpected error:', error);
    return {
      success: false,
      error: {
        code: 'FILE_READ_ERROR',
        message: 'An unexpected error occurred while processing the file.',
      },
    };
  }
}

// ============================================================================
// Cue Mapping
// ============================================================================

/**
 * Map uploaded cues to original cues as translations
 *
 * Strategy:
 * 1. If cue counts match, map by index
 * 2. If counts differ, try to map by timing (find closest match)
 */
export function mapUploadedCuesToOriginal(
  originalCues: Cue[],
  uploadedCues: Cue[]
): MappingResult {
  const originalCount = originalCues.length;
  const uploadedCount = uploadedCues.length;

  // Create a copy of original cues to modify
  const mappedCues: Cue[] = originalCues.map(cue => ({ ...cue }));

  let mappedCount = 0;
  let warning: string | undefined;

  if (originalCount === uploadedCount) {
    // Perfect match - map by index
    for (let i = 0; i < originalCount; i++) {
      mappedCues[i].translatedText = uploadedCues[i].text;
      mappedCount++;
    }
  } else {
    // Count mismatch - map by timing
    warning = `Cue count mismatch: original has ${originalCount} cues, uploaded has ${uploadedCount} cues. Mapping by timing.`;

    for (let i = 0; i < originalCount; i++) {
      const original = mappedCues[i];
      const matchingUploaded = findClosestCueByTiming(original, uploadedCues);

      if (matchingUploaded) {
        original.translatedText = matchingUploaded.text;
        mappedCount++;
      }
    }
  }

  return {
    mappedCues,
    mappedCount,
    originalCount,
    uploadedCount,
    warning,
  };
}

/**
 * Find the closest uploaded cue by timing
 * Uses a larger tolerance to handle timing differences between ASR and manual subtitles
 */
function findClosestCueByTiming(original: Cue, uploadedCues: Cue[]): Cue | null {
  // Tolerance: 2000ms (2 seconds) to handle ASR timing differences
  const tolerance = 2000;

  let bestMatch: Cue | null = null;
  let bestDiff = Infinity;

  for (const uploaded of uploadedCues) {
    const startDiff = Math.abs(original.startTime - uploaded.startTime);

    if (startDiff < bestDiff && startDiff <= tolerance) {
      bestDiff = startDiff;
      bestMatch = uploaded;
    }
  }

  return bestMatch;
}

// ============================================================================
// High-Level Upload Function
// ============================================================================

/**
 * Upload and map SRT file to existing cues
 */
export async function uploadAndMapSubtitle(
  file: File,
  originalCues: Cue[]
): Promise<{
  success: boolean;
  mappedCues?: Cue[];
  mappedCount?: number;
  warning?: string;
  error?: { code: UploadErrorCode; message: string };
}> {
  // Process uploaded file
  const uploadResult = await processUploadedSRT(file);

  if (!uploadResult.success || !uploadResult.uploadedCues) {
    return {
      success: false,
      error: uploadResult.error,
    };
  }

  // Map to original cues
  const mappingResult = mapUploadedCuesToOriginal(originalCues, uploadResult.uploadedCues);

  return {
    success: true,
    mappedCues: mappingResult.mappedCues,
    mappedCount: mappingResult.mappedCount,
    warning: mappingResult.warning,
  };
}
