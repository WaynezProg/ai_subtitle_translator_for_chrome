/**
 * Tests for Subtitle Content Sanitizer
 */

import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  unescapeHtml,
  stripHtmlTags,
  removeDangerousPatterns,
  sanitizeCssValue,
  sanitizeStyle,
  sanitizeSubtitleText,
  sanitizeSubtitleCues,
  sanitizeVttCue,
  sanitizePlainText,
  sanitizeForDom,
  sanitizeTranslation,
  containsDangerousContent,
  isSubtitleTextSafe,
  detectThreats,
} from '@shared/utils/subtitle-sanitizer';

// ============================================================================
// escapeHtml Tests
// ============================================================================

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('should escape quotes', () => {
    expect(escapeHtml("It's a \"test\"")).toBe("It&#x27;s a &quot;test&quot;");
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not modify safe text', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
});

// ============================================================================
// unescapeHtml Tests
// ============================================================================

describe('unescapeHtml', () => {
  it('should unescape HTML entities', () => {
    expect(unescapeHtml('&lt;div&gt;')).toBe('<div>');
    expect(unescapeHtml('&amp;')).toBe('&');
    expect(unescapeHtml('&quot;test&quot;')).toBe('"test"');
  });

  it('should handle nbsp', () => {
    expect(unescapeHtml('hello&nbsp;world')).toBe('hello world');
  });
});

// ============================================================================
// stripHtmlTags Tests
// ============================================================================

describe('stripHtmlTags', () => {
  it('should remove all HTML tags', () => {
    expect(stripHtmlTags('<p>Hello <b>World</b></p>')).toBe('Hello World');
  });

  it('should handle self-closing tags', () => {
    expect(stripHtmlTags('Line 1<br/>Line 2')).toBe('Line 1Line 2');
  });

  it('should handle nested tags', () => {
    expect(stripHtmlTags('<div><span>Text</span></div>')).toBe('Text');
  });

  it('should preserve text without tags', () => {
    expect(stripHtmlTags('No tags here')).toBe('No tags here');
  });
});

// ============================================================================
// removeDangerousPatterns Tests
// ============================================================================

describe('removeDangerousPatterns', () => {
  it('should remove script tags', () => {
    const result = removeDangerousPatterns('<script>alert("xss")</script>Hello');
    expect(result.text).toBe('Hello');
    expect(result.removed.length).toBeGreaterThan(0);
  });

  it('should remove event handlers', () => {
    const result = removeDangerousPatterns('<img src="x" onerror="alert(1)">');
    expect(result.text).not.toContain('onerror');
  });

  it('should remove javascript URLs', () => {
    const result = removeDangerousPatterns('<a href="javascript:alert(1)">Click</a>');
    expect(result.text).not.toContain('javascript:');
  });

  it('should remove iframes', () => {
    const result = removeDangerousPatterns('<iframe src="evil.com"></iframe>Text');
    expect(result.text).toBe('Text');
  });

  it('should remove SVG', () => {
    const result = removeDangerousPatterns('<svg onload="alert(1)"></svg>Safe');
    expect(result.text).toBe('Safe');
  });

  it('should remove HTML comments', () => {
    const result = removeDangerousPatterns('Hello<!--<script>evil()</script>-->World');
    expect(result.text).toBe('HelloWorld');
  });

  it('should handle clean text', () => {
    const result = removeDangerousPatterns('Hello World');
    expect(result.text).toBe('Hello World');
    expect(result.removed).toHaveLength(0);
  });
});

// ============================================================================
// sanitizeCssValue Tests
// ============================================================================

describe('sanitizeCssValue', () => {
  it('should allow safe CSS properties', () => {
    expect(sanitizeCssValue('color', 'red')).toBe('red');
    expect(sanitizeCssValue('font-weight', 'bold')).toBe('bold');
  });

  it('should reject unsafe CSS properties', () => {
    expect(sanitizeCssValue('position', 'absolute')).toBeNull();
    expect(sanitizeCssValue('z-index', '9999')).toBeNull();
  });

  it('should reject javascript in values', () => {
    expect(sanitizeCssValue('color', 'javascript:alert(1)')).toBeNull();
  });

  it('should reject expression in values', () => {
    expect(sanitizeCssValue('color', 'expression(alert(1))')).toBeNull();
  });

  it('should reject url in values', () => {
    expect(sanitizeCssValue('background-color', 'url(evil.com)')).toBeNull();
  });
});

