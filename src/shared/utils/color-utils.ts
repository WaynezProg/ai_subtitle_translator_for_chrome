/**
 * Color utilities for theme/styling
 * Provides color parsing, conversion, manipulation, and accessibility helpers
 */

// ============================================================================
// Types
// ============================================================================

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface RGBA extends RGB {
  a: number; // 0-1
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface HSLA extends HSL {
  a: number; // 0-1
}

export interface HSV {
  h: number; // 0-360
  s: number; // 0-100
  v: number; // 0-100
}

export type ColorFormat = 'hex' | 'hex8' | 'rgb' | 'rgba' | 'hsl' | 'hsla';

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse hex color string to RGB
 */
export function parseHex(hex: string): RGB | null {
  const cleanHex = hex.replace('#', '');

  if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
    return null;
  }

  let r: number, g: number, b: number;

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  } else {
    return null;
  }

  return { r, g, b };
}

/**
 * Parse hex color with alpha to RGBA
 */
export function parseHex8(hex: string): RGBA | null {
  const cleanHex = hex.replace('#', '');

  if (!/^[0-9A-Fa-f]+$/.test(cleanHex)) {
    return null;
  }

  if (cleanHex.length === 8) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const a = parseInt(cleanHex.slice(6, 8), 16) / 255;
    return { r, g, b, a };
  }

  if (cleanHex.length === 4) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    const a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
    return { r, g, b, a };
  }

  // Fall back to parsing as regular hex
  const rgb = parseHex(hex);
  return rgb ? { ...rgb, a: 1 } : null;
}

/**
 * Parse rgb/rgba string to RGBA
 */
export function parseRgb(str: string): RGBA | null {
  const rgbaMatch = str.match(
    /rgba?\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,\s*([\d.]+))?\s*\)/i
  );

  if (!rgbaMatch) {
    return null;
  }

  const r = Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10)));
  const g = Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10)));
  const b = Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10)));
  const a = rgbaMatch[4] !== undefined
    ? Math.min(1, Math.max(0, parseFloat(rgbaMatch[4])))
    : 1;

  return { r, g, b, a };
}

/**
 * Parse hsl/hsla string to HSLA
 */
export function parseHsl(str: string): HSLA | null {
  const hslaMatch = str.match(
    /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*(?:,\s*([\d.]+))?\s*\)/i
  );

  if (!hslaMatch) {
    return null;
  }

  const h = parseFloat(hslaMatch[1]) % 360;
  const s = Math.min(100, Math.max(0, parseFloat(hslaMatch[2])));
  const l = Math.min(100, Math.max(0, parseFloat(hslaMatch[3])));
  const a = hslaMatch[4] !== undefined
    ? Math.min(1, Math.max(0, parseFloat(hslaMatch[4])))
    : 1;

  return { h, s, l, a };
}

/**
 * Parse any color string to RGBA
 */
export function parseColor(color: string): RGBA | null {
  const trimmed = color.trim().toLowerCase();

  // Try named colors first
  const named = NAMED_COLORS[trimmed as keyof typeof NAMED_COLORS];
  if (named) {
    const rgb = parseHex(named);
    return rgb ? { ...rgb, a: 1 } : null;
  }

  // Try hex
  if (trimmed.startsWith('#')) {
    return parseHex8(trimmed);
  }

  // Try rgb/rgba
  if (trimmed.startsWith('rgb')) {
    return parseRgb(trimmed);
  }

  // Try hsl/hsla
  if (trimmed.startsWith('hsl')) {
    const hsla = parseHsl(trimmed);
    if (hsla) {
      const rgb = hslToRgb(hsla);
      return { ...rgb, a: hsla.a };
    }
  }

  return null;
}

// ============================================================================
// Conversion
// ============================================================================

/**
 * Convert RGB to hex string
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * Convert RGBA to hex8 string
 */
export function rgbaToHex8(rgba: RGBA): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const alphaHex = toHex(rgba.a * 255);
  return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}${alphaHex}`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Convert RGB to HSV
 */
export function rgbToHsv(rgb: RGB): HSV {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  };
}

/**
 * Convert HSV to RGB
 */
export function hsvToRgb(hsv: HSV): RGB {
  const h = hsv.h / 360;
  const s = hsv.s / 100;
  const v = hsv.v / 100;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r: number, g: number, b: number;

  switch (i % 6) {
    case 0:
      r = v; g = t; b = p;
      break;
    case 1:
      r = q; g = v; b = p;
      break;
    case 2:
      r = p; g = v; b = t;
      break;
    case 3:
      r = p; g = q; b = v;
      break;
    case 4:
      r = t; g = p; b = v;
      break;
    default:
      r = v; g = p; b = q;
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format RGB as CSS rgb() string
 */
export function formatRgb(rgb: RGB): string {
  return `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
}

/**
 * Format RGBA as CSS rgba() string
 */