// ============================================================================
// sanitizeStyle Tests
// ============================================================================

describe('sanitizeStyle', () => {
  it('should keep safe styles', () => {
    const result = sanitizeStyle('color: red; font-weight: bold');
    expect(result).toContain('color: red');
    expect(result).toContain('font-weight: bold');
  });

  it('should remove unsafe styles', () => {
    const result = sanitizeStyle('color: red; position: absolute; z-index: 9999');
    expect(result).toContain('color: red');
    expect(result).not.toContain('position');
    expect(result).not.toContain('z-index');
  });

  it('should handle empty style', () => {
    expect(sanitizeStyle('')).toBe('');
  });
});

// ============================================================================
// sanitizeSubtitleText Tests
// ============================================================================

describe('sanitizeSubtitleText', () => {
  describe('basic sanitization', () => {
    it('should preserve safe text', () => {
      const result = sanitizeSubtitleText('Hello World');
      expect(result.text).toBe('Hello World');
      expect(result.wasModified).toBe(false);
    });

    it('should remove script tags', () => {
      const result = sanitizeSubtitleText('Hello<script>evil()</script>World');
      expect(result.text).toBe('HelloWorld');
      expect(result.wasModified).toBe(true);
    });

    it('should normalize whitespace', () => {
      const result = sanitizeSubtitleText('  Hello   World  ');
      expect(result.text).toBe('Hello World');
    });
  });

  describe('formatting preservation', () => {
    it('should preserve bold tags when allowed', () => {
      const result = sanitizeSubtitleText('<b>Bold</b>', { allowFormatting: true });
      expect(result.text).toBe('<b>Bold</b>');
    });

    it('should preserve italic tags when allowed', () => {
      const result = sanitizeSubtitleText('<i>Italic</i>', { allowFormatting: true });
      expect(result.text).toBe('<i>Italic</i>');
    });

    it('should strip formatting when not allowed', () => {
      const result = sanitizeSubtitleText('<b>Bold</b>', { allowFormatting: false });
      expect(result.text).toBe('Bold');
    });

    it('should preserve br tags', () => {
      const result = sanitizeSubtitleText('Line 1<br>Line 2', { allowFormatting: true });
      expect(result.text).toBe('Line 1<br>Line 2');
    });
  });

  describe('dangerous content removal', () => {
    it('should remove onclick handlers', () => {
      const result = sanitizeSubtitleText('<span onclick="evil()">Click</span>');
      expect(result.text).not.toContain('onclick');
    });

    it('should remove nested script tags', () => {
      const result = sanitizeSubtitleText(
        '<div><script>alert(1)</script></div>Text'
      );
      expect(result.text).not.toContain('script');
    });

    it('should remove data URLs', () => {
      const result = sanitizeSubtitleText('<img src="data:text/html,<script>alert(1)</script>">');
      expect(result.text).not.toContain('data:');
    });
  });

  describe('options', () => {
    it('should strip all HTML when requested', () => {
      const result = sanitizeSubtitleText('<b>Bold</b> and <i>Italic</i>', {
        stripAllHtml: true,
      });
      expect(result.text).toBe('Bold and Italic');
    });

    it('should truncate to maxLength', () => {
      const result = sanitizeSubtitleText('Hello World', { maxLength: 5 });
      expect(result.text).toBe('Hello');
      expect(result.wasModified).toBe(true);
    });

    it('should allow colors when enabled', () => {
      const result = sanitizeSubtitleText(
        '<span style="color: red">Red</span>',
        { allowFormatting: true, allowColors: true }
      );
      expect(result.text).toContain('color');
    });
  });
});

// ============================================================================
// sanitizeSubtitleCues Tests
// ============================================================================

describe('sanitizeSubtitleCues', () => {
  it('should sanitize all cues', () => {
    const cues = [
      { text: 'Normal text', startTime: 0, endTime: 1000 },
      { text: '<script>evil()</script>Cleaned', startTime: 1000, endTime: 2000 },
      { text: '<b>Bold</b>', startTime: 2000, endTime: 3000 },
    ];

    const result = sanitizeSubtitleCues(cues);

    expect(result.cues[0].text).toBe('Normal text');
    expect(result.cues[1].text).toBe('Cleaned');
    expect(result.cues[2].text).toBe('<b>Bold</b>');
    expect(result.totalModified).toBe(1);
  });

  it('should preserve cue timing', () => {
    const cues = [{ text: 'Test', startTime: 1000, endTime: 2000 }];
    const result = sanitizeSubtitleCues(cues);

    expect(result.cues[0].startTime).toBe(1000);
    expect(result.cues[0].endTime).toBe(2000);
  });
});

// ============================================================================
// Specialized Sanitizers Tests
// ============================================================================

describe('sanitizeVttCue', () => {
  it('should preserve VTT formatting', () => {
    const result = sanitizeVttCue('<b>Bold</b> <i>Italic</i>');
    expect(result.text).toContain('<b>');
    expect(result.text).toContain('<i>');
  });

  it('should allow color styling', () => {
    const result = sanitizeVttCue('<span style="color: yellow">Text</span>');
    expect(result.text).toContain('color');
  });

  it('should remove dangerous content', () => {
    const result = sanitizeVttCue('<script>alert(1)</script>Safe');
    expect(result.text).toBe('Safe');
  });
});

describe('sanitizePlainText', () => {
  it('should strip all HTML', () => {
    const result = sanitizePlainText('<b>Bold</b> and <script>evil()</script>');
    expect(result.text).toBe('Bold and');
  });

  it('should normalize whitespace', () => {
    const result = sanitizePlainText('Multiple    spaces');
    expect(result.text).toBe('Multiple spaces');
  });
});

describe('sanitizeForDom', () => {
  it('should escape HTML for safe DOM insertion', () => {
    const result = sanitizeForDom('<div onclick="evil()">Content</div>');
    expect(result).not.toContain('<div');
    expect(result).toContain('&lt;');
  });

  it('should remove dangerous patterns before escaping', () => {
    const result = sanitizeForDom('<script>alert(1)</script>');
    expect(result).not.toContain('alert');
  });
});

describe('sanitizeTranslation', () => {
  it('should escape all HTML in translations', () => {
    const result = sanitizeTranslation('Translation with <b>bold</b>');
    expect(result).toContain('&lt;b&gt;');
  });

  it('should remove dangerous content', () => {
    const result = sanitizeTranslation('Text<script>evil()</script>');
    expect(result).toBe('Text');
  });
});

// ============================================================================
// Validation Functions Tests
// ============================================================================

describe('containsDangerousContent', () => {
  it('should detect script tags', () => {
    expect(containsDangerousContent('<script>alert(1)</script>')).toBe(true);
  });

  it('should detect event handlers', () => {
    expect(containsDangerousContent('onclick="evil()"')).toBe(true);
    expect(containsDangerousContent('onerror=alert(1)')).toBe(true);
  });

  it('should detect javascript URLs', () => {
    expect(containsDangerousContent('javascript:alert(1)')).toBe(true);
  });

  it('should return false for safe content', () => {
    expect(containsDangerousContent('Hello World')).toBe(false);
    expect(containsDangerousContent('<b>Bold</b>')).toBe(false);
  });
});

describe('isSubtitleTextSafe', () => {
  it('should return true for safe text', () => {
    expect(isSubtitleTextSafe('Normal subtitle text')).toBe(true);
    expect(isSubtitleTextSafe('<i>Italic</i>')).toBe(true);
  });

  it('should return false for dangerous text', () => {
    expect(isSubtitleTextSafe('<script>alert(1)</script>')).toBe(false);
    expect(isSubtitleTextSafe('<img onerror="evil()">')).toBe(false);
  });
});

describe('detectThreats', () => {
  it('should detect multiple threat types', () => {
    const threats = detectThreats(
      '<script>evil()</script><iframe src="x"></iframe>'
    );
    expect(threats).toContain('script_tag');
    expect(threats).toContain('iframe');
  });

  it('should detect event handlers', () => {
    const threats = detectThreats('<img onerror="alert(1)">');
    expect(threats).toContain('event_handler');
  });

  it('should detect javascript URLs', () => {
    const threats = detectThreats('javascript:alert(1)');
    expect(threats).toContain('javascript_url');
  });

  it('should return empty array for safe text', () => {
    const threats = detectThreats('Safe subtitle text');
    expect(threats).toHaveLength(0);
  });

  it('should detect SVG', () => {
    const threats = detectThreats('<svg onload="evil()"></svg>');
    expect(threats).toContain('svg_tag');
  });

  it('should detect form tags', () => {
    const threats = detectThreats('<form action="evil.com">');
    expect(threats).toContain('form_tag');
  });
});