export function formatRgba(rgba: RGBA): string {
  return `rgba(${Math.round(rgba.r)}, ${Math.round(rgba.g)}, ${Math.round(rgba.b)}, ${rgba.a})`;
}

/**
 * Format HSL as CSS hsl() string
 */
export function formatHsl(hsl: HSL): string {
  return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
}

/**
 * Format HSLA as CSS hsla() string
 */
export function formatHsla(hsla: HSLA): string {
  return `hsla(${Math.round(hsla.h)}, ${Math.round(hsla.s)}%, ${Math.round(hsla.l)}%, ${hsla.a})`;
}

/**
 * Format color in specified format
 */
export function formatColor(color: RGBA, format: ColorFormat): string {
  switch (format) {
    case 'hex':
      return rgbToHex(color);
    case 'hex8':
      return rgbaToHex8(color);
    case 'rgb':
      return formatRgb(color);
    case 'rgba':
      return formatRgba(color);
    case 'hsl':
      return formatHsl(rgbToHsl(color));
    case 'hsla':
      const hsl = rgbToHsl(color);
      return formatHsla({ ...hsl, a: color.a });
    default:
      return rgbToHex(color);
  }
}

// ============================================================================
// Manipulation
// ============================================================================

/**
 * Lighten a color by percentage
 */
export function lighten(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  hsl.l = Math.min(100, hsl.l + amount);
  return hslToRgb(hsl);
}

/**
 * Darken a color by percentage
 */
export function darken(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  hsl.l = Math.max(0, hsl.l - amount);
  return hslToRgb(hsl);
}

/**
 * Saturate a color by percentage
 */
export function saturate(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  hsl.s = Math.min(100, hsl.s + amount);
  return hslToRgb(hsl);
}

/**
 * Desaturate a color by percentage
 */
export function desaturate(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  hsl.s = Math.max(0, hsl.s - amount);
  return hslToRgb(hsl);
}

/**
 * Adjust hue by degrees
 */
export function adjustHue(color: RGB, degrees: number): RGB {
  const hsl = rgbToHsl(color);
  hsl.h = (hsl.h + degrees) % 360;
  if (hsl.h < 0) hsl.h += 360;
  return hslToRgb(hsl);
}

/**
 * Invert a color
 */
export function invert(color: RGB): RGB {
  return {
    r: 255 - color.r,
    g: 255 - color.g,
    b: 255 - color.b,
  };
}

/**
 * Convert to grayscale
 */
export function grayscale(color: RGB): RGB {
  // Using luminosity method
  const gray = Math.round(0.299 * color.r + 0.587 * color.g + 0.114 * color.b);
  return { r: gray, g: gray, b: gray };
}

/**
 * Get complement color
 */
export function complement(color: RGB): RGB {
  return adjustHue(color, 180);
}

/**
 * Set alpha value
 */
export function setAlpha(color: RGB | RGBA, alpha: number): RGBA {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: Math.max(0, Math.min(1, alpha)),
  };
}

/**
 * Mix two colors
 */
export function mix(color1: RGB, color2: RGB, weight: number = 0.5): RGB {
  const w = Math.max(0, Math.min(1, weight));
  return {
    r: Math.round(color1.r * (1 - w) + color2.r * w),
    g: Math.round(color1.g * (1 - w) + color2.g * w),
    b: Math.round(color1.b * (1 - w) + color2.b * w),
  };
}

/**
 * Blend two colors with alpha
 */
export function blend(background: RGB, foreground: RGBA): RGB {
  const a = foreground.a;
  return {
    r: Math.round(foreground.r * a + background.r * (1 - a)),
    g: Math.round(foreground.g * a + background.g * (1 - a)),
    b: Math.round(foreground.b * a + background.b * (1 - a)),
  };
}

// ============================================================================
// Accessibility
// ============================================================================

/**
 * Calculate relative luminance (WCAG 2.1)
 */
export function getLuminance(color: RGB): number {
  const sRGB = [color.r, color.g, color.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculate contrast ratio between two colors (WCAG 2.1)
 */
export function getContrastRatio(color1: RGB, color2: RGB): number {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast meets WCAG AA standard (4.5:1 for normal text)
 */
export function meetsContrastAA(
  foreground: RGB,
  background: RGB,
  largeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return largeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Check if contrast meets WCAG AAA standard (7:1 for normal text)
 */
export function meetsContrastAAA(
  foreground: RGB,
  background: RGB,
  largeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return largeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Get WCAG contrast level
 */
export function getContrastLevel(
  foreground: RGB,
  background: RGB,
  largeText: boolean = false
): 'AAA' | 'AA' | 'FAIL' {
  if (meetsContrastAAA(foreground, background, largeText)) return 'AAA';
  if (meetsContrastAA(foreground, background, largeText)) return 'AA';
  return 'FAIL';
}

/**
 * Determine if color is light or dark
 */
export function isLight(color: RGB): boolean {
  return getLuminance(color) > 0.179;
}

/**
 * Determine if color is dark
 */
export function isDark(color: RGB): boolean {
  return !isLight(color);
}

/**
 * Get best contrasting text color (black or white)
 */
export function getContrastingTextColor(background: RGB): RGB {
  return isLight(background)
    ? { r: 0, g: 0, b: 0 }
    : { r: 255, g: 255, b: 255 };
}

/**
 * Find optimal text color for accessibility
 */
export function findAccessibleColor(
  foreground: RGB,
  background: RGB,
  level: 'AA' | 'AAA' = 'AA'
): RGB {
  const targetRatio = level === 'AAA' ? 7 : 4.5;
  const currentRatio = getContrastRatio(foreground, background);

  if (currentRatio >= targetRatio) {
    return foreground;
  }

  // Determine whether to lighten or darken
  const bgLight = isLight(background);
  const adjustFn = bgLight ? darken : lighten;

  let adjusted = { ...foreground };
  let step = 5;
  let iterations = 0;
  const maxIterations = 20;

  while (getContrastRatio(adjusted, background) < targetRatio && iterations < maxIterations) {
    adjusted = adjustFn(adjusted, step);
    iterations++;
  }

  return adjusted;
}

// ============================================================================
// Color Schemes
// ============================================================================

/**
 * Generate analogous colors
 */
export function analogous(color: RGB, count: number = 3): RGB[] {
  const step = 30;
  const colors: RGB[] = [];
  const startAngle = -((count - 1) / 2) * step;

  for (let i = 0; i < count; i++) {
    colors.push(adjustHue(color, startAngle + i * step));
  }

  return colors;
}

/**
 * Generate triadic colors
 */
export function triadic(color: RGB): [RGB, RGB, RGB] {
  return [color, adjustHue(color, 120), adjustHue(color, 240)];
}

/**
 * Generate tetradic (square) colors
 */
export function tetradic(color: RGB): [RGB, RGB, RGB, RGB] {
  return [
    color,
    adjustHue(color, 90),
    adjustHue(color, 180),
    adjustHue(color, 270),
  ];
}

/**
 * Generate split-complementary colors
 */
export function splitComplementary(color: RGB): [RGB, RGB, RGB] {
  return [color, adjustHue(color, 150), adjustHue(color, 210)];
}

/**
 * Generate monochromatic palette
 */
export function monochromatic(color: RGB, count: number = 5): RGB[] {
  const hsl = rgbToHsl(color);
  const colors: RGB[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    colors.push(hslToRgb({ ...hsl, l: step * i }));
  }

  return colors;
}

/**
 * Generate shades (darker variations)
 */
export function shades(color: RGB, count: number = 5): RGB[] {
  const colors: RGB[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    colors.push(darken(color, step * i));
  }

  return colors;
}

/**
 * Generate tints (lighter variations)
 */
export function tints(color: RGB, count: number = 5): RGB[] {
  const colors: RGB[] = [];
  const step = 100 / (count + 1);

  for (let i = 1; i <= count; i++) {
    colors.push(lighten(color, step * i));
  }

  return colors;
}

// ============================================================================
// Named Colors
// ============================================================================

const NAMED_COLORS = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
  transparent: '#00000000',
} as const;

/**
 * Get named color hex value
 */
export function getNamedColor(name: string): string | null {
  const lower = name.toLowerCase();
  return NAMED_COLORS[lower as keyof typeof NAMED_COLORS] ?? null;
}

/**
 * Check if string is a valid named color
 */
export function isNamedColor(name: string): boolean {
  return name.toLowerCase() in NAMED_COLORS;
}

/**
 * Get all named color names
 */
export function getNamedColorNames(): string[] {
  return Object.keys(NAMED_COLORS);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if two colors are equal
 */
export function colorsEqual(color1: RGB, color2: RGB): boolean {
  return color1.r === color2.r && color1.g === color2.g && color1.b === color2.b;
}

/**
 * Calculate color distance (simple Euclidean)
 */
export function colorDistance(color1: RGB, color2: RGB): number {
  const dr = color1.r - color2.r;
  const dg = color1.g - color2.g;
  const db = color1.b - color2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Generate random color
 */
export function randomColor(): RGB {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  };
}

/**
 * Generate random pastel color
 */
export function randomPastel(): RGB {
  return {
    r: Math.floor(Math.random() * 128 + 127),
    g: Math.floor(Math.random() * 128 + 127),
    b: Math.floor(Math.random() * 128 + 127),
  };
}

/**
 * Clamp RGB values to valid range
 */
export function clampRgb(color: RGB): RGB {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r))),
    g: Math.max(0, Math.min(255, Math.round(color.g))),
    b: Math.max(0, Math.min(255, Math.round(color.b))),
  };
}
